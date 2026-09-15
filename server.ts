import express from "express";
import http from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import type { Session } from "@google/genai";
import type { SessionProfile } from "./src/types.ts";
import dotenv from "dotenv";

import {
  type ClientMsg,
  type ServerMsg,
  parseClientMsg,
} from "./shared/protocol.ts";
import { createGeminiSession } from "./server/providers/gemini.ts";
import { RotationState, shouldRotateOnSchedule } from "./server/rotation.ts";
import { StallDetector, SPEECH_RMS, STALL_SPEECH_MS, FIRST_STALL_SPEECH_MS } from "./server/stall.ts";
import { createOpenAISession } from "./server/providers/openai.ts";
import { generateSummary, generateSubject, generateSummaryBundle } from "./server/providers/summary.ts";
import { translateText } from "./server/providers/textTranslate.ts";
import { saveToObsidian } from "./server/obsidian.ts";
import { listSessions, readSession, writeSession, deleteSession } from "./server/sessions.ts";
import { readGlobalCorrections, writeGlobalCorrections } from "./server/corrections.ts";
import { parseRules, serializeRule } from "./shared/corrections.ts";
import { parseSession, serializeSession, serializeSessionSummary, normalizeTags } from "./shared/session.ts";
import { resolveLiveModel } from "./shared/languages.ts";

dotenv.config();

// Paths are resolved from process.cwd() (see the production static handler
// below) — deliberately no import.meta.url here, since esbuild's CJS output
// empties import.meta and the bundle would crash on load.

function send(ws: WebSocket, msg: ServerMsg): void {
  ws.send(JSON.stringify(msg));
}

/** Everything needed to reopen an identical Live session during a rotation. */
interface GeminiParams {
  modelName: string;
  lang: SessionProfile;
  glossary: Array<{ heard: string; meant: string }>;
}

/**
 * Replace the Live session once its context reaches this many tokens. The observed
 * hard ceiling is 8192 input tokens, at which point the API closes the session; the
 * gap leaves room for a usage report to arrive late and for the swap itself.
 */
const ROTATE_AT_TOKENS = 5500;
/**
 * Rotate on a timer as well, since a model that reports no `usageMetadata` would
 * otherwise reach the ceiling unnoticed. Measured deaths came at 7-10 minutes, so
 * five is comfortably inside that. `LIVE_ROTATE_MS` exists because the behaviour it
 * guards against only shows up minutes into a recording — it makes the rotation
 * testable in seconds instead of by sitting through a meeting.
 */
const ROTATE_INTERVAL_MS = Number.parseInt(process.env.LIVE_ROTATE_MS ?? "", 10) > 0
  ? Number.parseInt(process.env.LIVE_ROTATE_MS!, 10)
  : 5 * 60 * 1000;

/**
 * How long a rotated-away session is kept open after the swap so it can flush the
 * transcript it is still holding. The ASR lags the audio it has already received, so
 * closing the old session at the instant of the swap dropped the tail of whatever was
 * being said — invisible to a speaker who pauses at that moment, a lost phrase to one
 * who does not. Long enough for the flush, short enough that two sessions are never
 * both live for meaningfully long.
 */
const ROTATE_FLUSH_MS = 1500;

/**
 * Opt-in relay diagnostic: `LIVE_DEBUG=1`.
 *
 * Answers the one question the client-side `audioDebug` counter cannot. That one
 * proved the browser keeps capturing and sending (captured ≈ wall clock, real pauses
 * in the level stats), yet a transcript still arrived ~90 s late and then in one
 * burst. So the lag is downstream of the browser, and the only way to tell the relay
 * apart from Google's ASR is to count both sides of this process: audio chunks in
 * from the client against transcript deltas out from Gemini. Steady audio with a
 * silent transcript means the wait is inside the ASR and no amount of local tuning
 * will move it.
 */
const LIVE_DEBUG = process.env.LIVE_DEBUG === "1";
const LIVE_DEBUG_INTERVAL_MS = 5000;

/**
 * Unanswered speech after which the Live session is presumed dead and replaced (see
 * server/stall.ts for what makes this measurable at all). `LIVE_STALL_MS` exists for
 * the same reason as `LIVE_ROTATE_MS`: to provoke the behaviour in seconds instead of
 * waiting for the provider to have a bad afternoon.
 */
