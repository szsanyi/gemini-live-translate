import { Sparkles, Download } from "lucide-react";
import { motion } from "motion/react";
import { ThemeConfig } from "../themes";
import { SummaryEntry } from "../types";
import { useLang } from "../i18n";

interface SummaryCardProps {
  summary: SummaryEntry;
  t: ThemeConfig;
  onDownload: (text: string, langCode: "en" | "hu", format: "txt" | "md") => void;
}

export function SummaryCard({ summary, t, onDownload }: SummaryCardProps) {
  const { tr } = useLang();

  const section = (langCode: "en" | "hu", text: string) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase border ${t.borderFaint} ${t.bgFaint} ${t.textMid}`}>
          {langCode}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDownload(text, langCode, "txt")}
            className="px-1.5 py-0.5 text-[10px] font-semibold rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-all cursor-pointer flex items-center gap-1"
          >
            <Download className="w-3 h-3" /> .txt
          </button>
          <button
            type="button"
            onClick={() => onDownload(text, langCode, "md")}
            className="px-1.5 py-0.5 text-[10px] font-semibold rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-all cursor-pointer flex items-center gap-1"
          >
            <Download className="w-3 h-3" /> .md
          </button>
        </div>
      </div>
      <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">{text}</p>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`surface-element overflow-hidden flex flex-col`}
    >
      <div className={`px-4 py-2 bg-[var(--bg-base)] border-b border-[var(--border-faint)] flex items-center justify-between`}>
        <span className={`text-[10px] font-bold uppercase tracking-wider font-mono flex items-center gap-1.5 ${t.text}`}>
          <Sparkles className="w-3.5 h-3.5" /> {tr("summary.title")}
        </span>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">{summary.timestamp.toLocaleTimeString()}</span>
      </div>
      <div className="p-4 flex flex-col gap-3">
        {section("en", summary.en)}
        <div className="border-t border-[var(--border-faint)]" />
        {section("hu", summary.hu)}
      </div>
    </motion.div>
  );
}
