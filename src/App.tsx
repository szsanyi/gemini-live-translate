import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Volume2, Loader2, BookMarked } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AudioVisualizer } from "./components/AudioVisualizer";
import { Header } from "./components/Header";
import { SettingsPanel } from "./components/SettingsPanel";
import { TranscriptList } from "./components/TranscriptList";
import { NotesInput } from "./components/NotesInput";
import { Controls } from "./components/Controls";
import { ExportDialog } from "./components/ExportDialog";
import { ObsidianDialog } from "./components/ObsidianDialog";
import { RecordingsDrawer } from "./components/RecordingsDrawer";
import { SessionBar } from "./components/SessionBar";
import { TranslationPair, NoteEntry, SummaryEntry, AudioSourceType } from "./types";
import { allowedSourceCodes, allowedTargetCodes, supportsBidirectional, TRANSCRIPTION_MODEL } from "@/shared/languages";
import { ThemeKey, ThemeConfig, THEMES, DEFAULT_THEME } from "./themes";
import { buildSrt, buildTranscript, buildTranscriptBlocks, renderTranscriptText, renderTranscriptMarkdown, triggerDownload, type ExportOptions } from "./lib/export";
import { downloadTranscriptPdf } from "./lib/pdf";
import { MAX_SESSION_RECONNECTS } from "./lib/constants";
import { reconnectDelayMs } from "./lib/reconnect";
import {
  closeAfterMs,
  DEFAULT_SEGMENT_TUNING,
  readSegmentTuning,
  shouldCloseNow,
  type SegmentTuning,
} from "./lib/segmentation";
// Aliased: `translate` is also the name of this session's "translate speech" flag.
import { Lang, DEFAULT_LANG, LANG_STORAGE_KEY, LangContext, translate as translateString, StringKey } from "./i18n";
import { useAudioPlayback } from "./hooks/useAudioPlayback";
import { useAudioCapture } from "./hooks/useAudioCapture";
import { useTranslationSession } from "./hooks/useTranslationSession";
import { useSessionStore } from "./hooks/useSessionStore";
import { newSessionId, normalizeTags, type SessionData, type SessionSummary } from "@/shared/session";
import {
  applyCorrections,
  dedupeRules,
  serializeRule,
  parseRules,
  type CorrectionRule,
} from "@/shared/corrections";
import { CorrectionDialog } from "./components/CorrectionDialog";
import { ImportDialog } from "./components/ImportDialog";
import { cuesToPairs, type Cue } from "@/shared/transcriptImport";

