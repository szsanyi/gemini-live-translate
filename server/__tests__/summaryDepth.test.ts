import { describe, it, expect } from "vitest";
import {
  summaryDepth,
  SUMMARY_MIN_WORDS,
  SUMMARY_MAX_WORDS,
  SUMMARY_MIN_BULLETS,
  SUMMARY_MAX_BULLETS,
} from "../providers/summary.ts";

/** A transcript of roughly `words` words, shaped like the real export. */
const transcriptOf = (words: number) =>
  Array.from({ length: words }, (_, i) => `word${i}`).join(" ");

// The summarizer input holds both the source and the translation, so a spoken minute
// (~150 words) lands as ~300 transcript words.
const minutes = (n: number) => transcriptOf(n * 300);

describe("summaryDepth", () => {
  it("asks for a longer summary as the meeting gets longer", () => {
    const short = summaryDepth(minutes(3)).targetWords;
    const medium = summaryDepth(minutes(20)).targetWords;
    const long = summaryDepth(minutes(40)).targetWords;

    expect(short).toBeLessThan(medium);
    expect(medium).toBeLessThan(long);
    // The 40-minute meeting that started this: several hundred words, not a paragraph.
    expect(long).toBeGreaterThan(400);
  });

  it("never shrinks as the input grows", () => {
    let previous = 0;
    for (const m of [1, 2, 5, 10, 20, 30, 45, 60, 90, 120]) {
      const target = summaryDepth(minutes(m)).targetWords;
      expect(target).toBeGreaterThanOrEqual(previous);
      previous = target;
    }
  });

  it("keeps a floor for a two-sentence recording and a ceiling for an all-day one", () => {
    expect(summaryDepth("Szia. Hello.").targetWords).toBe(SUMMARY_MIN_WORDS);
    expect(summaryDepth(minutes(600)).targetWords).toBe(SUMMARY_MAX_WORDS);
  });

  it("handles an empty transcript without producing nonsense", () => {
    expect(summaryDepth("").targetWords).toBe(SUMMARY_MIN_WORDS);
  });

  it("asks for more structure once there is enough material to group", () => {
    expect(summaryDepth(minutes(2)).shape).not.toContain("Action items");
    expect(summaryDepth(minutes(40)).shape).toContain("Action items");
  });

  it("scales the bullet count, which is the lever the model actually follows", () => {
    // A word target alone was measured to be weak: 520 words asked, 212 returned.
    expect(summaryDepth(minutes(2)).bullets).toBe(SUMMARY_MIN_BULLETS);
    expect(summaryDepth(minutes(24)).bullets).toBeGreaterThan(12);
    expect(summaryDepth(minutes(600)).bullets).toBe(SUMMARY_MAX_BULLETS);
  });

  it("states the counts as minimums, not as targets", () => {
    const shape = summaryDepth(minutes(24)).shape;
    expect(shape).toMatch(/at least \d+ bullet points/);
    expect(shape).toMatch(/at least \d+ words/);
  });

  it("demands coverage, which is what actually drives length", () => {
    expect(summaryDepth(minutes(40)).shape).toContain("every distinct topic");
  });

  it("tells the model not to pad, so length still follows substance", () => {
    // The user's own caveat: longer only *if* there is enough worth saying.
    expect(summaryDepth(minutes(40)).shape.toLowerCase()).toMatch(/pad|shorter|substance/);
  });
});
