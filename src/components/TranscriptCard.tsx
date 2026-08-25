import { useState, Fragment } from "react";
import { Copy, Check, StickyNote, Plus, X } from "lucide-react";
import { motion } from "motion/react";
import { ThemeConfig } from "../themes";
import { TranslationPair, NoteEntry } from "../types";
import { formatClock } from "../lib/time";
import { useLang } from "../i18n";
import { NoteCard } from "./NoteCard";

interface TranscriptCardProps {
  pair: TranslationPair;
  notes: NoteEntry[];
  copiedId: string | null;
  t: ThemeConfig;
  onCopy: (text: string, id: string) => void;
  onAddNote: (text: string, pairId: string) => void;
  onUpdateNote: (id: string, text: string) => void;
  onDeleteNote: (id: string) => void;
}

export function TranscriptCard({
  pair,
  notes,
  copiedId,
  t,
  onCopy,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
}: TranscriptCardProps) {
  const { tr } = useLang();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  // Recording mode produces no translation at all — render one full-width column
  // instead of leaving an empty second panel.
  const hasTranslation = pair.translatedText.trim().length > 0;

  const submitNote = () => {
    const trimmed = draft.trim();
    if (trimmed) onAddNote(trimmed, pair.id);
    setDraft("");
    setAdding(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      key={pair.id}
      className="group surface-element overflow-hidden flex flex-col transition-all hover:border-[var(--border-strong)]"
    >
      {/* Pair Header Row */}
      <div className="px-4 py-2 bg-[var(--bg-base)] border-b border-[var(--border-faint)] flex items-center justify-between">
        <span className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-1.5">
          {pair.startMs != null && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--bg-muted)] border border-[var(--border-strong)] text-[var(--text-secondary)]">
              ⏱ {formatClock(pair.startMs)}
            </span>
          )}
          {pair.timestamp.toLocaleTimeString()}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            id={`note-pair-${pair.id}`}
            onClick={() => setAdding(a => !a)}
            className="p-1.5 rounded-lg bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-amber-600 hover:bg-amber-50 transition-all cursor-pointer"
            title={tr("notes.addToBlock")}
          >
            <StickyNote className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            id={`copy-pair-${pair.id}`}
            onClick={() => onCopy(hasTranslation ? `${pair.originalText} ➔ ${pair.translatedText}` : pair.originalText, pair.id)}
            className="p-1.5 rounded-lg bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-all cursor-pointer"
            title={tr("transcript.copy")}
          >
            {copiedId === pair.id
              ? <Check className="w-3.5 h-3.5 text-emerald-600" />
              : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Pair Content */}
      <div className={`p-4 grid grid-cols-1 gap-3 ${hasTranslation ? "md:grid-cols-2" : ""}`}>
        {/* Source Speech */}
        <div className={`flex flex-col gap-2 ${hasTranslation ? "border-r border-transparent md:border-[var(--border-medium)] pr-0 md:pr-4.5" : ""}`}>
          <div className="flex items-center gap-2">
            {pair.bidirectional ? (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase bg-[var(--bg-muted)] text-[var(--text-muted)] border border-[var(--border-strong)]">
                {pair.sourceLang}⇄{pair.targetLang}
              </span>
            ) : (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-strong)]">
                {pair.sourceLang}
              </span>
            )}
            {pair.speaker && (
              <span className="text-[10px] font-semibold text-[var(--text-secondary)] truncate">
                {pair.speaker}
              </span>
            )}
          </div>
          {/* data-transcript-text marks the regions where selecting text teaches
              a correction (see the selection handler in App). */}
          <div data-transcript-text className="px-4 py-3 bg-[var(--bg-base)] border border-[var(--border-medium)] text-sm font-medium text-[var(--text-primary)]">
            {pair.originalText}
          </div>
        </div>

        {/* Target Translation — absent in recording mode */}
        {hasTranslation && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {pair.bidirectional ? (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded font-mono bg-[var(--bg-muted)] text-[var(--text-muted)] border border-[var(--border-strong)]">
                AUTO
              </span>
            ) : (
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase border ${t.borderFaint} ${t.bgFaint} ${t.textMid}`}>
                {pair.targetLang}
              </span>
            )}
          </div>
          <div data-transcript-text className={`px-4 py-3 text-sm font-semibold ${pair.isStreaming ? "text-[var(--text-muted)] italic" : "text-[var(--text-primary)]"} ${t.bgVeryFaint} border ${t.borderFaint} border-l-2 ${t.borderL}`}>
            {pair.translatedText}
          </div>
        </div>
        )}
      </div>

      {/* Attached notes + inline add */}
      {(notes.length > 0 || adding) && (
        <div className="px-4 pb-4 flex flex-col gap-2">
          {notes.map((n) => (
            <Fragment key={n.id}>
              <NoteCard note={n} variant="attached" onUpdate={onUpdateNote} onDelete={onDeleteNote} />
            </Fragment>
          ))}
          {adding && (
            <div className="flex items-end gap-2 bg-amber-50 border border-amber-200 px-3 py-2">
              <StickyNote className="w-3.5 h-3.5 mb-1 text-amber-500 shrink-0" />
              <textarea
                rows={1}
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitNote(); } if (e.key === "Escape") { setDraft(""); setAdding(false); } }}
                placeholder={tr("notes.placeholder")}
                title={tr("notes.submitHint")}
                className="flex-1 min-w-0 resize-none [field-sizing:content] max-h-40 py-0.5 bg-transparent text-sm text-amber-900 placeholder:text-amber-400 focus:outline-none"
              />
              <button type="button" onClick={submitNote} disabled={!draft.trim()} title={tr("notes.add")} className="p-1 rounded text-amber-600 hover:bg-amber-100 transition-all cursor-pointer disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => { setDraft(""); setAdding(false); }} title={tr("notes.cancel")} className="p-1 rounded text-amber-500 hover:bg-amber-100 transition-all cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
