import { useState } from "react";
import { BookMarked, Sparkles, Loader2, X, Tag, Plus, Wand2 } from "lucide-react";
import { ThemeConfig } from "../themes";
import { useLang } from "../i18n";

interface SessionBarProps {
  title: string | null;
  tags: string[];
  isActive: boolean;
  titleGenerating: boolean;
  saveFailed: boolean;
  /** Enables the AI title button — there has to be something to summarise. */
  canGenerateTitle: boolean;
  /** Correction mode: while on, selecting transcript text teaches a correction. */
  correctionMode: boolean;
  correctionCount: number;
  t: ThemeConfig;
  onTitleChange: (title: string | null) => void;
  onGenerateTitle: () => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onToggleCorrectionMode: () => void;
  onOpenCorrections: () => void;
  onNewSession: () => void;
}

/**
 * Header strip for the open recording: its name, its tags, and the way out to a
 * fresh one. Kept as its own component to stop App.tsx from growing further.
 */
export function SessionBar({
  title,
  tags,
  isActive,
  titleGenerating,
  saveFailed,
  canGenerateTitle,
  correctionMode,
  correctionCount,
  t,
  onTitleChange,
  onGenerateTitle,
  onAddTag,
  onRemoveTag,
  onToggleCorrectionMode,
  onOpenCorrections,
  onNewSession,
}: SessionBarProps) {
  const { tr } = useLang();
  const [tagDraft, setTagDraft] = useState("");

  const submitTag = () => {
    const value = tagDraft.trim();
    if (value) onAddTag(value);
    setTagDraft("");
  };

  return (
    <div className="px-4.5 py-2 border-b border-[var(--border-medium)] bg-[var(--bg-subtle)] flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <BookMarked className={`w-3.5 h-3.5 shrink-0 ${t.text}`} />

        {/* Always-editable name; empty means the recording is still unnamed. */}
        <input
          id="session-title"
          value={title ?? ""}
          onChange={(e) => onTitleChange(e.target.value.trim() ? e.target.value : null)}
          placeholder={tr("session.titlePlaceholder")}
          title={tr("session.titleHint")}
          className="flex-1 min-w-0 bg-transparent text-sm font-bold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] placeholder:font-normal placeholder:italic focus:outline-none border-b border-transparent focus:border-[var(--border-strong)]"
        />

        <button
          id="generate-title"
          type="button"
          onClick={onGenerateTitle}
          disabled={titleGenerating || !canGenerateTitle}
          title={tr("session.generateTitle")}
          className={`shrink-0 p-1.5 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-all cursor-pointer ${
            titleGenerating || !canGenerateTitle ? "opacity-40 cursor-not-allowed" : ""
          }`}
        >
          {titleGenerating
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Sparkles className="w-3.5 h-3.5" />}
        </button>

        {saveFailed && (
          <span className="shrink-0 text-[10px] font-mono text-[#93000a]">{tr("recordings.saveFailed")}</span>
        )}

        {/* Correction mode. While on, selecting text in a card opens the dialog. */}
        <button
          id="correction-mode"
          type="button"
          onClick={onToggleCorrectionMode}
          title={correctionMode ? tr("corrections.modeOnHint") : tr("corrections.modeOffHint")}
          className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border transition-all cursor-pointer flex items-center gap-1.5 ${
            correctionMode
              ? `${t.strong} border-transparent text-white`
              : "border-[var(--border-strong)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Wand2 className="w-3 h-3" />
          {tr("corrections.mode")}
        </button>

        {correctionCount > 0 && (
          <button
            id="corrections-open"
            type="button"
            onClick={onOpenCorrections}
            title={tr("corrections.manage")}
            className={`shrink-0 text-[10px] font-mono px-2 py-1 rounded-full border ${t.borderFaint} ${t.bgFaint} ${t.textMid} cursor-pointer`}
          >
            {correctionCount}
          </button>
        )}

        <button
          id="new-session"
          type="button"
          onClick={onNewSession}
          className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border border-[var(--border-strong)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
        >
          {tr("recordings.new")}
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Tag className="w-3 h-3 shrink-0 text-[var(--text-muted)]" />
        {tags.map((tag) => (
          <span
            key={tag}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${t.borderFaint} ${t.bgFaint} ${t.textMid}`}
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemoveTag(tag)}
              title={tr("session.removeTag")}
              className="cursor-pointer hover:text-[#93000a]"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <span className="flex items-center gap-1">
          <input
            id="tag-input"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              // Comma is a natural tag separator, so treat it like Enter.
              if (e.key === "Enter" || e.key === ",") { e.preventDefault(); submitTag(); }
              if (e.key === "Escape") setTagDraft("");
            }}
            onBlur={submitTag}
            placeholder={tr("session.addTag")}
            className="w-24 bg-transparent text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none border-b border-transparent focus:border-[var(--border-strong)]"
          />
          {tagDraft.trim() && (
            <button type="button" onClick={submitTag} title={tr("session.addTag")} className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <Plus className="w-3 h-3" />
            </button>
          )}
        </span>
        {!isActive && (
          <span className="text-[10px] text-[var(--text-muted)] ml-auto hidden sm:inline">
            {tr("recordings.resumeHint")}
          </span>
        )}
      </div>
    </div>
  );
}