const STALL_MS = Number.parseInt(process.env.LIVE_STALL_MS ?? "", 10) > 0
  ? Number.parseInt(process.env.LIVE_STALL_MS!, 10)
  : STALL_SPEECH_MS;

/**
 * Flush window for a stall rotation, longer than the ordinary one. A session that
 * went quiet may be dead — in which case the wait costs nothing — or merely far
 * behind, and a lagging session handed `audioStreamEnd` has been seen to dump its
 * whole backlog at once. Give it room to do that before closing it.
 */
const STALL_FLUSH_MS = 5000;

/**
 * The same bar for a session that has not produced a single character yet. Measured:
 * the first session of a recording was dead from birth and cost the first 1:28 of the
 * meeting. "Never worked at all" needs less evidence than "went quiet mid-sentence".
 */
const FIRST_STALL_MS = Number.parseInt(process.env.LIVE_FIRST_STALL_MS ?? "", 10) > 0
  ? Number.parseInt(process.env.LIVE_FIRST_STALL_MS!, 10)
  : FIRST_STALL_SPEECH_MS;

/**
 * A client-supplied date, or now. Used for the Obsidian note's filename and
 * frontmatter, so a garbage value must not become an `Invalid Date`: anything
 * that is not a string parsing to a finite time degrades to the current date.
 */
