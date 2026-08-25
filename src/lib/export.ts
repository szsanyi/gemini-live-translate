import { type TranslationPair, type NoteEntry, type SummaryEntry } from "../types";
import { formatSrtTime } from "./time";

/**
 * Build an SRT subtitle string from a list of translation pairs.
 *
 * Each cue carries the original text on line 1 and the translation on line 2. In
 * recording mode there is no translation, so the cue stays single-line rather than
 * carrying a blank second line.
 */
export function buildSrt(pairs: TranslationPair[]): string {
  return pairs
    .map((pair, index) => {
      const start = pair.startMs ?? 0;
      let end = Math.max(pair.endMs ?? start, start + 1200);
      // Never let a cue overrun the next one — keeps the file a faithful,
      // non-overlapping real-time subtitle track.
      const nextStart = pairs[index + 1]?.startMs;
      if (nextStart != null && nextStart > start) end = Math.min(end, nextStart);
      const lines = [
        `${index + 1}`,
        `${formatSrtTime(start)} --> ${formatSrtTime(end)}`,
        pair.originalText,
      ];
      if (pair.translatedText.trim()) lines.push(pair.translatedText);
      lines.push("");
      return lines.join("\n");
    })
    .join("\n");
}

export interface TranscriptLabels {
  title: string;
  noteLabel: string;
  summaryLabel: string;
  /** Optional "recorded at …" line printed under the title. */
  dateLine?: string;
}

export const DEFAULT_TRANSCRIPT_LABELS: TranscriptLabels = {
  title: "==== LIVETRANSLATE JEGYZŐKÖNYV ====",
  noteLabel: "NOTE",
  summaryLabel: "SUMMARY",
};

/** Which parts of the transcript to include in an export. */
export interface ExportOptions {
  timestamp: boolean;
  sourceText: boolean;
  targetText: boolean;
  notes: boolean;
  summaryEn: boolean;
  summaryHu: boolean;
}

export const ALL_EXPORT_OPTIONS: ExportOptions = {
  timestamp: true,
  sourceText: true,
  targetText: true,
  notes: true,
  summaryEn: true,
  summaryHu: true,
};

export type TranscriptBlock =
  | { kind: "pair"; index: number; speaker: string; time: string; src: string; tgt: string; original: string; translated: string; notes: { time: string; text: string }[] }
  | { kind: "note"; time: string; text: string }
  | { kind: "summary"; time: string; en: string; hu: string };

/**
 * Build a structured, chronological document model from pairs, notes and
 * summaries. Notes attached to a pair (`note.pairId`) hang under that pair;
 * standalone notes and summaries are interleaved by timestamp. Renderers below
 * turn this into txt / markdown / pdf so the formats stay in sync.
 */
export function buildTranscriptBlocks(
  pairs: TranslationPair[],
  notes: NoteEntry[] = [],
  summaries: SummaryEntry[] = [],
): TranscriptBlock[] {
  const attachedByPair = new Map<string, NoteEntry[]>();
  for (const n of notes) {
    if (n.pairId) {
      const arr = attachedByPair.get(n.pairId) ?? [];
      arr.push(n);
      attachedByPair.set(n.pairId, arr);
    }
  }

  const timeline = [
    ...pairs.map((p) => ({ ts: p.timestamp.getTime(), kind: "pair" as const, pair: p })),
    ...notes.filter((n) => !n.pairId).map((n) => ({ ts: n.timestamp.getTime(), kind: "note" as const, note: n })),
    ...summaries.map((s) => ({ ts: s.timestamp.getTime(), kind: "summary" as const, summary: s })),
  ].sort((a, b) => a.ts - b.ts);

  const blocks: TranscriptBlock[] = [];
  let index = 0;
  for (const item of timeline) {
    if (item.kind === "pair") {
      index++;
      const p = item.pair;
      blocks.push({
        kind: "pair",
        index,
        speaker: p.speaker ?? "",
        time: p.timestamp.toLocaleTimeString(),
        src: p.sourceLang.toUpperCase(),
        tgt: p.targetLang.toUpperCase(),
        original: p.originalText,
        translated: p.translatedText,
        notes: (attachedByPair.get(p.id) ?? []).map((n) => ({ time: n.timestamp.toLocaleTimeString(), text: n.text })),
      });
    } else if (item.kind === "note") {
      blocks.push({ kind: "note", time: item.note.timestamp.toLocaleTimeString(), text: item.note.text });
    } else {
      blocks.push({ kind: "summary", time: item.summary.timestamp.toLocaleTimeString(), en: item.summary.en, hu: item.summary.hu });
    }
  }
  return blocks;
}

