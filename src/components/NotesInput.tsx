import { useState } from "react";
import { Send, StickyNote } from "lucide-react";
import { ThemeConfig } from "../themes";
import { useLang } from "../i18n";

interface NotesInputProps {
  t: ThemeConfig;
  onAddNote: (text: string) => void;
}

/** Chat-style input row for jotting notes into the conversation. */
export function NotesInput({ t, onAddNote }: NotesInputProps) {
  const { tr } = useLang();
  const [text, setText] = useState("");

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAddNote(trimmed);
    setText("");
  };

  return (
    <div className="px-4 py-2.5 border-t border-[var(--border-medium)] bg-[var(--bg-subtle)] flex items-end gap-2">
      <StickyNote className="w-4 h-4 mb-1.5 text-amber-500 shrink-0" />
      <textarea
        id="note-input"
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
        placeholder={tr("notes.placeholder")}
        title={tr("notes.submitHint")}
        className="flex-1 min-w-0 resize-none [field-sizing:content] max-h-28 py-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
      />
      <button
        id="note-send"
        type="button"
        onClick={submit}
        disabled={!text.trim()}
        title={tr("notes.submitHint")}
        className={`shrink-0 p-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${t.strong} ${t.strongHover} text-white`}
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
