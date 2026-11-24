import { Fragment } from "react";
import { Languages, Sparkles, FileInput, ArrowDown } from "lucide-react";
import { ThemeConfig } from "../themes";
import { TranslationPair, NoteEntry, SummaryEntry } from "../types";
import { TranscriptCard } from "./TranscriptCard";
import { NoteCard } from "./NoteCard";
import { SummaryCard } from "./SummaryCard";
import { useStickToBottom } from "../hooks/useStickToBottom";
import { useLang } from "../i18n";

interface TranscriptListProps {
  pairs: TranslationPair[];
  notes: NoteEntry[];
  summaries: SummaryEntry[];
  activeInput: string;
  activeTranslation: string;
  copiedId: string | null;
  t: ThemeConfig;
  onCopy: (text: string, id: string) => void;
  onAddNote: (text: string, pairId: string) => void;
  onUpdateNote: (id: string, text: string) => void;
  onDeleteNote: (id: string) => void;
  onDownloadSummary: (text: string, langCode: "en" | "hu", format: "txt" | "md") => void;
  /** Opens the transcript-import dialog from the empty state. */
  onImport: () => void;
}

export function TranscriptList({
  pairs,
  notes,
  summaries,
  activeInput,
  activeTranslation,
  copiedId,
  t,
  onCopy,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onDownloadSummary,
  onImport,
}: TranscriptListProps) {
  const { tr } = useLang();
  // Follow the conversation while the user is at the bottom, and get out of the way
  // the moment they scroll up to read or annotate something.
  const { containerRef, atBottom, scrollToBottom } = useStickToBottom<HTMLDivElement>([
    pairs, notes, summaries, activeInput, activeTranslation,
  ]);
  // Standalone notes (no pairId) live in the chronological timeline; notes
  // attached to a pair render inside that card. Summaries also join the timeline.
  const standaloneNotes = notes.filter((n) => !n.pairId);
  const timeline = [
    ...pairs.map((p) => ({ kind: "pair" as const, ts: p.timestamp.getTime(), pair: p })),
    ...standaloneNotes.map((n) => ({ kind: "note" as const, ts: n.timestamp.getTime(), note: n })),
    ...summaries.map((s) => ({ kind: "summary" as const, ts: s.timestamp.getTime(), summary: s })),
  ].sort((a, b) => a.ts - b.ts);

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <div ref={containerRef} className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 bg-[var(--bg-base)] min-h-0">
        {pairs.length === 0 && notes.length === 0 && summaries.length === 0 && !activeInput && !activeTranslation && (
          <div className="my-auto text-center flex flex-col items-center justify-center p-6 text-[var(--text-muted)]">
            <div className="w-16 h-16 bg-[var(--bg-subtle)] border border-[var(--border-medium)] flex items-center justify-center mb-5 shadow-sm">
              <Languages className={`w-8 h-8 ${t.text} animate-pulse`} />
            </div>
            <p className="text-sm text-[var(--text-muted)]">{tr("transcript.empty")}</p>
            {/* The second way in. Shown only here, where the screen is empty anyway, so the
                import costs no permanent chrome and appears exactly when it is useful. */}
            <p className="mt-5 text-xs text-[var(--text-muted)]">{tr("import.emptyHint")}</p>
            <button
              id="empty-import"
              type="button"
              onClick={onImport}
              className="mt-2 px-4 py-2 flex items-center gap-2 text-xs font-semibold border border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
            >
              <FileInput className="w-3.5 h-3.5" /> {tr("import.open")}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {timeline.map((item) => (
            <Fragment key={item.kind === "pair" ? item.pair.id : item.kind === "note" ? item.note.id : item.summary.id}>
              {item.kind === "pair" ? (
                <TranscriptCard
                  pair={item.pair}
                  notes={notes.filter((n) => n.pairId === item.pair.id)}
                  copiedId={copiedId}
                  t={t}
                  onCopy={onCopy}
                  onAddNote={onAddNote}
                  onUpdateNote={onUpdateNote}
                  onDeleteNote={onDeleteNote}
                />
              ) : item.kind === "note" ? (
                <NoteCard note={item.note} variant="bubble" onUpdate={onUpdateNote} onDelete={onDeleteNote} />
              ) : (
                <SummaryCard summary={item.summary} t={t} onDownload={onDownloadSummary} />
              )}
            </Fragment>
          ))}

          {/* Live incoming speech stream */}
          {(activeInput || activeTranslation) && (
            <div className={`border ${t.borderFaint} ${t.bgDeep} p-4 animate-pulse-gaze flex flex-col gap-3`}>
              <div className={`flex items-center border-b ${t.borderDeep} pb-2`}>
                <span className={`text-[10px] font-bold ${t.text} tracking-wider flex items-center gap-1.5 uppercase font-mono`}>
                  <Sparkles className={`w-3 h-3 ${t.text}`} /> {tr("transcript.live")}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`flex flex-col gap-2 pr-0 md:pr-4 md:border-r md:${t.borderDeepAlt}`}>
                  <span className="text-[9px] font-mono text-[var(--text-muted)]">{tr("transcript.justSaid")}</span>
                  <p className="text-sm text-[var(--text-primary)] italic leading-relaxed">
                    {activeInput || tr("transcript.listening")}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[9px] font-mono text-[var(--text-muted)]">{tr("transcript.instant")}</span>
                  <p className={`text-sm ${t.textMid} font-bold leading-relaxed`}>
                    {activeTranslation || "..."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Shown only while the user is reading further up: the way back to the live
          edge, without the view ever being yanked there on its own. */}
      {!atBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-2 flex items-center gap-2 text-xs font-semibold border border-[var(--border-strong)] bg-[var(--bg-raised)] text-[var(--text-primary)] shadow-lg hover:border-[var(--accent-primary)] transition-all cursor-pointer"
        >
          <ArrowDown className="w-3.5 h-3.5" /> {tr("transcript.goToCurrent")}
        </button>
      )}
    </div>
  );
}
