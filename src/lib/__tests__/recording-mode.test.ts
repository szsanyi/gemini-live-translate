import { describe, it, expect } from "vitest";
import {
  buildSrt,
  buildTranscriptBlocks,
  renderTranscriptText,
  renderTranscriptMarkdown,
  ALL_EXPORT_OPTIONS,
} from "../export";
import type { TranslationPair } from "../../types";

/**
 * Recording mode (translation switched off) produces pairs with no translated
 * text. Every export path must degrade to a single-language document instead of
 * emitting empty labels or blank subtitle lines.
 */
const recorded = (overrides: Partial<TranslationPair> = {}): TranslationPair => ({
  id: "1",
  originalText: "Ez egy rögzített telefonbeszélgetés.",
  translatedText: "",
  sourceLang: "hu",
  targetLang: "en",
  timestamp: new Date("2026-01-01T10:00:00"),
  startMs: 1000,
  endMs: 3000,
  ...overrides,
});

describe("buildSrt without translations", () => {
  it("emits a single-line cue instead of a trailing blank line", () => {
    const srt = buildSrt([recorded()]);
    expect(srt).toContain("Ez egy rögzített telefonbeszélgetés.");
    // Cue body is one line: after the text comes the cue separator, not an empty
    // line standing in for a missing translation.
    expect(srt).toBe(
      "1\n00:00:01,000 --> 00:00:03,000\nEz egy rögzített telefonbeszélgetés.\n",
    );
  });

  it("still numbers and times multiple cues correctly", () => {
    const srt = buildSrt([
      recorded(),
      recorded({ id: "2", originalText: "Második mondat.", startMs: 4000, endMs: 6000 }),
    ]);
    expect(srt).toContain("00:00:04,000 --> 00:00:06,000");
    expect(srt).toContain("Második mondat.");
    expect(srt.split("\n\n").length).toBe(2);
  });

  it("keeps the translation line when one is present", () => {
    const srt = buildSrt([recorded({ translatedText: "This is a recorded call." })]);
    expect(srt).toContain("This is a recorded call.");
  });
});

describe("text export without translations", () => {
  it("omits the target-language row entirely", () => {
    const blocks = buildTranscriptBlocks([recorded()]);
    const txt = renderTranscriptText(blocks, undefined, ALL_EXPORT_OPTIONS);
    expect(txt).toContain("HU: Ez egy rögzített telefonbeszélgetés.");
    // No bare "EN:" label for a translation that does not exist.
    expect(txt).not.toContain("EN:");
  });

  it("still renders the target row for translated pairs", () => {
    const blocks = buildTranscriptBlocks([recorded({ translatedText: "A recorded call." })]);
    const txt = renderTranscriptText(blocks, undefined, ALL_EXPORT_OPTIONS);
    expect(txt).toContain("EN: A recorded call.");
  });
});

describe("markdown export without translations", () => {
  it("omits the target bullet entirely", () => {
    const blocks = buildTranscriptBlocks([recorded()]);
    const md = renderTranscriptMarkdown(blocks, undefined, ALL_EXPORT_OPTIONS);
    expect(md).toContain("**HU:** Ez egy rögzített telefonbeszélgetés.");
    expect(md).not.toContain("**EN:**");
  });
});
