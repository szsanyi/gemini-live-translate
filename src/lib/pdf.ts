import { jsPDF } from "jspdf";
import type { TranscriptBlock, TranscriptLabels, ExportOptions } from "./export";
import { ALL_EXPORT_OPTIONS } from "./export";

// DejaVuSans (normal + bold) is a full-Unicode font (Hungarian ő/ű, accents)
// that jsPDF's built-in Helvetica cannot render. Served from /public, fetched
// once on demand. Emoji are avoided in PDF output (no color-emoji glyphs).
const fontCache: Record<string, Promise<string>> = {};

function loadFontBase64(file: string): Promise<string> {
  if (!fontCache[file]) {
    fontCache[file] = fetch(`/fonts/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Font load failed: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        let binary = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      });
  }
  return fontCache[file];
}

/** Render the structured transcript document into a styled, paginated PDF. */
export async function downloadTranscriptPdf(
  blocks: TranscriptBlock[],
  labels: TranscriptLabels,
  filename: string,
  opts: ExportOptions = ALL_EXPORT_OPTIONS,
): Promise<void> {
  const [normal, bold] = await Promise.all([
    loadFontBase64("DejaVuSans.ttf"),
    loadFontBase64("DejaVuSans-Bold.ttf"),
  ]);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.addFileToVFS("DejaVuSans.ttf", normal);
  doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", bold);
  doc.addFont("DejaVuSans-Bold.ttf", "DejaVu", "bold");

  const margin = 44;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (h: number) => {
    if (y + h > pageHeight - margin) { doc.addPage(); y = margin; }
  };

  // Write wrapped text in a given style; advances `y`.
  const write = (
    text: string,
    opts: { size?: number; style?: "normal" | "bold"; color?: [number, number, number]; indent?: number } = {},
  ) => {
    const size = opts.size ?? 11;
    doc.setFont("DejaVu", opts.style ?? "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(opts.color ?? [30, 30, 30]));
    const indent = opts.indent ?? 0;
    const lineHeight = size * 1.35;
    const lines = doc.splitTextToSize(text, maxWidth - indent) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, margin + indent, y);
      y += lineHeight;
    }
  };

  const gap = (h: number) => { y += h; };

  const rule = () => {
    ensureSpace(12);
    doc.setDrawColor(210, 214, 218);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;
  };

  // Title + optional recorded-at line
  write(labels.title.replace(/=/g, "").trim(), { size: 17, style: "bold", color: [17, 94, 89] });
  if (labels.dateLine) { gap(2); write(labels.dateLine, { size: 9, color: [120, 120, 120] }); }
  gap(8);

  for (const b of blocks) {
    if (b.kind === "pair") {
      write(opts.timestamp ? `[${b.index}] · ${b.time}` : `[${b.index}]`, { size: 11, style: "bold", color: [80, 80, 80] });
      gap(2);
      if (opts.sourceText) {
        write(b.speaker ? `${b.src} · ${b.speaker}` : b.src, { size: 9, style: "bold", color: [120, 120, 120] });
        write(b.original, { size: 11 });
        gap(3);
      }
      // Recording-mode blocks have no translation — skip the label too.
      if (opts.targetText && b.translated) {
        write(b.tgt, { size: 9, style: "bold", color: [17, 94, 89] });
        write(b.translated, { size: 11 });
      }
      if (opts.notes) for (const n of b.notes) {
        gap(2);
        write(`— ${labels.noteLabel}: ${n.text}`, { size: 10, color: [161, 98, 7], indent: 12 });
      }
    } else if (b.kind === "note") {
      if (!opts.notes) continue;
      write(opts.timestamp ? `${labels.noteLabel} · ${b.time}` : labels.noteLabel, { size: 9, style: "bold", color: [161, 98, 7] });
      write(b.text, { size: 11, color: [120, 80, 10] });
    } else {
      if (!opts.summaryEn && !opts.summaryHu) continue;
      write(opts.timestamp ? `${labels.summaryLabel} · ${b.time}` : labels.summaryLabel, { size: 13, style: "bold", color: [17, 94, 89] });
      gap(3);
      if (opts.summaryEn) {
        write("EN", { size: 9, style: "bold", color: [120, 120, 120] });
        write(b.en, { size: 11 });
        gap(3);
      }
      if (opts.summaryHu) {
        write("HU", { size: 9, style: "bold", color: [120, 120, 120] });
        write(b.hu, { size: 11 });
      }
    }
    gap(6);
    rule();
  }

  doc.save(filename);
}
