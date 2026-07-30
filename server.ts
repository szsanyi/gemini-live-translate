import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import type { Session } from "@google/genai";
import dotenv from "dotenv";

import {
  type ClientMsg,
  type ServerMsg,
  parseClientMsg,
} from "./shared/protocol.ts";
import { createGeminiSession } from "./server/providers/gemini.ts";
import { createOpenAISession } from "./server/providers/openai.ts";
import { generateSummary, generateSubject } from "./server/providers/summary.ts";
import { saveToObsidian } from "./server/obsidian.ts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function send(ws: WebSocket, msg: ServerMsg): void {
  ws.send(JSON.stringify(msg));
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

  app.use(express.json({ limit: "2mb" }));

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
      // Produce the summary in both interface languages, plus a short title
      // (used to name the Obsidian note without a second prompt later).
      const [en, hu, subject] = await Promise.all([
        generateSummary(transcript, "en"),
        generateSummary(transcript, "hu"),
        generateSubject(transcript).catch((subjectErr) => {
          console.warn("⚠️ Subject generation failed during summary:", subjectErr);
          return "";
        }),
      ]);
      res.json({ en, hu, subject });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("🔴 Summary error:", err);
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
    if (!markdown.trim()) {
      res.status(400).json({ error: "Empty transcript." });
      return;
    }
    try {
      const result = await saveToObsidian(markdown, subject, existingPath, new Date());
      console.log(`💾 Transcript ${result.updated ? "updated in" : "saved to"} Obsidian: ${result.path}`);
      res.json({ path: result.path, subject: result.subject, updated: result.updated });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("🔴 Obsidian save error:", err);
      res.status(500).json({ error: msg });
    }
  });

  const wss = new WebSocketServer({ server, path: "/api/live-ws" });

  wss.on("connection", (clientWs: WebSocket) => {
    console.log("🔌 New client connected.");
    let geminiSession: Session | null = null;
    let openAiWs: WebSocket | null = null;
    let isClosed = false;
    let turnTimer: ReturnType<typeof setTimeout> | null = null;

    send(clientWs, { type: "status", status: "server-connected" });

    // OpenAI has no explicit turn signal — fire turnComplete after 1.5 s silence.
    const scheduleTurnComplete = () => {
      if (turnTimer) clearTimeout(turnTimer);
      turnTimer = setTimeout(() => {
        if (!isClosed) send(clientWs, { type: "turnComplete" });
      }, 1500);
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
          const modelName = parsed.model || "models/gemini-3.5-live-translate-preview";
          const lang = {
            sourceLang: parsed.sourceLang || "hu",
            targetLang: parsed.targetLang || "en",
            bidirectional: parsed.bidirectional ?? false,
          };
          const isOpenAI = modelName === "gpt-realtime-translate";

          console.log(`🚀 Session init: ${modelName} / ${lang.sourceLang}→${lang.targetLang}${lang.bidirectional ? " (bidi)" : ""}`);

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
              geminiSession = await createGeminiSession(modelName, lang, geminiApiKey, {
                onConnected:          () => { if (!isClosed) send(clientWs, { type: "status", status: "connected" }); },
                onAudio:              (b) => { if (!isClosed) send(clientWs, { type: "audio", audio: b }); },
                onTranslation:        (t) => { if (!isClosed) send(clientWs, { type: "translation", text: t }); },
                onInputTranscription: (t) => { if (!isClosed) send(clientWs, { type: "inputTranscription", transcript: t }); },
                onInterrupted:        ()  => { if (!isClosed) send(clientWs, { type: "interrupted" }); },
                onTurnComplete:       ()  => { if (!isClosed) send(clientWs, { type: "turnComplete" }); },
                onError:              (e) => { if (!isClosed) send(clientWs, { type: "error", error: e }); },
                onClose:              (r) => { if (!isClosed) send(clientWs, { type: "status", status: "disconnected", reason: r }); },
              });
            } catch (createErr: unknown) {
              const msg = createErr instanceof Error ? createErr.message : "Ellenőrizd a beállításokat.";
              console.error("🔴 Gemini connection error:", createErr);
              send(clientWs, { type: "error", error: `Nem sikerült kapcsolódni a Geminihez: ${msg}` });
            }
          }
        }

        // ── AUDIO ─────────────────────────────────────────────────────────────
        if (parsed.type === "audio") {
          if (geminiSession) {
            geminiSession.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" },
            });
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
