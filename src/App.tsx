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
import { TranslationPair, NoteEntry, SummaryEntry, AudioSourceType } from "./types";
import { allowedSourceCodes, allowedTargetCodes, supportsBidirectional } from "@/shared/languages";
import { ThemeKey, ThemeConfig, THEMES, DEFAULT_THEME } from "./themes";
import { buildSrt, buildTranscript, buildTranscriptBlocks, renderTranscriptText, renderTranscriptMarkdown, triggerDownload, type ExportOptions } from "./lib/export";
import { downloadTranscriptPdf } from "./lib/pdf";
import { SEGMENT_SILENCE_MS } from "./lib/constants";
import { Lang, DEFAULT_LANG, LANG_STORAGE_KEY, LangContext, translate, StringKey } from "./i18n";
import { useAudioPlayback } from "./hooks/useAudioPlayback";
import { useAudioCapture } from "./hooks/useAudioCapture";
import { useTranslationSession } from "./hooks/useTranslationSession";

export default function App() {
  // Session UI configurations
  const [model, setModel] = useState<string>("models/gemini-3.5-live-translate-preview");
  const [sourceLang, setSourceLang] = useState<string>("hu");
  const [targetLang, setTargetLang] = useState<string>("en");
  const [bidirectional, setBidirectional] = useState<boolean>(false);
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
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const playback = useAudioPlayback();
  const capture = useAudioCapture();

  // Breaks the circular dep between stopTranslating and session callbacks
  const stopRef = useRef<() => void>(() => {});
  // True while capture is running — lets a mid-session reconnect (language swap)
  // reuse the live mic/tab stream instead of re-prompting for it.
  const captureActiveRef = useRef(false);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [pairs, activeInput, activeTranslation]);

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
    (key: StringKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  // Keep a ref to the latest finalize so the silence timer never fires a stale one.
  const finalizeRef = useRef<() => void>(() => {});

  // Called on every incoming text chunk: records segment start/end and arms a
  // pause timer that closes the segment into its own card after a short silence.
  const registerActivity = () => {
    const now = sessionStartRef.current > 0 ? Date.now() - sessionStartRef.current : 0;
    if (turnStartMsRef.current === null && sessionStartRef.current > 0) {
      turnStartMsRef.current = now;
    }
    lastChunkMsRef.current = now;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => finalizeRef.current(), SEGMENT_SILENCE_MS);
  };

  const handleIncomingInputSpeech = (text: string) => {
    registerActivity();
    activeInputRef.current += text;
    setActiveInput(activeInputRef.current);
  };

  const handleIncomingTranslation = (text: string) => {
    registerActivity();
    activeTranslationRef.current += text;
    setActiveTranslation(activeTranslationRef.current);
  };

  const finalizeCurrentTurn = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    const currInput = activeInputRef.current.trim();
    const currTranslate = activeTranslationRef.current.trim();
    const now = sessionStartRef.current > 0 ? Date.now() - sessionStartRef.current : 0;
    const endMs = lastChunkMsRef.current || now;
    const startMs = turnStartMsRef.current ?? endMs;

    activeInputRef.current = "";
    activeTranslationRef.current = "";
    turnStartMsRef.current = null;
    lastChunkMsRef.current = 0;
    setActiveInput("");
    setActiveTranslation("");

    if (!currInput && !currTranslate) return;

    setPairs(prev => [...prev, {
      id: Math.random().toString(),
      originalText: currInput || tr("transcript.speechCaptured"),
      translatedText: currTranslate || tr("transcript.translationPending"),
      sourceLang,
      targetLang,
      bidirectional,
      timestamp: new Date(),
      startMs,
      endMs,
    }]);
  }, [sourceLang, targetLang, bidirectional, tr]);

  finalizeRef.current = finalizeCurrentTurn;

  // session must be declared before stopTranslating so disconnect() is accessible
  const session = useTranslationSession({
    onStatus: async (s) => {
      if (s === "connected") {
        setStatus("connected");
        setIsActive(true);
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
        stopRef.current();
      }
    },
    onAudio: (base64) => playback.enqueueChunk(base64),
    onTranslation: (text) => handleIncomingTranslation(text),
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
    session.connect({ model, sourceLang: ns, targetLang: nt, bidirectional, audioSource });
  }, [finalizeCurrentTurn, playback.stopSources, session.disconnect, session.connect, model, bidirectional, audioSource]);

  const startTranslating = async () => {
    try {
      setError(null);
      setStatus("connecting");
      sessionStartRef.current = Date.now();
      turnStartMsRef.current = null;
      lastChunkMsRef.current = 0;
      activeInputRef.current = "";
      activeTranslationRef.current = "";
      setActiveInput("");
      setActiveTranslation("");
      playback.start();
      session.connect({ model, sourceLang, targetLang, bidirectional, audioSource });
    } catch (e: any) {
      setError(tr("error.startup", { msg: e.message || e }));
      setStatus("disconnected");
      setIsActive(false);
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
      setPairs([]);
      setNotes([]);
      setSummaries([]);
      activeInputRef.current = "";
      activeTranslationRef.current = "";
      setActiveInput("");
      setActiveTranslation("");
      // New session → forget the note title and any prior Obsidian file.
      setSessionSubject(null);
      setObsidianSavedPath(null);
      setObsidianDialogOpen(false);
    }
  };

  const addNote = (text: string, pairId?: string) => {
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
        // existingPath makes a repeat save overwrite this session's note.
        body: JSON.stringify({ markdown, subject, existingPath: obsidianSavedPath }),
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
      />

      <main className="flex-1 min-h-0 w-full grid grid-cols-1 xl:grid-cols-4 items-stretch">

        <SettingsPanel
          model={model}
          sourceLang={sourceLang}
          targetLang={targetLang}
          bidirectional={bidirectional}
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
          onAudioSourceChange={setAudioSource}
        />

        {/* Dialogue Log Frame — fills the available height; the transcript
            scrolls internally instead of stretching the whole page. */}
        <div className="col-span-1 xl:col-span-3 surface-card flex flex-col overflow-hidden min-h-0">

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
            chatBottomRef={chatBottomRef}
            onCopy={copyToClipboard}
            onAddNote={addNote}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onDownloadSummary={downloadSummary}
          />

          <NotesInput t={t} onAddNote={addNote} />

          <Controls
            status={status}
            sourceLang={sourceLang}
            targetLang={targetLang}
            bidirectional={bidirectional}
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
