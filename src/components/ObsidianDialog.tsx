import { useEffect, useState } from "react";
import { X, BookMarked, Sparkles, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ThemeConfig } from "../themes";
import { useLang } from "../i18n";

interface ObsidianDialogProps {
  open: boolean;
  initialSubject: string;
  t: ThemeConfig;
  onClose: () => void;
  /** Requests an AI-generated title; resolves with the suggested subject. */
  onGenerate: () => Promise<string>;
  onConfirm: (subject: string) => void;
}

export function ObsidianDialog({ open, initialSubject, t, onClose, onGenerate, onConfirm }: ObsidianDialogProps) {
  const { tr } = useLang();
  const [subject, setSubject] = useState(initialSubject);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(false);

  // Reset the field each time the dialog opens.
  useEffect(() => {
    if (open) {
      setSubject(initialSubject);
      setGenError(false);
      setGenerating(false);
    }
  }, [open, initialSubject]);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setGenError(false);
    try {
      const suggested = await onGenerate();
      if (suggested) setSubject(suggested);
      else setGenError(true);
    } catch {
      setGenError(true);
    } finally {
      setGenerating(false);
    }
  };

  const canSave = subject.trim().length > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
            className="surface-card w-full max-w-md flex flex-col overflow-hidden shadow-xl"
          >
            <div className="px-5 py-3.5 border-b border-[var(--border-medium)] bg-[var(--bg-subtle)] flex items-center justify-between">
              <h3 className={`text-sm font-bold flex items-center gap-2 ${t.text}`}>
                <BookMarked className="w-4 h-4" /> {tr("obsidian.dialogTitle")}
              </h3>
              <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-all cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{tr("obsidian.subjectLabel")}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && canSave) onConfirm(subject.trim()); }}
                    placeholder={tr("obsidian.subjectPlaceholder")}
                    className="flex-1 px-3 py-2 text-sm bg-[var(--bg-base)] border border-[var(--border-medium)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating}
                    title={tr("obsidian.generate")}
                    className={`px-3 py-2 rounded-lg flex items-center gap-1.5 text-xs font-semibold border transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait ${t.bgSoft} ${t.borderSoft} ${t.textLight} hover:shadow-sm whitespace-nowrap`}
                  >
                    {generating
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Sparkles className="w-3.5 h-3.5" />}
                    {generating ? tr("obsidian.generating") : tr("obsidian.generate")}
                  </button>
                </div>
                {genError
                  ? <span className="text-[11px] text-rose-600">{tr("obsidian.subjectErrorShort")}</span>
                  : <span className="text-[11px] text-[var(--text-muted)]">{tr("obsidian.subjectHint")}</span>}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[var(--border-medium)] bg-[var(--bg-subtle)] flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--border-strong)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-all cursor-pointer"
              >
                {tr("obsidian.cancel")}
              </button>
              <button
                type="button"
                onClick={() => onConfirm(subject.trim())}
                disabled={!canSave}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${t.strong} ${t.strongHover} text-white`}
              >
                <BookMarked className="w-3.5 h-3.5" /> {tr("obsidian.save")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
