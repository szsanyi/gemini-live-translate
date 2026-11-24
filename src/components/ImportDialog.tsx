import { useEffect, useMemo, useState } from "react";
import { X, FileInput } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ThemeConfig } from "../themes";
import { useLang } from "../i18n";
import { LANGUAGES, langName } from "@/shared/languages";
import { parseTeamsTranscript, mergeCues, type Cue } from "@/shared/transcriptImport";
import { formatClock } from "../lib/time";

interface ImportDialogProps {
  open: boolean;
  /** Language to preselect — the app's current source language. */
  defaultSourceLang: string;
  t: ThemeConfig;
  onClose: () => void;
  onImport: (cues: Cue[], opts: { sourceLang: string; baseDate: Date }) => void;
}

/** Today as `YYYY-MM-DD` in local time, for the date input's default. */
const todayValue = (): string => {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

/**
 * Bounds for the meeting date. A date input keeps a half-typed year in its value
 * ("202" tabbed out of stays `0202-08-05`), which parses to a perfectly valid
 * `Date` and would then mint a session id its own validator rejects — every
 * autosave 400s and only a small "retrying" chip says so. Wide enough that no
 * real meeting is refused, narrow enough that a mistyped year is.
 */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/**
 * Import a transcript that was copied out of the Teams transcript pane.
 *
 * The preview doubles as the format check: a paste the parser does not understand
 * reports "no speakers or timestamps" before anything is imported.
 */
export function ImportDialog({
  open,
  defaultSourceLang,
  t,
  onClose,
  onImport,
}: ImportDialogProps) {
  const { lang: uiLang, tr } = useLang();
  const [text, setText] = useState("");
  const [sourceLang, setSourceLang] = useState(defaultSourceLang);
  const [date, setDate] = useState(todayValue);

  // Reset state each time the dialog opens, since it stays mounted and only toggles `open`.
  // Without this, the date stays stale across days, sourceLang ignores app-level changes,
  // and abandoned pastes reappear in the textarea.
  useEffect(() => {
    if (open) {
      setText("");
      setSourceLang(defaultSourceLang);
      setDate(todayValue());
    }
  }, [open, defaultSourceLang]);

  const cues = useMemo(() => mergeCues(parseTeamsTranscript(text)), [text]);
  const speakers = useMemo(
    () => new Set(cues.map((c) => c.speaker).filter((s): s is string => !!s)).size,
    [cues],
  );
  const lastEnd = cues.length > 0 ? cues[cues.length - 1].endMs : null;

  // An empty input, a partially typed year and a 5-digit year (`Invalid Date`) all
  // land here, and all block the import rather than failing after the click.
  const baseDate = useMemo(() => new Date(`${date}T00:00:00`), [date]);
  const dateValid = useMemo(() => {
    if (!Number.isFinite(baseDate.getTime())) return false;
    const year = baseDate.getFullYear();
    return year >= MIN_YEAR && year <= MAX_YEAR;
  }, [baseDate]);

  const preview =
    cues.length === 0
      ? tr("import.previewEmpty")
      : speakers === 0 || lastEnd == null
        ? tr("import.previewPlain", { cues: cues.length })
        : tr("import.preview", {
            cues: cues.length,
            speakers,
            duration: formatClock(lastEnd),
          });

  const submit = () => {
    if (cues.length === 0 || !dateValid) return;
    onImport(cues, { sourceLang, baseDate });
    setText("");
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(92vw,40rem)] surface-card shadow-2xl flex flex-col max-h-[85vh]"
          >
            <div className="px-5 py-3.5 border-b border-[var(--border-medium)] flex items-center justify-between shrink-0">
              <h2 className={`text-xs font-bold tracking-wider uppercase ${t.text} flex items-center gap-2`}>
                <FileInput className="w-4 h-4" /> {tr("import.title")}
              </h2>
              <button
                type="button" onClick={onClose} title={tr("recordings.close")}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-3 overflow-y-auto">
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                {tr("import.explain")}
              </p>

              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                  {tr("import.paste")}
                </span>
                <textarea
                  id="import-text"
                  autoFocus
                  rows={12}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={tr("import.placeholder")}
                  className="px-3 py-2 text-xs font-mono resize-y border border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)]"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                    {tr("import.sourceLang")}
                  </span>
                  <select
                    id="import-lang"
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="px-3 py-2 text-sm border border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] cursor-pointer"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{langName(l.code, uiLang)}</option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                    {tr("import.date")}
                  </span>
                  <input
                    id="import-date"
                    type="date"
                    value={date}
                    min={`${MIN_YEAR}-01-01`}
                    max={`${MAX_YEAR}-12-31`}
                    onChange={(e) => setDate(e.target.value)}
                    title={tr("import.dateHint")}
                    className="px-3 py-2 text-sm border border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)]"
                  />
                </label>
              </div>

              <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
                {preview}
              </p>

              <button
                id="import-confirm"
                type="button"
                onClick={submit}
                disabled={cues.length === 0 || !dateValid}
                className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-all cursor-pointer ${t.strong} ${t.strongHover} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {tr("import.confirm")}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