const SEP = "--------------------------------------";

/** Render the document model as plain text. */
export function renderTranscriptText(
  blocks: TranscriptBlock[],
  labels: TranscriptLabels = DEFAULT_TRANSCRIPT_LABELS,
  opts: ExportOptions = ALL_EXPORT_OPTIONS,
): string {
  const lines: string[] = [`${labels.title}\n`];
  if (labels.dateLine) lines.push(`${labels.dateLine}\n`);
  for (const b of blocks) {
    if (b.kind === "pair") {
      lines.push(opts.timestamp ? `[${b.index}] (${b.time})` : `[${b.index}]`);
      if (opts.sourceText) {
        lines.push(b.speaker ? `${b.src} · ${b.speaker}: ${b.original}` : `${b.src}: ${b.original}`);
      }
      // Recording-mode blocks have no translation — don't emit a bare label.
      if (opts.targetText && b.translated) lines.push(`${b.tgt}: ${b.translated}`);
      if (opts.notes) for (const n of b.notes) lines.push(`   ${labels.noteLabel}: ${n.text}`);
      lines.push(SEP);
    } else if (b.kind === "note") {
      if (!opts.notes) continue;
      lines.push(opts.timestamp ? `[${labels.noteLabel}] (${b.time}) ${b.text}` : `[${labels.noteLabel}] ${b.text}`);
      lines.push(SEP);
    } else {
      if (!opts.summaryEn && !opts.summaryHu) continue;
      lines.push(opts.timestamp ? `[${labels.summaryLabel}] (${b.time})` : `[${labels.summaryLabel}]`);
      if (opts.summaryEn) lines.push(`EN: ${b.en}`);
      if (opts.summaryHu) lines.push(`HU: ${b.hu}`);
      lines.push(SEP);
    }
  }
  return lines.join("\n");
}

/** Render the document model as nicely formatted Markdown. */
export function renderTranscriptMarkdown(
  blocks: TranscriptBlock[],
  labels: TranscriptLabels = DEFAULT_TRANSCRIPT_LABELS,
  opts: ExportOptions = ALL_EXPORT_OPTIONS,
): string {
  const cleanTitle = labels.title.replace(/=/g, "").trim();
  const out: string[] = [`# ${cleanTitle}`, ""];
  if (labels.dateLine) out.push(`_${labels.dateLine}_`, "");
  for (const b of blocks) {
    if (b.kind === "pair") {
      out.push(opts.timestamp ? `### [${b.index}] · ${b.time}` : `### [${b.index}]`, "");
      if (opts.sourceText) {
        out.push(b.speaker ? `- **${b.src} · ${b.speaker}:** ${b.original}` : `- **${b.src}:** ${b.original}`);
      }
      if (opts.targetText && b.translated) out.push(`- **${b.tgt}:** ${b.translated}`);
      out.push("");
      if (opts.notes) {
        for (const n of b.notes) out.push(`> 📝 ${n.text}`);
        if (b.notes.length) out.push("");
      }
    } else if (b.kind === "note") {
      if (!opts.notes) continue;
      out.push(opts.timestamp ? `> 📝 **${labels.noteLabel}** · ${b.time}` : `> 📝 **${labels.noteLabel}**`, ">", `> ${b.text}`, "");
    } else {
      if (!opts.summaryEn && !opts.summaryHu) continue;
      out.push(opts.timestamp ? `## ✨ ${labels.summaryLabel} · ${b.time}` : `## ✨ ${labels.summaryLabel}`, "");
      if (opts.summaryEn) out.push(`**EN**`, "", b.en, "");
      if (opts.summaryHu) out.push(`**HU**`, "", b.hu, "");
    }
    out.push("---", "");
  }
  return out.join("\n");
}

/**
 * Plain-text transcript convenience wrapper (used for downloads and as the AI
 * summary input). `labels` is merged over the Hungarian defaults.
 */
export function buildTranscript(
  pairs: TranslationPair[],
  notes: NoteEntry[] = [],
  summaries: SummaryEntry[] = [],
  labels: Partial<TranscriptLabels> = {},
): string {
  return renderTranscriptText(buildTranscriptBlocks(pairs, notes, summaries), { ...DEFAULT_TRANSCRIPT_LABELS, ...labels });
}

/** Trigger a file download in the browser. */
export function triggerDownload(content: string, mime: string, filename: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
