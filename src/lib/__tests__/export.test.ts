import { describe, it, expect } from "vitest";
import { buildSrt, buildTranscript, buildTranscriptBlocks, renderTranscriptText, renderTranscriptMarkdown, ALL_EXPORT_OPTIONS } from "../export";
import type { TranslationPair } from "../../types";

const pair = (overrides: Partial<TranslationPair> = {}): TranslationPair => ({
  id: "1",
  originalText: "Kát hiba volt.",
  translatedText: "There were two mistakes.",
  sourceLang: "hu",
  targetLang: "en",
  timestamp: new Date("2026-01-01T10:00:00"),
  startMs: 1000,
  endMs: 3000,
  ...overrides,
});

describe("buildSrt", () => {
  it("produces a valid SRT cue for a single pair", () => {
    const srt = buildSrt([pair()]);
    expect(srt).toContain("1\n");
    expect(srt).toContain("00:00:01,000 --> 00:00:03,000");
    expect(srt).toContain("Kát hiba volt.");
    expect(srt).toContain("There were two mistakes.");
  });

  it("numbers cues sequentially", () => {
    const srt = buildSrt([pair(), pair({ id: "2", startMs: 4000, endMs: 6000 })]);
    expect(srt).toContain("1\n");
    expect(srt).toContain("2\n");
  });

  it("applies minimum duration when endMs is missing", () => {
    const srt = buildSrt([pair({ startMs: 0, endMs: undefined })]);
    expect(srt).toContain("00:00:00,000 --> 00:00:01,200");
  });

  it("clamps a cue's end so it never overruns the next cue", () => {
    // First cue would otherwise run to 0+1200=1200ms via min duration, but the
    // next cue starts at 500ms — the end must be clamped to 500ms.
    const srt = buildSrt([
      pair({ id: "1", startMs: 0, endMs: undefined }),
      pair({ id: "2", startMs: 500, endMs: 2000 }),
    ]);
    expect(srt).toContain("00:00:00,000 --> 00:00:00,500");
  });
});

describe("buildTranscript", () => {
  it("starts with the header", () => {
    expect(buildTranscript([pair()])).toContain("LIVETRANSLATE JEGYZŐKÖNYV");
  });

  it("includes original and translated text with language labels", () => {
    const txt = buildTranscript([pair()]);
    expect(txt).toContain("HU: Kát hiba volt.");
    expect(txt).toContain("EN: There were two mistakes.");
  });

  it("prints an attached note right under its block, not at the end", () => {
    const note = {
      id: "n1",
      text: "Fontos részlet",
      timestamp: new Date("2026-01-01T10:00:05"),
      pairId: "1",
    };
    const txt = buildTranscript([pair()], [note], [], { title: "==== T ====", noteLabel: "NOTE" });
    const noteIdx = txt.indexOf("NOTE: Fontos részlet");
    const translationIdx = txt.indexOf("There were two mistakes.");
    expect(noteIdx).toBeGreaterThan(translationIdx);
    // It must sit before the block separator that closes the pair.
    expect(txt).toContain("NOTE: Fontos részlet\n--------------------------------------");
  });

  it("interleaves a standalone note as its own entry", () => {
    const note = { id: "n2", text: "Önálló", timestamp: new Date("2026-01-01T10:00:01") };
    const txt = buildTranscript([pair()], [note], [], { title: "==== T ====", noteLabel: "NOTE" });
    expect(txt).toContain("[NOTE] (");
    expect(txt).toContain("Önálló");
  });

  it("includes AI summary text in the transcript", () => {
    const summary = { id: "s1", en: "English summary.", hu: "Magyar összefoglaló.", timestamp: new Date("2026-01-01T10:01:00") };
    const txt = buildTranscript([pair()], [], [summary], { summaryLabel: "SUMMARY" });
    expect(txt).toContain("[SUMMARY] (");
    expect(txt).toContain("EN: English summary.");
    expect(txt).toContain("HU: Magyar összefoglaló.");
  });
});

describe("export options", () => {
  it("omits target text and timestamps when those options are off", () => {
    const blocks = buildTranscriptBlocks([pair()], [], []);
    const txt = renderTranscriptText(blocks, { title: "T", noteLabel: "NOTE", summaryLabel: "SUMMARY" }, {
      ...ALL_EXPORT_OPTIONS, targetText: false, timestamp: false,
    });
    expect(txt).toContain("HU: Kát hiba volt.");
    expect(txt).not.toContain("EN: There were two mistakes.");
    expect(txt).toContain("[1]");
    expect(txt).not.toContain("[1] (");
  });

  it("drops summary entirely when both summary languages are off", () => {
    const summary = { id: "s1", en: "E", hu: "H", timestamp: new Date("2026-01-01T10:01:00") };
    const blocks = buildTranscriptBlocks([pair()], [], [summary]);
    const txt = renderTranscriptText(blocks, { title: "T", noteLabel: "NOTE", summaryLabel: "SUMMARY" }, {
      ...ALL_EXPORT_OPTIONS, summaryEn: false, summaryHu: false,
    });
    expect(txt).not.toContain("[SUMMARY]");
  });

  it("renders the recorded-at date line under the title when provided", () => {
    const blocks = buildTranscriptBlocks([pair()], [], []);
    const txt = renderTranscriptText(blocks, { title: "T", noteLabel: "NOTE", summaryLabel: "SUMMARY", dateLine: "Recorded: X" });
    expect(txt).toContain("Recorded: X");
  });
});

describe("renderTranscriptMarkdown", () => {
  it("formats notes as blockquotes and pairs with bold labels", () => {
    const note = { id: "n1", text: "Megjegyzés", timestamp: new Date("2026-01-01T10:00:05"), pairId: "1" };
    const out = renderTranscriptMarkdown(
      buildTranscriptBlocks([pair()], [note], []),
      { title: "==== T ====", noteLabel: "NOTE", summaryLabel: "SUMMARY" },
    );
    expect(out).toContain("# T");
    expect(out).toContain("**HU:**");
    expect(out).toContain("> 📝 Megjegyzés");
  });
});
