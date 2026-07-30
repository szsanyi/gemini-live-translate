import { useEffect, useState } from "react";
import { X, FileDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ThemeConfig } from "../themes";
import { useLang } from "../i18n";
import type { ExportOptions } from "../lib/export";

type Format = "txt" | "md" | "pdf";

interface ExportDialogProps {
  open: boolean;
  hasNotes: boolean;
  hasSummary: boolean;
  t: ThemeConfig;
  onClose: () => void;
  onExport: (format: Format, options: ExportOptions) => void;
}

export function ExportDialog({ open, hasNotes, hasSummary, t, onClose, onExport }: ExportDialogProps) {
  const { tr } = useLang();
  const [format, setFormat] = useState<Format>("md");
  const [opts, setOpts] = useState<ExportOptions>({
    timestamp: true, sourceText: true, targetText: true, notes: true, summaryEn: true, summaryHu: true,
  });

  // Reset selections each time the dialog opens, disabling unavailable parts.
  useEffect(() => {
    if (open) {
      setOpts({
        timestamp: true, sourceText: true, targetText: true,
        notes: hasNotes, summaryEn: hasSummary, summaryHu: hasSummary,
      });
    }
  }, [open, hasNotes, hasSummary]);

  const toggle = (key: keyof ExportOptions) => setOpts((o) => ({ ...o, [key]: !o[key] }));

  const rows: { key: keyof ExportOptions; label: string; disabled: boolean }[] = [
    { key: "timestamp", label: tr("exportDialog.timestamp"), disabled: false },
    { key: "sourceText", label: tr("exportDialog.sourceText"), disabled: false },
    { key: "targetText", label: tr("exportDialog.targetText"), disabled: false },
    { key: "notes", label: tr("exportDialog.notes"), disabled: !hasNotes },
    { key: "summaryEn", label: tr("exportDialog.summaryEn"), disabled: !hasSummary },
    { key: "summaryHu", label: tr("exportDialog.summaryHu"), disabled: !hasSummary },
  ];

  const formats: Format[] = ["txt", "md", "pdf"];
  const formatLabel: Record<Format, string> = { txt: ".txt", md: ".md", pdf: ".pdf" };

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
                <FileDown className="w-4 h-4" /> {tr("exportDialog.title")}
              </h3>
              <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-all cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {/* Format */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{tr("exportDialog.format")}</span>
                <div className="grid grid-cols-3 gap-2">
                  {formats.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormat(f)}
                      className={`px-3 py-2 text-xs font-bold border transition-all cursor-pointer ${
                        format === f
                          ? `${t.bgSoft} ${t.borderSoft} ${t.textLight} shadow-sm`
                          : "border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      {formatLabel[f]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Include */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{tr("exportDialog.include")}</span>
                <div className="flex flex-col">
                  {rows.map((r) => (
                    <label
                      key={r.key}
                      className={`flex items-center gap-2.5 px-1 py-1.5 text-sm ${r.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer text-[var(--text-primary)]"}`}
                    >
                      <input
                        type="checkbox"
                        checked={opts[r.key]}
                        disabled={r.disabled}
                        onChange={() => toggle(r.key)}
                        className="w-4 h-4 accent-teal-600 cursor-pointer disabled:cursor-not-allowed"
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[var(--border-medium)] bg-[var(--bg-subtle)] flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--border-strong)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-all cursor-pointer"
              >
                {tr("exportDialog.cancel")}
              </button>
              <button
                type="button"
                onClick={() => onExport(format, opts)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${t.strong} ${t.strongHover} text-white`}
              >
                <FileDown className="w-3.5 h-3.5" /> {tr("exportDialog.download")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
