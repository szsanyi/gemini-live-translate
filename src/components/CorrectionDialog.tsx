import { useEffect, useState } from "react";
import { X, Wand2, Trash2, Globe } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ThemeConfig } from "../themes";
import { useLang } from "../i18n";
import { type CorrectionRule } from "@/shared/corrections";

interface CorrectionDialogProps {
  open: boolean;
  /** Text selected in the transcript — the misheard form. Empty when just managing. */
  heard: string;
  /** Existing rules, for review and removal. */
  rules: CorrectionRule[];
  t: ThemeConfig;
  onClose: () => void;
  onAdd: (heard: string, meant: string, global: boolean) => void;
  onRemove: (id: string) => void;
}

/**
 * Teach a correction, and manage the ones already taught.
 *
 * Opened by selecting transcript text while correction mode is on, or from the
 * rule-count badge for review. Removal matters as much as adding: a bad rule
 * silently rewrites every future transcript.
 */
export function CorrectionDialog({
  open,
  heard,
  rules,
  t,
  onClose,
  onAdd,
  onRemove,
}: CorrectionDialogProps) {
  const { tr } = useLang();
  const [heardDraft, setHeardDraft] = useState(heard);
  const [meant, setMeant] = useState("");
  const [global, setGlobal] = useState(false);

  // Refill from the current selection each time the dialog opens.
  useEffect(() => {
    if (open) {
      setHeardDraft(heard);
      setMeant("");
      setGlobal(false);
    }
  }, [open, heard]);

  const submit = () => {
    if (!heardDraft.trim() || !meant.trim()) return;
    onAdd(heardDraft.trim(), meant.trim(), global);
    setMeant("");
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
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(92vw,32rem)] surface-card shadow-2xl flex flex-col max-h-[85vh]"
          >
            <div className="px-5 py-3.5 border-b border-[var(--border-medium)] flex items-center justify-between shrink-0">
              <h2 className={`text-xs font-bold tracking-wider uppercase ${t.text} flex items-center gap-2`}>
                <Wand2 className="w-4 h-4" /> {tr("corrections.title")}
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
                {tr("corrections.explain")}
              </p>

              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                  {tr("corrections.heard")}
                </span>
                <input
                  id="correction-heard"
                  value={heardDraft}
                  onChange={(e) => setHeardDraft(e.target.value)}
                  className="px-3 py-2 text-sm border border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)]"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                  {tr("corrections.meant")}
                </span>
                <input
                  id="correction-meant"
                  autoFocus
                  value={meant}
                  onChange={(e) => setMeant(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
                  placeholder={tr("corrections.meantPlaceholder")}
                  className="px-3 py-2 text-sm border border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)]"
                />
              </label>

              <button
                id="correction-global"
                type="button"
                onClick={() => setGlobal((g) => !g)}
                className={`px-3 py-2 text-xs font-semibold border text-left flex items-center justify-between transition-all cursor-pointer ${
                  global
                    ? `${t.bgSoft} ${t.borderSoft} ${t.textLight}`
                    : "border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" /> {tr("corrections.global")}
                </span>
                <span className="text-[10px] font-mono">{global ? tr("corrections.on") : tr("corrections.off")}</span>
              </button>

              <button
                id="correction-add"
                type="button"
                onClick={submit}
                disabled={!heardDraft.trim() || !meant.trim()}
                className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-all cursor-pointer ${t.strong} ${t.strongHover} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {tr("corrections.add")}
              </button>

              {rules.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border-medium)]">
                  <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                    {tr("corrections.existing")}
                  </span>
                  {rules.map((rule) => (
                    <div key={rule.id} className="flex items-center gap-2 text-xs surface-element px-2.5 py-1.5">
                      <span className="flex-1 min-w-0 truncate text-[var(--text-secondary)]">
                        <span className="line-through opacity-60">{rule.heard}</span>
                        {" → "}
                        <span className="font-semibold text-[var(--text-primary)]">{rule.meant}</span>
                      </span>
                      {rule.global && <Globe className={`w-3 h-3 shrink-0 ${t.text}`} title={tr("corrections.global")} />}
                      <button
                        type="button"
                        onClick={() => onRemove(rule.id)}
                        title={tr("corrections.remove")}
                        className="shrink-0 p-1 rounded text-[var(--text-muted)] hover:text-rose-600 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
