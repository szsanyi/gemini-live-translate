import { useMemo, useState } from "react";
import { X, Trash2, Loader2, Mic, Volume2, FileText, Clock, Tag, FileInput } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ThemeConfig } from "../themes";
import { useLang } from "../i18n";
import { langName } from "@/shared/languages";
import { type SessionSummary } from "@/shared/session";
import { formatClock } from "../lib/time";

interface RecordingsDrawerProps {
  open: boolean;
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
  /** Id of the recording currently open in the main view, if any. */
  currentId: string | null;
  t: ThemeConfig;
  onClose: () => void;
  onOpenSession: (id: string) => void;
  onDeleteSession: (s: SessionSummary) => void;
  onImport: () => void;
}

export function RecordingsDrawer({
  open,
  sessions,
  loading,
  error,
  currentId,
  t,
  onClose,
  onOpenSession,
  onDeleteSession,
  onImport,
}: RecordingsDrawerProps) {
  const { lang: uiLang, tr } = useLang();
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Every tag in use, so filtering doesn't need a separate index.
  const allTags = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of sessions) {
      for (const tag of s.tags) if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const visible = useMemo(
    () => (tagFilter
      ? sessions.filter((s) => s.tags.some((x) => x.toLowerCase() === tagFilter.toLowerCase()))
      : sessions),
    [sessions, tagFilter],
  );

  const modeLabel = (s: SessionSummary): string =>
    !s.profile.translate ? tr("recordings.modeRecord")
    : s.profile.speak ? tr("recordings.modeInterpret")
    : tr("recordings.modeTextOnly");

  const modeIcon = (s: SessionSummary) =>
    !s.profile.translate ? <Mic className="w-3 h-3" />
    : s.profile.speak ? <Volume2 className="w-3 h-3" />
    : <FileText className="w-3 h-3" />;

  const langLabel = (s: SessionSummary): string =>
    s.profile.translate
      ? `${langName(s.profile.sourceLang, uiLang)} ${s.profile.bidirectional ? "⇄" : "→"} ${langName(s.profile.targetLang, uiLang)}`
      : langName(s.profile.sourceLang, uiLang);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md z-50 surface-card flex flex-col shadow-2xl"
          >
            <div className="px-5 py-4 border-b border-[var(--border-medium)] flex items-center justify-between shrink-0">
              <h2 className={`text-xs font-bold tracking-wider uppercase ${t.text}`}>
                {tr("recordings.title")}
              </h2>
              <button
                id="recordings-close"
                type="button"
                onClick={onClose}
                title={tr("recordings.close")}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Import gets its own labelled row. As an unlabelled icon next to the close
                button it was undiscoverable — nothing about the glyph says "paste a Teams
                transcript here" — and the two 28px targets sat close enough to mis-click. */}
            <div className="px-4 py-2.5 border-b border-[var(--border-medium)] shrink-0">
              <button
                id="recordings-import"
                type="button"
                onClick={onImport}
                className="w-full px-3 py-2 flex items-center justify-center gap-2 text-xs font-semibold border border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
              >
                <FileInput className="w-3.5 h-3.5" /> {tr("import.open")}
              </button>
            </div>

            {/* Tag filter — only worth showing once something is tagged. */}
            {allTags.length > 0 && (
              <div className="px-4 py-2.5 border-b border-[var(--border-medium)] bg-[var(--bg-subtle)] flex items-center gap-1.5 flex-wrap shrink-0">
                <Tag className="w-3 h-3 shrink-0 text-[var(--text-muted)]" />
                {allTags.map((tag) => {
                  const on = tagFilter?.toLowerCase() === tag.toLowerCase();
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTagFilter(on ? null : tag)}
                      title={on ? tr("session.clearFilter") : tr("session.filterByTag")}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                        on
                          ? `${t.strong} border-transparent text-white`
                          : `${t.borderFaint} ${t.bgFaint} ${t.textMid} hover:border-[var(--border-strong)]`
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-2.5">
              {loading && (
                <p className="text-xs text-[var(--text-muted)] flex items-center gap-2 px-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> {tr("recordings.loading")}
                </p>
              )}

              {error && (
                <p className="text-xs text-[#93000a] bg-[#ffdad6] border border-[#93000a]/20 rounded-lg px-3 py-2">
                  {tr("recordings.listError", { msg: error })}
                </p>
              )}

              {!loading && !error && visible.length === 0 && (
                <p className="text-xs text-[var(--text-muted)] px-1 leading-relaxed">
                  {tr("recordings.empty")}
                </p>
              )}

              {visible.map((s) => (
                <div
                  key={s.id}
                  className={`surface-element p-3.5 flex flex-col gap-2 transition-all ${
                    s.id === currentId ? `${t.borderSoft} ${t.bgVeryFaint} border` : "hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      id={`open-session-${s.id}`}
                      onClick={() => onOpenSession(s.id)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                        {s.title ?? tr("recordings.untitled")}
                      </p>
                      <p className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                        {s.createdAt.toLocaleString()}
                      </p>
                    </button>
                    <button
                      type="button"
                      id={`delete-session-${s.id}`}
                      onClick={() => onDeleteSession(s)}
                      title={tr("recordings.deleteTitle")}
                      className="shrink-0 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase border flex items-center gap-1 ${t.borderFaint} ${t.bgFaint} ${t.textMid}`}>
                      {modeIcon(s)} {modeLabel(s)}
                    </span>
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded uppercase bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-strong)]">
                      {langLabel(s)}
                    </span>
                    {s.elapsedMs > 0 && (
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-strong)] flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> {formatClock(s.elapsedMs)}
                      </span>
                    )}
                  </div>

                  {s.tags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {s.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setTagFilter(tag)}
                          title={tr("session.filterByTag")}
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-strong)] cursor-pointer hover:border-[var(--border-strong)]"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] text-[var(--text-muted)] font-mono">
                    {tr("recordings.counts", {
                      pairs: s.pairCount,
                      notes: s.noteCount,
                      summaries: s.summaryCount,
                    })}
                  </p>
                </div>
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
