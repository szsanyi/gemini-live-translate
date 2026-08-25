import { Mic, MicOff, Volume2, VolumeX, Captions, FileDown, Trash2, Sparkles, Loader2, BookMarked } from "lucide-react";
import { ThemeConfig } from "../themes";
import { TranslationPair } from "../types";
import { useLang } from "../i18n";
import { langName } from "@/shared/languages";

interface ControlsProps {
  status: "disconnected" | "connecting" | "connected";
  sourceLang: string;
  targetLang: string;
  bidirectional: boolean;
  translate: boolean;
  speak: boolean;
  isMuted: boolean;
  pairs: TranslationPair[];
  summaryLoading: boolean;
  obsidianSaving: boolean;
  t: ThemeConfig;
  onToggle: () => void;
  onMuteToggle: () => void;
  onSummarize: () => void;
  onDownloadSrt: () => void;
  onOpenExport: () => void;
  onSaveObsidian: () => void;
  onClearTranscript: () => void;
}

export function Controls({
  status,
  sourceLang,
  targetLang,
  bidirectional,
  translate,
  speak,
  isMuted,
  pairs,
  summaryLoading,
  obsidianSaving,
  t,
  onToggle,
  onMuteToggle,
  onSummarize,
  onDownloadSrt,
  onOpenExport,
  onSaveObsidian,
  onClearTranscript,
}: ControlsProps) {
  const { lang: uiLang, tr } = useLang();
  // Recording mode has no target language, so show the spoken language alone.
  const dirLabel = translate
    ? `${langName(sourceLang, uiLang)} ${bidirectional ? "⇄" : "→"} ${langName(targetLang, uiLang)}`
    : langName(sourceLang, uiLang);
  // Nothing is being generated to mute when the model is silent.
  const muteDisabled = !speak;

  return (
    <>
      {/* Download / clear toolbar — shown only when there are pairs */}
      {pairs.length > 0 && (
        <div className="px-5 py-2.5 bg-[var(--bg-subtle)] border-t border-[var(--border-strong)] flex justify-between items-center text-xs">
          <span className="text-[var(--text-muted)] font-mono font-semibold">{tr("controls.sentences", { n: pairs.length })}</span>
          <div className="flex items-center gap-2">
            <button
              id="ai-summary"
              type="button"
              onClick={onSummarize}
              disabled={summaryLoading}
              title={tr("controls.summaryTitle")}
              className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait ${t.bgSoft} ${t.borderSoft} border ${t.textLight} hover:shadow-sm`}
            >
              {summaryLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5" />}
              {tr("controls.summary")}
            </button>
            <button
              id="download-subtitle"
              type="button"
              onClick={onDownloadSrt}
              title={tr("controls.srtTitle")}
              className="px-3 py-1.5 bg-[var(--bg-raised)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Captions className={`w-3.5 h-3.5 ${t.text}`} /> {tr("controls.srt")}
            </button>

            <button
              id="download-transcript"
              type="button"
              onClick={onOpenExport}
              title={tr("controls.transcriptTitle")}
              className="px-3 py-1.5 bg-[var(--bg-raised)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <FileDown className={`w-3.5 h-3.5 ${t.text}`} /> {tr("controls.transcript")}
            </button>

            <button
              id="save-obsidian"
              type="button"
              onClick={onSaveObsidian}
              disabled={obsidianSaving}
              title={tr("controls.obsidianTitle")}
              className="px-3 py-1.5 bg-[var(--bg-raised)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              {obsidianSaving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <BookMarked className={`w-3.5 h-3.5 ${t.text}`} />}
              {tr("controls.obsidian")}
            </button>

            <button
              id="purge-transcript"
              type="button"
              onClick={onClearTranscript}
              className="px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> {tr("controls.clear")}
            </button>
          </div>
        </div>
      )}

      {/* Main action bar */}
      <div className="px-5 py-2.5 border-t border-[var(--border-strong)] bg-[var(--bg-muted)] flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono">
          {dirLabel}
        </span>

        <div className="flex items-center gap-2.5">
          {/* Mute output */}
          <button
            id="volume-toggle"
            type="button"
            onClick={onMuteToggle}
            disabled={muteDisabled}
            className={`p-2.5 rounded-full border transition-all cursor-pointer ${
              isMuted
                ? "bg-rose-50 border-rose-200 text-rose-600"
                : "bg-[var(--bg-raised)] border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
            } ${muteDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
            title={
              muteDisabled ? tr("controls.muteUnavailable")
              : isMuted ? tr("controls.unmuteTitle")
              : tr("controls.muteTitle")
            }
          >
            {isMuted || muteDisabled ? <VolumeX className={`w-4 h-4 ${isMuted ? "animate-pulse" : ""}`} /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Start / stop */}
          <button
            id="main-translate-trigger"
            type="button"
            onClick={onToggle}
            className={`px-6 py-2.5 rounded-full font-bold text-sm flex items-center gap-2 transition-all cursor-pointer ${
              status === "connected"
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg glow-rose"
                : status === "connecting"
                ? "bg-amber-600 hover:bg-amber-500 text-white shadow-lg"
                : `${t.strong} ${t.strongHover} text-white shadow-lg glow-primary`
            }`}
          >
            {status === "connected" ? (
              <>
                <MicOff className="w-4 h-4 animate-pulse" />
                <span>{tr("controls.stop")}</span>
              </>
            ) : status === "connecting" ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{tr("controls.connecting")}</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 animate-bounce-slow" />
                <span>{tr("controls.start")}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
