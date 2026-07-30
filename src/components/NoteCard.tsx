import { useState } from "react";
import { StickyNote, X, Pencil, Check } from "lucide-react";
import { motion } from "motion/react";
import { NoteEntry } from "../types";
import { useLang } from "../i18n";

interface NoteCardProps {
  note: NoteEntry;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  /** "bubble" = standalone timeline note; "attached" = compact note under a card. */
  variant?: "bubble" | "attached";
}

export function NoteCard({ note, onUpdate, onDelete, variant = "bubble" }: NoteCardProps) {
  const { tr } = useLang();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed) onUpdate(note.id, trimmed);
    setEditing(false);
  };
  const cancel = () => { setDraft(note.text); setEditing(false); };

  const container = variant === "bubble"
    ? "group self-end max-w-[85%] bg-amber-50 border border-amber-200 text-amber-900 px-3.5 py-2.5 flex items-start gap-2.5"
    : "group bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 flex items-start gap-2";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={container}
    >
      <StickyNote className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider font-mono text-amber-600">{tr("notes.label")}</span>
          <span className="text-[9px] font-mono text-amber-500">{note.timestamp.toLocaleTimeString()}</span>
        </div>
        {editing ? (
          <textarea
            rows={1}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } if (e.key === "Escape") cancel(); }}
            title={tr("notes.submitHint")}
            className="w-full resize-none [field-sizing:content] max-h-40 bg-white border border-amber-300 px-2 py-1 text-sm text-amber-900 focus:outline-none focus:border-amber-500"
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">{note.text}</p>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {editing ? (
          <>
            <button type="button" onClick={save} title={tr("notes.save")} className="p-1 rounded text-amber-600 hover:text-amber-800 hover:bg-amber-100 transition-all cursor-pointer">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={cancel} title={tr("notes.cancel")} className="p-1 rounded text-amber-500 hover:text-amber-700 hover:bg-amber-100 transition-all cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => { setDraft(note.text); setEditing(true); }} title={tr("notes.edit")} className="opacity-0 group-hover:opacity-100 p-1 rounded text-amber-500 hover:text-amber-700 hover:bg-amber-100 transition-all cursor-pointer">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => onDelete(note.id)} title={tr("notes.delete")} className="opacity-0 group-hover:opacity-100 p-1 rounded text-amber-500 hover:text-amber-700 hover:bg-amber-100 transition-all cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