function parseWhen(value: unknown): Date {
  if (typeof value !== "string") return new Date();
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const openAiApiKey = process.env.OPENAI_API_KEY;

  if (!geminiApiKey) {
    console.warn("⚠️ WARNING: The GEMINI_API_KEY environment variable is missing!");
  } else {
    console.log("✅ GEMINI_API_KEY loaded successfully.");
  }

  if (!openAiApiKey) {
    console.warn("⚠️ WARNING: The OPENAI_API_KEY environment variable is missing (required for OpenAI models).");
  } else {
    console.log("✅ OPENAI_API_KEY loaded successfully.");
  }

  // Session autosave posts the whole transcript each time, so leave room for a
  // long meeting (a few hours of speech is a couple of hundred KB of JSON).
  app.use(express.json({ limit: "8mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", gemini: !!geminiApiKey, openai: !!openAiApiKey });
  });

  // AI summary of a conversation transcript. Provider/key/model are configured
  // via env (SUMMARY_PROVIDER: gemini | openai | ollama) — see summary.ts.
  app.post("/api/summarize", async (req, res) => {
    const transcript = typeof req.body?.transcript === "string" ? req.body.transcript : "";
    if (!transcript.trim()) {
      res.status(400).json({ error: "Empty transcript." });
      return;
    }
    try {
      // Both interface languages plus a short title (which also names the Obsidian
      // note) in ONE request: on a free-tier key the quota is requests per minute,
      // and three parallel calls per click exhausted it. Only what comes back empty
      // is asked for again, so a model that ignores the section headers costs what
      // the old three-call version did instead of failing.
      const bundle = await generateSummaryBundle(transcript);
      const [en, hu] = await Promise.all([
        bundle.en || generateSummary(transcript, "en"),
        bundle.hu || generateSummary(transcript, "hu"),
      ]);
      const subject = bundle.subject
        || await generateSubject(transcript).catch((subjectErr) => {
          console.warn("⚠️ Subject generation failed during summary:", subjectErr);
          return "";
        });
      res.json({ en, hu, subject });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("🔴 Summary error:", err);
      res.status(500).json({ error: msg });
    }
  });

  // Translate one finished transcript segment with a text model. Used by the
  // translated-transcript mode, where the Live model is silenced to avoid paying
  // for generated speech, so the translation happens here instead.
  app.post("/api/translate-text", async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    const sourceLang = typeof req.body?.sourceLang === "string" ? req.body.sourceLang : "";
    const targetLang = typeof req.body?.targetLang === "string" ? req.body.targetLang : "";
    if (!text.trim()) {
      res.status(400).json({ error: "Empty text." });
      return;
    }
    if (!targetLang) {
      res.status(400).json({ error: "Missing targetLang." });
      return;
    }
    try {
      const corrections = parseRules(req.body?.corrections)
        .map((r) => ({ heard: r.heard, meant: r.meant }));
      const translation = await translateText(text, sourceLang || "auto", targetLang, corrections);
      res.json({ translation });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("🔴 Text translation error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // Generate a short, filename-friendly note title from a transcript. Used by
  // the "Save to Obsidian" dialog's "Generate with AI" button.
  app.post("/api/subject", async (req, res) => {
    const transcript = typeof req.body?.transcript === "string" ? req.body.transcript : "";
    if (!transcript.trim()) {
      res.status(400).json({ error: "Empty transcript." });
      return;
    }
    try {
      const subject = await generateSubject(transcript);
      res.json({ subject });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("🔴 Subject generation error:", err);
      res.status(500).json({ error: msg });
    }
  });

  // Save the full transcript into an Obsidian vault as a Markdown note. The
  // client supplies the title (from the AI summary or the save dialog) — the
  // server never auto-generates one here. When `existingPath` points to a note
  // already saved this session, that file is updated in place. The vault
  // location is configured via the OBSIDIAN_VAULT_DIR env var.
  app.post("/api/save-obsidian", async (req, res) => {
    const markdown = typeof req.body?.markdown === "string" ? req.body.markdown : "";
    const subject = typeof req.body?.subject === "string" && req.body.subject.trim()
      ? req.body.subject.trim()
      : "meeting";
    const existingPath = typeof req.body?.existingPath === "string" ? req.body.existingPath : undefined;
    const tags = normalizeTags(req.body?.tags);
    // The recording's own date, so an imported meeting is filed under the day it
    // happened rather than today. Untrusted like every other field here: anything
    // that is not a finite date falls back to now instead of reaching filename
    // construction as an Invalid Date. Ignored when `existingPath` matches a note
    // this app wrote — that path's own date and time are preserved.
    const when = parseWhen(req.body?.when);
    if (!markdown.trim()) {
      res.status(400).json({ error: "Empty transcript." });
      return;
    }
    try {
      const result = await saveToObsidian(markdown, subject, existingPath, when, tags);
      console.log(`💾 Transcript ${result.updated ? "updated in" : "saved to"} Obsidian: ${result.path}`);
      res.json({ path: result.path, subject: result.subject, updated: result.updated });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("🔴 Obsidian save error:", err);
      res.status(500).json({ error: msg });
    }
  });

  // ── Global correction dictionary ────────────────────────────────────────────
  // Rules the user marked as applying to every recording. Sent into the Live
  // session's glossary at start, and applied client-side as substitutions.

  app.get("/api/corrections", async (_req, res) => {
    try {
      const corrections = await readGlobalCorrections();
      res.json({ corrections: corrections.map(serializeRule) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: msg });
    }
  });

  app.put("/api/corrections", async (req, res) => {
    try {
      const saved = await writeGlobalCorrections(parseRules(req.body?.corrections));
      res.json({ corrections: saved.map(serializeRule) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("🔴 Corrections save error:", msg);
      res.status(400).json({ error: msg });
    }
  });

  // ── Session store ───────────────────────────────────────────────────────────
  // Recorded sessions on disk, so a refresh or crash can't lose a meeting. The
  // client autosaves here (debounced) and lists/loads/deletes through the same
  // endpoints. Ids are validated inside server/sessions.ts before any path use.

  app.get("/api/sessions", async (_req, res) => {
    try {
      const sessions = await listSessions();
      res.json({ sessions: sessions.map(serializeSessionSummary) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("🔴 Session list error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const session = await readSession(req.params.id);
      res.json({ session: serializeSession(session) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const missing = (err as { code?: string }).code === "ENOENT";
      res.status(missing ? 404 : 400).json({ error: missing ? "Session not found." : msg });
    }
  });

  const upsertSession: express.RequestHandler = async (req, res) => {
    try {
      const session = parseSession(req.body?.session);
      if (session.id !== req.params.id) {
        res.status(400).json({ error: "Session id does not match the URL." });
        return;
      }
      await writeSession(session);
      res.json({ ok: true, id: session.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("🔴 Session save error:", msg);
      res.status(400).json({ error: msg });
    }
  };

  // PUT is the normal autosave. POST exists for the same handler because
  // navigator.sendBeacon — the only reliable way to save while the page unloads —
  // can issue POST only.
  app.put("/api/sessions/:id", upsertSession);
  app.post("/api/sessions/:id", upsertSession);

  app.delete("/api/sessions/:id", async (req, res) => {
    // Deleting the Obsidian note is opt-in per request; server/sessions.ts refuses
    // anything outside the configured vault and reports it without failing.
    const withNote = req.query.withNote === "true";
    try {
      const result = await deleteSession(req.params.id, withNote);
      if (result.noteDeleted) console.log(`🗑️ Obsidian note deleted: ${result.noteDeleted}`);
      if (result.noteError) console.warn(`⚠️ Obsidian note not deleted: ${result.noteError}`);
      console.log(`🗑️ Session deleted: ${req.params.id}`);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("🔴 Session delete error:", msg);
      res.status(400).json({ error: msg });
    }
  });

  const wss = new WebSocketServer({ server, path: "/api/live-ws" });

  wss.on("connection", (clientWs: WebSocket) => {
    console.log("🔌 New client connected.");
    let geminiSession: Session | null = null;
    let openAiWs: WebSocket | null = null;
    let isClosed = false;
    let turnTimer: ReturnType<typeof setTimeout> | null = null;
    // Rotation state (see rotateGemini): the params needed to reopen the same session,
    // the generation bookkeeping that decides which session may still talk to the
    // client (see RotationState), the session currently flushing its tail, and the
    // backstop timer.
    let geminiParams: GeminiParams | null = null;
    const rot = new RotationState();
    // Does this model report `usageMetadata` at all, and where is the live session's
    // context now? Together they decide whether the backstop timer has any work to do
    // (see shouldRotateOnSchedule). `liveTokens` belongs to the live session, so a
    // rotation resets it — the replacement starts from an empty context.
    let usageReported = false;
    let liveTokens = 0;
    // Relay counters for LIVE_DEBUG (see above). `lastTranscriptAt` is the useful one:
    // it turns "the transcript stopped" into a number of seconds.
    const relayStats = { audioChunks: 0, audioBytes: 0, deltas: 0, chars: 0, lastTranscriptAt: 0 };
    // Speech that has gone up with nothing coming back. Unlike everything else here,
    // this is what actually catches a session that died without saying so.
    const stall = new StallDetector(SPEECH_RMS, STALL_MS, FIRST_STALL_MS);
    let debugTimer: ReturnType<typeof setInterval> | null = null;
    let retiringSession: Session | null = null;
    let retireTimer: ReturnType<typeof setTimeout> | null = null;
    let rotating = false;
    let rotateTimer: ReturnType<typeof setTimeout> | null = null;

    send(clientWs, { type: "status", status: "server-connected" });

    // OpenAI has no explicit turn signal — fire turnComplete after 1.5 s silence.
    const scheduleTurnComplete = () => {
      if (turnTimer) clearTimeout(turnTimer);
      turnTimer = setTimeout(() => {
        if (!isClosed) send(clientWs, { type: "turnComplete" });
      }, 1500);
    };

    /**
     * Open a Gemini Live session for this client. `gen` stamps every callback, so a
     * session that has since been rotated away can be ignored instead of reporting its
     * own close to the client as a lost connection.
     *
     * Two guards, not one: `live` is the session that owns the connection right now,
     * `relay` also includes the one on its way out, which is still holding the tail of
     * the current utterance (see RotationState).
     */
    const openGemini = async (gen: number, announce: boolean): Promise<Session> => {
      const p = geminiParams!;
      const live  = () => rot.isLive(gen) && !isClosed;
      const relay = () => rot.isRelaying(gen) && !isClosed;
      return createGeminiSession(p.modelName, p.lang, geminiApiKey, {
        onConnected:          () => { if (live() && announce) send(clientWs, { type: "status", status: "connected" }); },
        onAudio:              (b) => { if (live()) send(clientWs, { type: "audio", audio: b }); },
        // Transcript text also comes from the retiring session — that tail is speech
        // the replacement never heard, so dropping it leaves a hole in the transcript.
        onTranslation:        (t) => { if (relay()) send(clientWs, { type: "translation", text: t }); },
        onInputTranscription: (t) => {
          if (!relay()) return;
          stall.onTranscript(); // any text at all means the session is alive
          if (LIVE_DEBUG) {
            relayStats.deltas += 1;
            relayStats.chars += t.length;
            relayStats.lastTranscriptAt = Date.now();
          }
          send(clientWs, { type: "inputTranscription", transcript: t });
        },
        onInterrupted:        ()  => { if (live()) send(clientWs, { type: "interrupted" }); },
        // Deliberately live-only: a retiring session's flush ends in a turnComplete,
        // and relaying it would split the sentence being spoken across two cards.
        onTurnComplete:       ()  => { if (live()) send(clientWs, { type: "turnComplete" }); },
        onError:              (e) => { if (live()) send(clientWs, { type: "error", error: e }); },
        onClose:              (r) => {
          if (!live()) return;
          // Drop the handle: a closed session silently swallows everything sent to it,
          // so leaving it in place turns a dead session into a frozen transcript while
          // the client is still streaming audio at it.
          geminiSession = null;
          send(clientWs, { type: "status", status: "disconnected", reason: r });
        },
        // The two reasons a long meeting used to die, now caught before they happen.
        onUsage: (total) => {
          if (!live()) return;
          usageReported = true;
          liveTokens = total;
          if (total >= ROTATE_AT_TOKENS) void rotateGemini(`${total} tokens`);
        },
        onGoAway: (left) => { if (live()) void rotateGemini(`GoAway${left ? ` in ${left} ms` : ""}`); },
      }, p.glossary);
    };

    /** Close whatever session is currently flushing, now rather than on its timer. */
    const closeRetiring = () => {
      if (retireTimer) { clearTimeout(retireTimer); retireTimer = null; }
      if (retiringSession) {
        try { retiringSession.close(); } catch { /* already gone */ }
        retiringSession = null;
      }
    };

    /**
     * Hand the replaced session a grace period instead of closing it at the swap.
     *
     * Its ASR is still behind the audio it was given, so at this instant it holds the
     * tail of whatever is being said — and the replacement cannot produce that text,
     * having never heard that audio. `audioStreamEnd` makes it finalize immediately;
     * `RotationState` keeps relaying its transcript (and only its transcript) until
     * ROTATE_FLUSH_MS is up.
     */
    const retirePrevious = (previous: Session | null, retired: number, flushMs: number) => {
      closeRetiring();
      if (!previous || !retired) return;
      retiringSession = previous;
      try { previous.sendRealtimeInput({ audioStreamEnd: true }); } catch { /* already gone */ }
      retireTimer = setTimeout(() => {
        retireTimer = null;
        rot.retire(retired);
        try { retiringSession?.close(); } catch { /* already gone */ }
        retiringSession = null;
      }, flushMs);
    };

    /**
     * Replace the Live session before the API kills it.
     *
     * Measured while recording a 43-minute meeting: a session dies after 7-10 minutes
     * with "The input token count exceeds the maximum number of tokens allowed 8192",
     * and separately on a GoAway once its duration expires — `contextWindowCompression`
     * alone did not prevent either.
     *
     * The new session is opened *before* the old one is closed, and the client is never
     * told, so audio keeps flowing to the old session until the moment of the swap.
     * That is what makes this invisible: the client's capture, socket and transcript
     * state are untouched, where a client-side reconnect costs a visible gap.
     */
    const rotateGemini = async (why: string, flushMs: number = ROTATE_FLUSH_MS) => {
      if (rotating || isClosed || !geminiParams) return;
      rotating = true;
      const previous = geminiSession;
      // Reserved, not live: while the replacement is opening, the old session is still
      // the one hearing the audio, so it must keep producing transcript.
      const gen = rot.reserve();
      try {
        const next = await openGemini(gen, false);
        const retired = rot.promote(gen);
        geminiSession = next;           // audio goes to the new session from here on
        liveTokens = 0;                 // the replacement starts with an empty context
        stall.reset();                  // and with nothing owed to it yet
        retirePrevious(previous, retired, flushMs);
        console.log(`♻️ Gemini session rotated (${why}).`);
        armRotateTimer();
      } catch (err) {
        // Keep the old session: it may still have life left, and losing it here would
        // cost the recording more than the overflow we were trying to avoid. The
        // reserved generation was never promoted, so nothing needs undoing.
        console.error("🔴 Gemini rotation failed, keeping the current session:", err);
      } finally {
        rotating = false;
      }
    };

    /**
     * Backstop: rotate on a timer too, in case the API reports no token usage.
     *
     * It only fires when it has something to do. A model that reports usage is already
     * covered by the token trigger, and replacing a session that is nowhere near the
     * ceiling spends a Live-session quota slot for nothing — the same quota that
     * answers `Resource has been exhausted` when a meeting genuinely needs a new
     * session mid-recording.
     */
    const armRotateTimer = () => {
      if (rotateTimer) clearTimeout(rotateTimer);
      rotateTimer = setTimeout(() => {
        if (isClosed || !geminiSession) return;
        if (!shouldRotateOnSchedule(usageReported, liveTokens, ROTATE_AT_TOKENS)) {
          console.log(`⏭️ Scheduled rotation skipped (${liveTokens} tokens).`);
          armRotateTimer();
          return;
        }
        void rotateGemini("scheduled");
      }, ROTATE_INTERVAL_MS);
    };

    clientWs.on("message", async (data: Buffer) => {
      if (isClosed) return;

      try {
        const parsed: ClientMsg | null = parseClientMsg(data.toString());
        if (!parsed) {
          console.warn("⚠️ Unknown / unparseable message, skipped.");
          return;
        }

        // ── INIT ──────────────────────────────────────────────────────────────
        if (parsed.type === "init") {
          const translate = parsed.translate ?? true;
          // Speaking without translating is meaningless — there is nothing to say.
          const speak = (parsed.speak ?? true) && translate;
          // Silent sessions are pinned to the one model that can transcribe
          // without speaking, whatever the client asked for.
          const modelName = resolveLiveModel(
            parsed.model || "models/gemini-3.5-live-translate-preview",
            speak,
          );
          const lang = {
            sourceLang: parsed.sourceLang || "hu",
            targetLang: parsed.targetLang || "en",
            bidirectional: parsed.bidirectional ?? false,
            translate,
            speak,
          };
          const isOpenAI = modelName === "gpt-realtime-translate";

          const mode = !translate ? "record" : speak ? "interpret" : "text-only";
          console.log(`🚀 Session init: ${modelName} / ${lang.sourceLang}→${lang.targetLang}${lang.bidirectional ? " (bidi)" : ""} [${mode}]`);

          if (LIVE_DEBUG && !debugTimer) {
            relayStats.lastTranscriptAt = Date.now();
            debugTimer = setInterval(() => {
              const quiet = Math.round((Date.now() - relayStats.lastTranscriptAt) / 1000);
              console.log(
                `📊 relay: audio ${relayStats.audioChunks} chunks / ${Math.round(relayStats.audioBytes / 1024)} KB in, ` +
                `transcript ${relayStats.deltas} deltas / ${relayStats.chars} chars out, ` +
                `silent for ${quiet}s, unanswered speech ${Math.round(stall.pendingSpeechMs / 1000)}s`,
              );
              relayStats.audioChunks = 0; relayStats.audioBytes = 0;
              relayStats.deltas = 0; relayStats.chars = 0;
            }, LIVE_DEBUG_INTERVAL_MS);
          }

          if (isOpenAI) {
            if (!openAiApiKey) {
              send(clientWs, { type: "error", error: "A szerveren nincs beállítva az OPENAI_API_KEY! Állítsd be a .env fájlban." });
              return;
            }

            openAiWs = createOpenAISession(openAiApiKey, lang.targetLang, {
              onConnected:          () => { if (!isClosed) send(clientWs, { type: "status", status: "connected" }); },
              onAudio:              (b) => { if (!isClosed) send(clientWs, { type: "audio", audio: b }); },
              onTranslation:        (t) => { if (!isClosed) send(clientWs, { type: "translation", text: t }); },
              onInputTranscription: (t) => { if (!isClosed) send(clientWs, { type: "inputTranscription", transcript: t }); },
              onTurnComplete:       ()  => { if (!isClosed) send(clientWs, { type: "turnComplete" }); },
              onError:              (e) => { if (!isClosed) send(clientWs, { type: "error", error: e }); },
              onClose:              ()  => { if (!isClosed) send(clientWs, { type: "status", status: "disconnected" }); },
            }, scheduleTurnComplete);

          } else {
            if (!geminiApiKey) {
              send(clientWs, { type: "error", error: "A szerveren nincs beállítva a GEMINI_API_KEY! Kérlek, konfiguráld a .env fájlban." });
              return;
            }

            try {
              // The glossary only reaches the model at session open — rules added
              // mid-recording take effect on the next start. Kept with the rest of the
              // params so a rotation can reopen an identical session.
              const glossary = (parsed.corrections ?? [])
                .filter((c) => c && typeof c.heard === "string" && typeof c.meant === "string");
              geminiParams = { modelName, lang, glossary };
              // Promoted before the connect resolves: the SDK fires onopen first, and
              // the "connected" status the client waits for is gated on being live.
              const gen = rot.reserve();
              rot.promote(gen);
              geminiSession = await openGemini(gen, true);
              armRotateTimer();
            } catch (createErr: unknown) {
              const msg = createErr instanceof Error ? createErr.message : "Ellenőrizd a beállításokat.";
              console.error("🔴 Gemini connection error:", createErr);
              send(clientWs, { type: "error", error: `Nem sikerült kapcsolódni a Geminihez: ${msg}` });
            }
          }
        }

        // ── AUDIO ─────────────────────────────────────────────────────────────
        if (parsed.type === "audio") {
          if (LIVE_DEBUG) {
            relayStats.audioChunks += 1;
            relayStats.audioBytes += parsed.audio.length;
          }
          if (geminiSession) {
            geminiSession.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" },
            });
            // The session can stop transcribing long before the API admits it is gone
            // — measured at 107 s of steady audio with zero text, ended only by a
            // `Resource has been exhausted` close. Nothing else in this file notices
            // that: the socket is open, audio is flowing, onClose has not fired.
            if (stall.onAudio(Buffer.from(parsed.audio, "base64"))) {
              // Read the counter before reset, so the log says what was actually
              // measured — a newborn session is judged on a shorter leash than one
              // that has been working, and the two must be tellable apart.
              const waited = Math.round(stall.pendingSpeechMs / 1000);
              stall.reset();
              console.warn(`🔇 No transcript for ${waited}s of speech — rotating.`);
              void rotateGemini("transcription stalled", STALL_FLUSH_MS);
            }
          } else if (openAiWs?.readyState === WebSocket.OPEN) {
            openAiWs.send(JSON.stringify({
              type: "session.input_audio_buffer.append",
              audio: parsed.audio,
            }));
          }
        }

        // ── INTERRUPT ─────────────────────────────────────────────────────────
        if (parsed.type === "interrupt") {
          if (openAiWs?.readyState === WebSocket.OPEN) {
            openAiWs.send(JSON.stringify({ type: "session.input_audio_buffer.clear" }));
          }
        }

      } catch (err) {
        console.error("⚠️ Message processing error:", err);
      }
    });

    clientWs.on("close", () => {
      console.log("🔌 Client disconnected.");
      isClosed = true;
      if (turnTimer) clearTimeout(turnTimer);
      if (rotateTimer) clearTimeout(rotateTimer);
      if (debugTimer) { clearInterval(debugTimer); debugTimer = null; }

      closeRetiring();

      if (geminiSession) {
        try { geminiSession.close(); } catch (_) {}
        geminiSession = null;
      }

      if (openAiWs) {
        try {
          if (openAiWs.readyState === WebSocket.OPEN) {
            openAiWs.send(JSON.stringify({ type: "session.close" }));
          }
          // Let the translation endpoint drain before forcing close.
          setTimeout(() => { try { openAiWs!.close(); } catch (_) {} }, 2000);
        } catch (_) {}
        openAiWs = null;
      }
    });
  });

  // Vite dev middleware / static production files
  if (process.env.NODE_ENV !== "production") {
    console.log("🛠️ Starting Vite dev server as middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("📦 Production mode: serving static files from the 'dist' directory...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 LiveTranslate server running at: http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("🔥 Error while starting the server:", err);
});