export default function App() {
  // Session UI configurations
  const [model, setModel] = useState<string>("models/gemini-3.5-live-translate-preview");
  const [sourceLang, setSourceLang] = useState<string>("hu");
  const [targetLang, setTargetLang] = useState<string>("en");
  const [bidirectional, setBidirectional] = useState<boolean>(false);
  // Session mode. translate=false → plain recording; translate && !speak →
  // translated transcript, where a text model translates each finished segment
  // instead of the Live model speaking it. Both are locked once a session starts.
  const [translate, setTranslate] = useState<boolean>(true);
  const [speak, setSpeak] = useState<boolean>(true);
  const [audioSource, setAudioSource] = useState<AudioSourceType>("microphone");

  // App States
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSidebarMode, setIsSidebarMode] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);

  // Interface language — English by default, persisted across sessions.
  const [lang, setLang] = useState<Lang>(() => {
    const stored = localStorage.getItem(LANG_STORAGE_KEY) as Lang | null;
    return stored === "en" || stored === "hu" ? stored : DEFAULT_LANG;
  });
  // Audio meters are hidden by default and toggleable; choice is persisted.
  const [showVisualizer, setShowVisualizer] = useState<boolean>(
    () => localStorage.getItem("showVisualizer") === "true",
  );

  // Transcript
  const [pairs, setPairs] = useState<TranslationPair[]>([]);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [activeInput, setActiveInput] = useState("");
  const [activeTranslation, setActiveTranslation] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // AI summary — appears as entries in the conversation flow (both languages).
  const [summaries, setSummaries] = useState<SummaryEntry[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Obsidian save. `sessionSubject` is the note title for this recording session
  // (set by the AI summary or the save dialog). `obsidianSavedPath` remembers
  // where this session was already written so repeat saves update in place
  // rather than spawning dated variants. Both reset on Clear History / reload.
  const [obsidianSaving, setObsidianSaving] = useState(false);
  const [obsidianStatus, setObsidianStatus] = useState<string | null>(null);
  const [sessionSubject, setSessionSubject] = useState<string | null>(null);
  const [obsidianSavedPath, setObsidianSavedPath] = useState<string | null>(null);
  const [obsidianDialogOpen, setObsidianDialogOpen] = useState(false);

  // Session store: which recording is open, and the library drawer.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recordingsOpen, setRecordingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [sessionTags, setSessionTags] = useState<string[]>([]);
  // Corrections. Session rules live with the recording; global ones are kept on the
  // server and apply everywhere. Both are used for substitution and as a glossary.
  const [sessionCorrections, setSessionCorrections] = useState<CorrectionRule[]>([]);
  const [globalCorrections, setGlobalCorrections] = useState<CorrectionRule[]>([]);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionHeard, setCorrectionHeard] = useState("");
  const [titleGenerating, setTitleGenerating] = useState(false);
  // Only ever auto-name a given recording once, so a stopped-and-resumed session
  // doesn't keep spending calls on a name it already has.
  const autoTitledRef = useRef<string | null>(null);
  const store = useSessionStore();
  const [theme, setTheme] = useState<ThemeKey>(() => {
    const stored = localStorage.getItem("theme") as ThemeKey;
    return THEMES[stored] ? stored : DEFAULT_THEME;
  });

  // Refs mirror in-progress transcript (StrictMode-safe: no nested setState)
  const activeInputRef = useRef("");
  const activeTranslationRef = useRef("");
  const sessionStartRef = useRef<number>(0);
  const turnStartMsRef = useRef<number | null>(null);
  // Offset (ms from session start) of the most recent text chunk — used as the
  // segment's end time so subtitle cues reflect when speech actually ended.
  const lastChunkMsRef = useRef<number>(0);
  // Pending pause-based segmentation timer.
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recorded time carried over from earlier runs of this session. Cue offsets
  // continue from here, so resuming a recording doesn't restart subtitle timing at
  // zero and overlap the existing cues.
  const elapsedBeforeRef = useRef(0);
  const sessionCreatedAtRef = useRef<Date | null>(null);

  const playback = useAudioPlayback();
  const capture = useAudioCapture();

  // Breaks the circular dep between stopTranslating and session callbacks
  const stopRef = useRef<() => void>(() => {});
  // Same, for the automatic reconnect after an unexpected close.
  const reconnectRef = useRef<() => void>(() => {});
  // Consecutive automatic reconnects; reset on every successful connect.
  const reconnectsRef = useRef(0);
  // True while capture is running — lets a mid-session reconnect (language swap)
  // reuse the live mic/tab stream instead of re-prompting for it.
  const captureActiveRef = useRef(false);

  useEffect(() => {
    const handleResize = () => setIsSidebarMode(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => { localStorage.setItem("theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem(LANG_STORAGE_KEY, lang); }, [lang]);
  useEffect(() => { localStorage.setItem("showVisualizer", String(showVisualizer)); }, [showVisualizer]);

  const tr = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => translateString(lang, key, vars),
    [lang],
  );

  // Every rule in force: the recording's own plus the global dictionary.
  const activeCorrections = dedupeRules([...globalCorrections, ...sessionCorrections]);
  /** Strip rules down to what the model's glossary needs. */
  const glossaryFor = (rules: CorrectionRule[]) => rules.map((r) => ({ heard: r.heard, meant: r.meant }));
  // Read in socket callbacks and the segment finalizer, which must always see the
  // current list rather than the one captured when the session opened.
  const correctionsRef = useRef<CorrectionRule[]>(activeCorrections);
  correctionsRef.current = activeCorrections;

  // While correction mode is on, a selection inside the transcript opens the
  // dialog with the selected text prefilled. Listening on mouseup/touchend rather
  // than selectionchange means the dialog opens once, when the selection is done.
  useEffect(() => {
    if (!correctionMode) return;
    const onSelectionDone = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      if (!text || text.length > 200) return;
      // Only text inside a transcript card counts, not stray page selections.
      const node = selection?.anchorNode;
      const el = node instanceof Element ? node : node?.parentElement;
      if (!el?.closest("[data-transcript-text]")) return;
      setCorrectionHeard(text);
      setCorrectionOpen(true);
    };
    document.addEventListener("mouseup", onSelectionDone);
    document.addEventListener("touchend", onSelectionDone);
    return () => {
      document.removeEventListener("mouseup", onSelectionDone);
      document.removeEventListener("touchend", onSelectionDone);
    };
  }, [correctionMode]);

  // Load the global dictionary once; it is small and needed before the first start.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/corrections");
        if (!res.ok) return;
        const data = await res.json();
        setGlobalCorrections(parseRules(data.corrections));
      } catch (e) {
        console.warn("Could not load the global corrections:", e);
      }
    })();
  }, []);

  // Keep a ref to the latest finalize so the silence timer never fires a stale one.
  const finalizeRef = useRef<() => void>(() => {});

  // Segment thresholds, overridable without a rebuild — the same escape hatch
  // `audioDebug` uses in useAudioCapture. Read once; a change needs a page reload.
  const tuningRef = useRef<SegmentTuning>(DEFAULT_SEGMENT_TUNING);
  useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem("segmentTuning"); } catch { /* blocked storage */ }
    tuningRef.current = readSegmentTuning(raw);
    if (raw) console.log("[segment] tuning:", tuningRef.current);
  }, []);

  /**
   * Milliseconds from the start of the *session* (not of this run), so cues stay
   * monotonic when a stored recording is resumed.
   */
  const offsetNow = (): number =>
    sessionStartRef.current > 0
      ? elapsedBeforeRef.current + (Date.now() - sessionStartRef.current)
      : elapsedBeforeRef.current;

  // Called on every incoming text chunk, before it is accumulated: records the
  // segment's start/end and cancels the pending close, which `scheduleSegmentClose`
  // re-arms once the chunk is in.
  const registerActivity = () => {
    const now = offsetNow();
    if (turnStartMsRef.current === null && sessionStartRef.current > 0) {
      turnStartMsRef.current = now;
    }
    lastChunkMsRef.current = now;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
  };

  /**
   * Decide when this card closes — see `src/lib/segmentation.ts` for the rule.
   *
   * **Must run after the chunk has been accumulated.** With the old fixed 1200 ms
   * delay the ordering was irrelevant; now the rule reads the whole text, and arming
   * the timer first would judge the card as it was one chunk ago.
   */
  const scheduleSegmentClose = () => {
    // The source transcript carries the punctuation and the meaning; the translation
    // stands in only for a session that produces no source text.
    const text = activeInputRef.current || activeTranslationRef.current;
    const tuning = tuningRef.current;
    if (shouldCloseNow(text, tuning)) {
      finalizeRef.current();
      return;
    }
    silenceTimerRef.current = setTimeout(() => finalizeRef.current(), closeAfterMs(text, tuning));
  };

  const handleIncomingInputSpeech = (text: string) => {
    registerActivity();
    activeInputRef.current += text;
    setActiveInput(activeInputRef.current);
    scheduleSegmentClose();
  };

  const handleIncomingTranslation = (text: string) => {
    registerActivity();
    activeTranslationRef.current += text;
    setActiveTranslation(activeTranslationRef.current);
    scheduleSegmentClose();
  };

  /**
   * Translate one finished segment with the server-side text model and drop the
   * result into its own card. Used in translated-transcript mode, where the Live
   * model is silent so no translation arrives over the socket.
   *
   * A failure must not end the recording — the captured text is the valuable part,
   * so the card keeps its source text and just reports the translation as failed.
   */
  const requestSegmentTranslation = useCallback(async (
    pairId: string,
    text: string,
    src: string,
    tgt: string,
  ) => {
    const patch = (translatedText: string) =>
      setPairs(prev => prev.map(p => (p.id === pairId ? { ...p, translatedText, isStreaming: false } : p)));
    try {
      const res = await fetch("/api/translate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Unlike the Live session, this prompt is built per segment, so a rule
        // added mid-recording improves the very next translation.
        body: JSON.stringify({
          text,
          sourceLang: src,
          targetLang: tgt,
          corrections: correctionsRef.current.map(serializeRule),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      patch(typeof data.translation === "string" ? data.translation : "");
    } catch (e: any) {
      console.error("Segment translation failed:", e);
      patch(tr("translate.failed"));
    }
  }, [tr]);

  const finalizeCurrentTurn = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    // Substitution is the only thing that fixes the transcript — the ASR ignores
    // the glossary entirely, so every finished segment gets the rules applied.
    const rules = correctionsRef.current;
    const currInput = applyCorrections(activeInputRef.current.trim(), rules);
    const currTranslate = applyCorrections(activeTranslationRef.current.trim(), rules);
    const now = offsetNow();
    const endMs = lastChunkMsRef.current || now;
    const startMs = turnStartMsRef.current ?? endMs;

    activeInputRef.current = "";
    activeTranslationRef.current = "";
    turnStartMsRef.current = null;
    lastChunkMsRef.current = 0;
    setActiveInput("");
    setActiveTranslation("");

    if (!currInput && !currTranslate) return;

    // The Live model only delivers translations when it speaks; otherwise this
    // segment has to be translated separately (or not at all, when recording).
    const needsTextTranslation = translate && !speak && !currTranslate && !!currInput;
    const id = Math.random().toString();

    let translatedText: string;
    if (!translate) translatedText = "";
    else if (currTranslate) translatedText = currTranslate;
    else if (needsTextTranslation) translatedText = tr("translate.pending");
    else translatedText = tr("transcript.translationPending");

    setPairs(prev => [...prev, {
      id,
      originalText: currInput || tr("transcript.speechCaptured"),
      translatedText,
      sourceLang,
      targetLang,
      bidirectional,
      timestamp: new Date(),
      startMs,
      endMs,
      isStreaming: needsTextTranslation || undefined,
    }]);

    if (needsTextTranslation) {
      void requestSegmentTranslation(id, currInput, sourceLang, targetLang);
    }
  }, [sourceLang, targetLang, bidirectional, translate, speak, tr, requestSegmentTranslation]);

  finalizeRef.current = finalizeCurrentTurn;

  // session must be declared before stopTranslating so disconnect() is accessible
  const session = useTranslationSession({
    onStatus: async (s, reason) => {
      if (s === "connected") {
        setStatus("connected");
        setIsActive(true);
        reconnectsRef.current = 0;
        // On a mid-session reconnect the stream is already live — don't re-prompt.
        if (!captureActiveRef.current) {
          try {
            await capture.start(audioSource, session.sendAudio);
            captureActiveRef.current = true;
          } catch (err: any) {
            setError(tr("error.audioInput", { msg: err.message || tr("error.allowRecording") }));
            stopRef.current();
          }
        }
      } else if (s === "disconnected") {
        // A close with the capture still running was not asked for: `stopTranslating`
        // clears `captureActiveRef` synchronously before it disconnects, so anything
        // still marked active here died on its own (a Gemini GoAway, a filled context
        // window, a dropped socket). Reconnect and keep recording — stopping would
        // mean the user has to notice, rewind the shared tab and start over, which is
        // exactly what a 43-minute meeting cannot afford.
        if (captureActiveRef.current && reconnectsRef.current < MAX_SESSION_RECONNECTS) {
          reconnectsRef.current += 1;
          // Backing off rather than retrying at a fixed 800 ms: when the provider
          // refused us on quota ("Resource has been exhausted"), the bucket refills on
          // a clock, so five attempts inside four seconds are five certain failures
          // followed by a stopped recording. The close reason decides how long to wait.
          const delay = reconnectDelayMs(reconnectsRef.current, reason);
          console.warn(
            `Session dropped (${reason || "no reason given"}), reconnecting ` +
            `${reconnectsRef.current}/${MAX_SESSION_RECONNECTS} in ${delay} ms`,
          );
          setStatus("connecting");
          window.setTimeout(() => reconnectRef.current(), delay);
          return;
        }
        stopRef.current();
      }
    },
    // Silent sessions never start the output context, and the server already drops
    // any audio the model emits anyway — guard here too so a stray chunk can't
    // resurrect playback.
    onAudio: (base64) => { if (speak) playback.enqueueChunk(base64); },
    onTranslation: (text) => { if (translate && speak) handleIncomingTranslation(text); },
    onInputTranscription: (transcript) => handleIncomingInputSpeech(transcript),
    onInterrupted: () => playback.stopSources(),
    onTurnComplete: () => finalizeCurrentTurn(),
    onError: (err) => {
      // Client-generated errors arrive as i18n keys ("error.*"); server errors
      // arrive as ready-made strings.
      setError(err.startsWith("error.") ? tr(err as StringKey) : err);
      stopRef.current();
    },
  });

  const stopTranslating = useCallback(() => {
    finalizeCurrentTurn();
    setIsActive(false);
    setStatus("disconnected");
    capture.stop();
    captureActiveRef.current = false;
    playback.stop();
    session.disconnect();
    // Bank the time recorded in this run so a later resume continues after it.
    if (sessionStartRef.current > 0) {
      elapsedBeforeRef.current += Date.now() - sessionStartRef.current;
      sessionStartRef.current = 0;
    }
  }, [finalizeCurrentTurn, capture.stop, playback.stop, session.disconnect]);

  stopRef.current = stopTranslating;

  // Mid-session language swap: reconnect the Gemini/OpenAI session with the new
  // pair while keeping the live mic/tab capture and the playback context. Used
  // to manually flip the translation direction during a conversation (e.g. the
  // Gemini 3.5 model has no bidirectional mode).
  const restartSessionWithLangs = useCallback((ns: string, nt: string) => {
    finalizeCurrentTurn();
    playback.stopSources();
    session.disconnect(true); // silent — no disconnected callback, so no full stop
    setStatus("connecting");
    session.connect({ model, sourceLang: ns, targetLang: nt, bidirectional, translate, speak, audioSource, corrections: glossaryFor(correctionsRef.current) });
  }, [finalizeCurrentTurn, playback.stopSources, session.disconnect, session.connect, model, bidirectional, translate, speak, audioSource]);

  // Reconnect on the same language pair, keeping the live capture. Same mechanism as
  // the language swap — that already had to reconnect without re-prompting for the
  // stream, which is exactly what an automatic reconnect needs too.
  reconnectRef.current = () => restartSessionWithLangs(sourceLang, targetLang);

  const startTranslating = async () => {
    try {
      setError(null);
      setStatus("connecting");
      // A recording always belongs to a stored session; create one on first start
      // so autosave has somewhere to write from the very first segment.
      ensureSessionId();
      sessionStartRef.current = Date.now();
      turnStartMsRef.current = null;
      lastChunkMsRef.current = 0;
      activeInputRef.current = "";
      activeTranslationRef.current = "";
      setActiveInput("");
      setActiveTranslation("");
      // No spoken output → don't open an output AudioContext at all.
      if (speak) playback.start();
      session.connect({ model, sourceLang, targetLang, bidirectional, translate, speak, audioSource, corrections: glossaryFor(correctionsRef.current) });
    } catch (e: any) {
      setError(tr("error.startup", { msg: e.message || e }));
      setStatus("disconnected");
      setIsActive(false);
    }
  };

  /** Ensure this transcript is backed by a stored session, and return its id. */
  const ensureSessionId = (): string => {
    if (sessionId) return sessionId;
    const id = newSessionId();
    sessionCreatedAtRef.current = new Date();
    setSessionId(id);
    return id;
  };

  // Autosave. Any change to the transcript, notes, summaries, title or Obsidian
  // path queues a debounced write; the store collapses bursts into one request and
  // retries on failure without interrupting the recording.
  useEffect(() => {
    if (!sessionId) return;
    if (pairs.length === 0 && notes.length === 0 && summaries.length === 0) return;
    const session: SessionData = {
      version: 1,
      id: sessionId,
      createdAt: sessionCreatedAtRef.current ?? new Date(),
      updatedAt: new Date(),
      title: sessionSubject,
      tags: sessionTags,
      corrections: sessionCorrections,
      profile: { model, sourceLang, targetLang, bidirectional, translate, speak, audioSource },
      elapsedMs: elapsedBeforeRef.current + (sessionStartRef.current > 0 ? Date.now() - sessionStartRef.current : 0),
      pairs,
      notes,
      summaries,
      obsidianPath: obsidianSavedPath,
      hasAudio: false,
    };
    store.scheduleSave(session);
  }, [
    sessionId, pairs, notes, summaries, sessionSubject, sessionTags, sessionCorrections, obsidianSavedPath,
    model, sourceLang, targetLang, bidirectional, translate, speak, audioSource,
    store.scheduleSave,
  ]);

  // Write immediately when a recording stops, rather than waiting out the debounce,
  // and give an unnamed recording a name from what was actually said.
  useEffect(() => {
    if (isActive) return;
    void store.flush();
    if (sessionId && !sessionSubject && pairs.length > 0 && autoTitledRef.current !== sessionId) {
      const id = sessionId;
      // Claim the id up front so a re-render can't fire a second call, but release it
      // again if the attempt failed: the text model returns a transient 503 often
      // enough that one blip must not leave the recording permanently unnamed.
      autoTitledRef.current = id;
      void generateTitle().then((named) => {
        if (!named && autoTitledRef.current === id) autoTitledRef.current = null;
      });
    }
  }, [isActive, sessionId, sessionSubject, pairs.length, store.flush]);

  /**
   * Ask the server for a name based on what was said. Used by the button in the
   * session bar and once automatically when a recording stops unnamed. Resolves to
   * whether a name was actually produced, so the automatic path can try again later.
   */
  const generateTitle = async (): Promise<boolean> => {
    if (titleGenerating) return false;
    if (pairs.length === 0 && notes.length === 0) return false;
    setTitleGenerating(true);
    try {
      const subject = await requestGeneratedSubject();
      if (!subject.trim()) return false;
      setSessionSubject(subject.trim());
      return true;
    } catch (e: any) {
      setError(tr("session.titleError", { msg: e?.message ?? e }));
      return false;
    } finally {
      setTitleGenerating(false);
    }
  };

  /**
   * Teach a correction: fix the whole open recording, apply it to everything
   * recorded from here on, and — when marked global — persist it for every future
   * recording.
   */
  const addCorrection = async (heard: string, meant: string, global: boolean) => {
    const rule: CorrectionRule = {
      id: Math.random().toString(36).slice(2),
      heard,
      meant,
      global,
      createdAt: new Date(),
    };
    ensureSessionId();
    setSessionCorrections((prev) => dedupeRules([...prev, rule]));

    // Retroactive fix across the open recording, both sides of every card and the
    // notes, so one correction doesn't have to be repeated per occurrence.
    const only = [rule];
    setPairs((prev) => prev.map((p) => ({
      ...p,
      originalText: applyCorrections(p.originalText, only),
      translatedText: applyCorrections(p.translatedText, only),
    })));
    setNotes((prev) => prev.map((n) => ({ ...n, text: applyCorrections(n.text, only) })));

    setCorrectionOpen(false);
    setCorrectionHeard("");

    if (global) {
      const next = dedupeRules([...globalCorrections, rule]);
      setGlobalCorrections(next);
      try {
        const res = await fetch("/api/corrections", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ corrections: next.map(serializeRule) }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (e: any) {
        setError(tr("corrections.saveError", { msg: e?.message ?? e }));
      }
    }
  };

  const removeCorrection = async (id: string) => {
    setSessionCorrections((prev) => prev.filter((r) => r.id !== id));
    if (globalCorrections.some((r) => r.id === id)) {
      const next = globalCorrections.filter((r) => r.id !== id);
      setGlobalCorrections(next);
      try {
        await fetch("/api/corrections", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ corrections: next.map(serializeRule) }),
        });
      } catch (e: any) {
        setError(tr("corrections.saveError", { msg: e?.message ?? e }));
      }
    }
  };

  const addTag = (tag: string) => {
    setSessionTags((prev) => normalizeTags([...prev, tag]));
    ensureSessionId();
  };
  const removeTag = (tag: string) => {
    setSessionTags((prev) => prev.filter((x) => x !== tag));
  };

  /** Load a stored recording into the main view. It stays fully resumable. */
  const openSession = async (id: string) => {
    try {
      await store.flush(); // don't lose pending changes to the current one
      const loaded = await store.load(id);
      finalizeCurrentTurn();
      if (isActive) stopTranslating();

      setSessionId(loaded.id);
      sessionCreatedAtRef.current = loaded.createdAt;
      elapsedBeforeRef.current = loaded.elapsedMs;
      sessionStartRef.current = 0;

      setPairs(loaded.pairs);
      setNotes(loaded.notes);
      setSummaries(loaded.summaries);
      setSessionSubject(loaded.title);
      setSessionTags(loaded.tags);
      setSessionCorrections(loaded.corrections);
      setObsidianSavedPath(loaded.obsidianPath);
      // A loaded recording already had its chance at a name; don't auto-name it.
      autoTitledRef.current = loaded.id;

      // Restore the settings it was recorded with, so resuming continues in kind.
      setModel(loaded.profile.model || model);
      setSourceLang(loaded.profile.sourceLang);
      setTargetLang(loaded.profile.targetLang);
      setBidirectional(loaded.profile.bidirectional);
      setTranslate(loaded.profile.translate);
      setSpeak(loaded.profile.speak);
      setAudioSource(loaded.profile.audioSource);

      setRecordingsOpen(false);
    } catch (e: any) {
      setError(tr("recordings.loadError", { msg: e?.message ?? e }));
    }
  };

  /** Detach from the current recording and start with a clean slate. */
  const startNewSession = () => {
    void store.flush();
    if (isActive) stopTranslating();
    setSessionId(null);
    sessionCreatedAtRef.current = null;
    elapsedBeforeRef.current = 0;
    sessionStartRef.current = 0;
    setPairs([]);
    setNotes([]);
    setSummaries([]);
    activeInputRef.current = "";
    activeTranslationRef.current = "";
    setActiveInput("");
    setActiveTranslation("");
    setSessionSubject(null);
    setSessionTags([]);
    // Global rules stay in force; the ones taught only for that recording go away.
    setSessionCorrections([]);
    setObsidianSavedPath(null);
    setRecordingsOpen(false);
    autoTitledRef.current = null;
  };

  /**
   * Bring a pasted transcript in as a recording. It becomes an ordinary stored
   * session: the autosave effect writes it, and it is fully resumable — new live
   * segments continue from the imported timeline via `elapsedBeforeRef`.
   */
  const importTranscript = (cues: Cue[], opts: { sourceLang: string; baseDate: Date }) => {
    if (cues.length === 0) return;
    startNewSession();

    const imported = cuesToPairs(cues, opts);
    const id = newSessionId(opts.baseDate);
    sessionCreatedAtRef.current = opts.baseDate;
    // The largest end, not the last one's: two selections pasted out of order leave
    // non-monotonic offsets, and taking the last would understate the recorded length
    // so a later live resume overlaps the imported cues.
    elapsedBeforeRef.current = imported.reduce((max, p) => Math.max(max, p.endMs ?? 0), 0);
    sessionStartRef.current = 0;
    setSessionId(id);

    setPairs(imported);
    // Same route as the UI's translation toggle: a silent session belongs on the only
    // model that can transcribe without speaking, so the settings panel doesn't show
    // 3.5 as selected-and-locked and the stored profile matches what a resume can run.
    // Called before the languages, because its own clamping reads the pre-import pair;
    // TRANSCRIPTION_MODEL allows every language, so the pair set below stays valid.
    handleModelChange(TRANSCRIPTION_MODEL);
    setSourceLang(opts.sourceLang);
    // Source and target are always kept distinct (CLAUDE.md), even though nothing is
    // translated here — so that turning translation on afterwards lands in a valid pair.
    setTargetLang(opts.sourceLang === "en" ? "hu" : "en");
    // An imported transcript is a plain recording that did not come from a mic.
    setTranslate(false);
    setSpeak(false);
    // It already has its text; don't spend a call naming it automatically.
    autoTitledRef.current = id;

    setImportOpen(false);
  };

  const deleteSession = async (s: SessionSummary) => {
    const title = s.title ?? tr("recordings.untitled");
    let message = tr("recordings.deleteConfirm", { title });
    // Name the note explicitly — this removes a file from the user's vault.
    const loaded = await store.load(s.id).catch(() => null);
    if (loaded?.obsidianPath) {
      message += tr("recordings.deleteWithNote", { path: loaded.obsidianPath });
    }
    if (!window.confirm(message)) return;
    try {
      const result = await store.remove(s.id, true);
      if (result.noteError) {
        setError(tr("recordings.noteNotDeleted", { msg: result.noteError }));
      }
      // The open recording just vanished — detach the view from it.
      if (s.id === sessionId) startNewSession();
    } catch (e: any) {
      setError(tr("recordings.deleteError", { msg: e?.message ?? e }));
    }
  };

  const handleMuteToggle = () => {
    const next = !isMuted;
    setIsMuted(next);
    playback.setMuted(next);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const clearTranscript = () => {
    if (window.confirm(tr("confirm.clear"))) {
      setObsidianDialogOpen(false);
      // Detaches from the stored recording rather than emptying it: clearing the
      // screen must not wipe what is already saved in the library.
      startNewSession();
    }
  };

  const addNote = (text: string, pairId?: string) => {
    // A note is content too — make sure it gets persisted even with no recording.
    ensureSessionId();
    setNotes(prev => [...prev, { id: Math.random().toString(), text, timestamp: new Date(), pairId }]);
  };
  const updateNote = (id: string, text: string) => {
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, text } : n)));
  };
  const deleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const downloadSubtitleFile = () => {
    if (pairs.length === 0) return;
    const stamp = new Date().toLocaleDateString().replace(/\//g, "-");
    triggerDownload(buildSrt(pairs), "application/x-subrip;charset=utf-8", `${tr("file.subtitlePrefix")}_${stamp}.srt`);
  };

  const transcriptLabels = (withDate = false) => {
    const firstTs = pairs[0]?.timestamp ?? notes[0]?.timestamp ?? summaries[0]?.timestamp ?? new Date();
    return {
      title: tr("export.title"),
      noteLabel: tr("notes.label"),
      summaryLabel: tr("summary.title"),
      ...(withDate ? { dateLine: tr("export.generatedAt", { date: firstTs.toLocaleString() }) } : {}),
    };
  };

  const doExport = async (format: "txt" | "md" | "pdf", options: ExportOptions) => {
    if (pairs.length === 0 && notes.length === 0 && summaries.length === 0) return;
    const stamp = new Date().toLocaleDateString().replace(/\//g, "-");
    const base = `${tr("file.transcriptPrefix")}_${stamp}`;
    const labels = transcriptLabels(true);
    const blocks = buildTranscriptBlocks(pairs, notes, summaries);
    if (format === "pdf") {
      try {
        await downloadTranscriptPdf(blocks, labels, `${base}.pdf`, options);
      } catch (e: any) {
        setError(tr("export.pdfError", { msg: e.message || e }));
      }
      return;
    }
    if (format === "md") {
      triggerDownload(renderTranscriptMarkdown(blocks, labels, options), "text/markdown;charset=utf-8", `${base}.md`);
      return;
    }
    triggerDownload(renderTranscriptText(blocks, labels, options), "text/plain;charset=utf-8", `${base}.txt`);
  };

  const handleSummarize = async () => {
    if (pairs.length === 0 || summaryLoading) return;
    setSummaryLoading(true);
    setError(null);
    try {
      // Summaries are not fed back into the summarizer input.
      const transcript = buildTranscript(pairs, notes, [], transcriptLabels());
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSummaries(prev => [...prev, {
        id: Math.random().toString(),
        en: data.en ?? "",
        hu: data.hu ?? "",
        timestamp: new Date(),
      }]);
      // The summary also yields a note title — adopt it so a later Obsidian
      // save needs no extra prompt. Don't overwrite a title the user set.
      if (typeof data.subject === "string" && data.subject.trim()) {
        setSessionSubject(prev => prev ?? data.subject.trim());
      }
    } catch (e: any) {
      setError(tr("summary.error", { msg: e.message || e }));
    } finally {
      setSummaryLoading(false);
    }
  };

  const hasContent = () => pairs.length > 0 || notes.length > 0 || summaries.length > 0;

  // Entry point for the "Save to Obsidian" button. If a title already exists
  // (from the AI summary or a previous save), save straight away; otherwise ask
  // for one in the dialog instead of auto-generating.
  const handleSaveObsidian = () => {
    if (!hasContent() || obsidianSaving) return;
    if (sessionSubject) {
      doObsidianSave(sessionSubject);
    } else {
      setObsidianDialogOpen(true);
    }
  };

  // Asks the server for an AI-suggested title (used by the dialog's button).
  const requestGeneratedSubject = async (): Promise<string> => {
    const transcript = buildTranscript(pairs, notes, summaries, transcriptLabels());
    const res = await fetch("/api/subject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return typeof data.subject === "string" ? data.subject : "";
  };

  const doObsidianSave = async (subject: string) => {
    if (!hasContent() || obsidianSaving) return;
    setObsidianSaving(true);
    setError(null);
    setObsidianStatus(null);
    try {
      const labels = transcriptLabels(true);
      const blocks = buildTranscriptBlocks(pairs, notes, summaries);
      // Save the full note: every element (pairs, notes, summaries, timestamps).
      const markdown = renderTranscriptMarkdown(blocks, labels);
      const res = await fetch("/api/save-obsidian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // existingPath makes a repeat save overwrite this session's note; the tags
        // join the note's frontmatter so the vault can search on them. `when` files
        // the note under the recording's own date — an imported meeting keeps the
        // date the user entered instead of today's. Omitted when there is no stored
        // session yet, so a plain live recording keeps the server's "now".
        body: JSON.stringify({
          markdown,
          subject,
          existingPath: obsidianSavedPath,
          tags: sessionTags,
          ...(sessionCreatedAtRef.current
            ? { when: sessionCreatedAtRef.current.toISOString() }
            : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setObsidianSavedPath(data.path ?? null);
      setSessionSubject(data.subject ?? subject);
      setObsidianStatus(tr(data.updated ? "obsidian.updated" : "obsidian.saved", { path: data.path ?? "" }));
      setTimeout(() => setObsidianStatus(null), 6000);
    } catch (e: any) {
      setError(tr("obsidian.error", { msg: e.message || e }));
    } finally {
      setObsidianSaving(false);
    }
  };

  const downloadSummary = (text: string, langCode: "en" | "hu", format: "txt" | "md") => {
    const stamp = new Date().toLocaleDateString().replace(/\//g, "-");
    const mime = format === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8";
    triggerDownload(text, mime, `${tr("file.summaryPrefix")}_${langCode}_${stamp}.${format}`);
  };

  const handleModelChange = (m: string) => {
    setModel(m);
    // Clamp the language pair / direction to what the new model supports
    // (source and target can have different allowed sets, e.g. OpenAI).
    const srcAllowed = allowedSourceCodes(m);
    const tgtAllowed = allowedTargetCodes(m);
    let ns = srcAllowed.includes(sourceLang) ? sourceLang : (srcAllowed.includes("hu") ? "hu" : srcAllowed[0]);
    let nt = tgtAllowed.includes(targetLang) ? targetLang : (tgtAllowed.includes("en") ? "en" : tgtAllowed[0]);
    if (ns === nt) nt = tgtAllowed.find(c => c !== ns) ?? nt;
    setSourceLang(ns);
    setTargetLang(nt);
    if (!supportsBidirectional(m)) setBidirectional(false);
  };

  // Translation off → nothing to speak, so speech goes off with it. Turning
  // translation back on restores the default interpreter behaviour.
  const handleTranslateToggle = () => {
    const next = !translate;
    setTranslate(next);
    setSpeak(next);
    if (!next) handleModelChange(TRANSCRIPTION_MODEL);
  };

  // Silent sessions are pinned to the only model that can transcribe without
  // speaking; go through handleModelChange so the language pair is re-clamped too.
  const handleSpeakToggle = () => {
    const next = !speak;
    setSpeak(next);
    if (!next) handleModelChange(TRANSCRIPTION_MODEL);
  };

  // Source/target are always kept distinct and within the model's allowed sets:
  // picking one equal to the other moves the other to a still-valid language.
  const handleSourceChange = (code: string) => {
    if (code === targetLang) {
      const tgtAllowed = allowedTargetCodes(model);
      setTargetLang(tgtAllowed.includes(sourceLang) ? sourceLang : (tgtAllowed.find(c => c !== code) ?? targetLang));
    }
    setSourceLang(code);
  };
  const handleTargetChange = (code: string) => {
    if (code === sourceLang) {
      const srcAllowed = allowedSourceCodes(model);
      setSourceLang(srcAllowed.includes(targetLang) ? targetLang : (srcAllowed.find(c => c !== code) ?? sourceLang));
    }
    setTargetLang(code);
  };
  const handleSwapLangs = () => {
    const ns = targetLang;
    const nt = sourceLang;
    setSourceLang(ns);
    setTargetLang(nt);
    // Live conversation: flip the direction by reconnecting with the new pair.
    if (isActive) restartSessionWithLangs(ns, nt);
  };

  const t: ThemeConfig = THEMES[theme] ?? THEMES[DEFAULT_THEME];

  return (
    <LangContext.Provider value={{ lang, setLang, tr }}>
    <div data-theme={theme} className={`h-screen overflow-hidden canvas-bg font-sans text-[var(--text-primary)] flex flex-col transition-all duration-300 antialiased ${t.selectionBg}`}>

      <Header
        theme={theme}
        mobileSettingsOpen={mobileSettingsOpen}
        showVisualizer={showVisualizer}
        t={t}
        onThemeChange={setTheme}
        onToggleVisualizer={() => setShowVisualizer(v => !v)}
        onMobileSettingsToggle={() => setMobileSettingsOpen(o => !o)}
        onOpenRecordings={() => { setRecordingsOpen(true); void store.refresh(); }}
      />

      <main className="flex-1 min-h-0 w-full grid grid-cols-1 xl:grid-cols-4 items-stretch">

        <SettingsPanel
          model={model}
          sourceLang={sourceLang}
          targetLang={targetLang}
          bidirectional={bidirectional}
          translate={translate}
          speak={speak}
          audioSource={audioSource}
          isActive={isActive}
          isSidebarMode={isSidebarMode}
          mobileSettingsOpen={mobileSettingsOpen}
          t={t}
          onModelChange={handleModelChange}
          onSourceChange={handleSourceChange}
          onTargetChange={handleTargetChange}
          onSwapLangs={handleSwapLangs}
          onBidirectionalToggle={() => setBidirectional(b => !b)}
          onTranslateToggle={handleTranslateToggle}
          onSpeakToggle={handleSpeakToggle}
          onAudioSourceChange={setAudioSource}
        />

        {/* Dialogue Log Frame — fills the available height; the transcript
            scrolls internally instead of stretching the whole page. */}
        <div className="col-span-1 xl:col-span-3 surface-card flex flex-col overflow-hidden min-h-0">

          {/* Name and tags of the open recording. Starting appends to it. */}
          {sessionId && (
            <SessionBar
              title={sessionSubject}
              tags={sessionTags}
              isActive={isActive}
              titleGenerating={titleGenerating}
              saveFailed={store.saveFailed}
              canGenerateTitle={pairs.length > 0 || notes.length > 0}
              correctionMode={correctionMode}
              correctionCount={activeCorrections.length}
              t={t}
              onTitleChange={setSessionSubject}
              onGenerateTitle={generateTitle}
              onAddTag={addTag}
              onRemoveTag={removeTag}
              onToggleCorrectionMode={() => setCorrectionMode((c) => !c)}
              onOpenCorrections={() => { setCorrectionHeard(""); setCorrectionOpen(true); }}
              onNewSession={startNewSession}
            />
          )}

          {/* Audio Visualizers — hidden by default, toggleable from the header */}
          {showVisualizer && (
            <div className="p-4.5 border-b border-[var(--border-medium)] bg-[var(--bg-subtle)] flex flex-col md:flex-row gap-4 items-stretch justify-between">
              <div className="flex-1 flex flex-col gap-1.5">
                <span className={`text-[10px] font-mono ${t.text} uppercase tracking-widest flex items-center gap-1.5`}>
                  <Mic className={`w-3 h-3 ${t.text}`} /> {tr("viz.input")}
                </span>
                <AudioVisualizer analyser={capture.inputAnalyser} isActive={isActive} color={t.vizInputColor} />
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <span className="text-[10px] font-mono text-emerald-700 uppercase tracking-widest flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3 text-emerald-700" /> {tr("viz.output")}
                </span>
                <AudioVisualizer analyser={playback.outputAnalyser} isActive={isActive} color="#059669" />
              </div>
            </div>
          )}

          <TranscriptList
            pairs={pairs}
            notes={notes}
            summaries={summaries}
            activeInput={activeInput}
            activeTranslation={activeTranslation}
            copiedId={copiedId}
            t={t}
            onCopy={copyToClipboard}
            onAddNote={addNote}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onDownloadSummary={downloadSummary}
            onImport={() => setImportOpen(true)}
          />

          <NotesInput t={t} onAddNote={addNote} />

          <Controls
            status={status}
            sourceLang={sourceLang}
            targetLang={targetLang}
            bidirectional={bidirectional}
            translate={translate}
            speak={speak}
            isMuted={isMuted}
            pairs={pairs}
            summaryLoading={summaryLoading}
            obsidianSaving={obsidianSaving}
            t={t}
            onToggle={() => (isActive || status === "connecting") ? stopTranslating() : startTranslating()}
            onMuteToggle={handleMuteToggle}
            onSummarize={handleSummarize}
            onDownloadSrt={downloadSubtitleFile}
            onOpenExport={() => setExportOpen(true)}
            onSaveObsidian={handleSaveObsidian}
            onClearTranscript={clearTranscript}
          />
        </div>
      </main>

      {/* Global Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-5 left-5 right-5 md:left-auto md:right-5 bg-[#ffdad6] border border-[#93000a]/20 text-[#93000a] p-4 rounded-xl shadow-lg max-w-md z-50 flex items-start gap-3"
          >
            <div className="text-xl font-bold mt-0.5">⚠️</div>
            <div className="flex-1">
              <h4 className="font-bold text-sm text-[#93000a] mb-0.5">{tr("error.title")}</h4>
              <p className="text-xs">{error}</p>
              <button
                id="error-close-btn"
                onClick={() => setError(null)}
                className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#93000a] bg-[#93000a]/10 hover:bg-[#93000a]/20 px-3 py-1.5 rounded cursor-pointer"
              >
                {tr("error.close")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Summary loading overlay */}
      <AnimatePresence>
        {summaryLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 surface-card px-4 py-2.5 shadow-lg flex items-center gap-2.5 text-sm text-[var(--text-secondary)]"
          >
            <Loader2 className={`w-4 h-4 animate-spin ${t.text}`} /> {tr("summary.loading")}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Obsidian saving overlay */}
      <AnimatePresence>
        {obsidianSaving && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 surface-card px-4 py-2.5 shadow-lg flex items-center gap-2.5 text-sm text-[var(--text-secondary)]"
          >
            <Loader2 className={`w-4 h-4 animate-spin ${t.text}`} /> {tr("obsidian.saving")}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Obsidian success toast */}
      <AnimatePresence>
        {obsidianStatus && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 surface-card px-4 py-2.5 shadow-lg flex items-center gap-2.5 text-sm text-[var(--text-secondary)] max-w-lg"
          >
            <BookMarked className={`w-4 h-4 shrink-0 ${t.text}`} />
            <span className="break-all">{obsidianStatus}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <ExportDialog
        open={exportOpen}
        hasNotes={notes.length > 0}
        hasSummary={summaries.length > 0}
        t={t}
        onClose={() => setExportOpen(false)}
        onExport={(format, options) => { setExportOpen(false); doExport(format, options); }}
      />

      <CorrectionDialog
        open={correctionOpen}
        heard={correctionHeard}
        rules={activeCorrections}
        t={t}
        onClose={() => { setCorrectionOpen(false); setCorrectionHeard(""); }}
        onAdd={(heard, meant, global) => { void addCorrection(heard, meant, global); }}
        onRemove={(id) => { void removeCorrection(id); }}
      />

      <RecordingsDrawer
        open={recordingsOpen}
        sessions={store.sessions}
        loading={store.listLoading}
        error={store.listError}
        currentId={sessionId}
        t={t}
        onClose={() => setRecordingsOpen(false)}
        onOpenSession={openSession}
        onDeleteSession={deleteSession}
        // The drawer's panel and the dialog both sit at z-50, above the dialog's
        // backdrop — left open, its buttons stay clickable beside the modal.
        onImport={() => { setRecordingsOpen(false); setImportOpen(true); }}
      />

      <ImportDialog
        open={importOpen}
        defaultSourceLang={sourceLang}
        t={t}
        onClose={() => setImportOpen(false)}
        onImport={importTranscript}
      />

      <ObsidianDialog
        open={obsidianDialogOpen}
        initialSubject={sessionSubject ?? ""}
        t={t}
        onClose={() => setObsidianDialogOpen(false)}
        onGenerate={requestGeneratedSubject}
        onConfirm={(subject) => { setObsidianDialogOpen(false); setSessionSubject(subject); doObsidianSave(subject); }}
      />
    </div>
    </LangContext.Provider>
  );
}
