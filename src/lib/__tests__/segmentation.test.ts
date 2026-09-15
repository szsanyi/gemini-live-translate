import { describe, it, expect } from "vitest";
import {
  closeAfterMs,
  DEFAULT_SEGMENT_TUNING as D,
  endsSentence,
  readSegmentTuning,
  shouldCloseNow,
  wordCount,
} from "../segmentation";

/** A run of `n` words, optionally finished with a full stop. */
const words = (n: number, period = false) =>
  Array.from({ length: n }, (_, i) => `w${i}`).join(" ") + (period ? "." : "");

describe("endsSentence", () => {
  it("recognises the three sentence-final marks", () => {
    expect(endsSentence("It looked so scary.")).toBe(true);
    expect(endsSentence("Does that make sense?")).toBe(true);
    expect(endsSentence("Oh no!")).toBe(true);
  });

  it("sees through a trailing quote, bracket or whitespace", () => {
    expect(endsSentence('He said "we made it."  ')).toBe(true);
    expect(endsSentence("(that was the worst.)")).toBe(true);
  });

  it("knows a clause that is still running", () => {
    // Straight from a real transcript: this card began mid-clause and its
    // translation came back as "az iroda itt hamarosan".
    expect(endsSentence("I'm headed for")).toBe(false);
    expect(endsSentence("so I'll send you Yeah. Yeah. I'll take your Yeah. I'm headed for")).toBe(false);
    expect(endsSentence("")).toBe(false);
    expect(endsSentence("   ")).toBe(false);
  });

  it("does not treat a comma or an ellipsis-free trail as an ending", () => {
    expect(endsSentence("but you know,")).toBe(false);
    expect(endsSentence("uh")).toBe(false);
  });
});

describe("wordCount", () => {
  it("counts words, not characters", () => {
    expect(wordCount("It looked so scary.")).toBe(4);
    expect(wordCount("  spaced   out  ")).toBe(2);
    expect(wordCount("")).toBe(0);
  });
});

describe("closeAfterMs", () => {
  it("waits only the short pause once a whole sentence is in hand", () => {
    expect(closeAfterMs("It looked so scary.")).toBe(D.sentencePauseMs);
  });

  it("waits the full silence mid-sentence — exactly today's behaviour", () => {
    expect(closeAfterMs("the office here shortly, and I will get")).toBe(D.silenceMs);
  });

  it("makes a very short utterance earn its card with a real pause", () => {
    // "Yeah." is a complete sentence but too short to stand alone on the short pause.
    expect(closeAfterMs("Yeah.")).toBe(D.silenceMs);
    expect(closeAfterMs(words(D.minWords - 1, true))).toBe(D.silenceMs);
    expect(closeAfterMs(words(D.minWords, true))).toBe(D.sentencePauseMs);
  });

  it("is patient mid-clause and prompt at a boundary, never the other way round", () => {
    // The asymmetry that matters: a finished sentence closes on the old timing, an
    // unfinished one gets longer to finish. Shortening the boundary delay instead
    // only shrinks the window in which the live card is visible.
    expect(D.sentencePauseMs).toBeLessThanOrEqual(D.silenceMs);
    // And neither may drift above the original fixed timer: the pipeline already runs
    // 4-6 s behind the speaker, so every extra millisecond here is felt.
    expect(D.silenceMs).toBeLessThanOrEqual(1200);
  });

  it("never returns a delay longer than the mid-clause wait", () => {
    for (const t of ["", "uh", "It looked so scary.", words(200, true)]) {
      expect(closeAfterMs(t)).toBeLessThanOrEqual(D.silenceMs);
    }
  });
});

describe("shouldCloseNow", () => {
  it("does not close an ordinary card without silence", () => {
    expect(shouldCloseNow("It looked so scary.")).toBe(false);
    expect(shouldCloseNow("I'm headed for")).toBe(false);
  });

  it("takes the soft cap at the next sentence boundary, not before it", () => {
    expect(shouldCloseNow(words(D.softCapWords, false))).toBe(false);
    expect(shouldCloseNow(words(D.softCapWords, true))).toBe(true);
  });

  it("cuts anywhere once the hard cap is reached", () => {
    // An unpunctuated run must not grow without bound.
    expect(shouldCloseNow(words(D.hardCapWords, false))).toBe(true);
  });

  it("closes on a speaker change, but only at a sentence boundary", () => {
    // Reserved hook: nothing sets this yet. A false positive must never be able to
    // cut mid-clause — that is the very thing this feature removes.
    expect(shouldCloseNow("It looked so scary.", D, true)).toBe(true);
    expect(shouldCloseNow("I'm headed for", D, true)).toBe(false);
    expect(shouldCloseNow("Yeah.", D, true)).toBe(false); // below minWords
  });
});

describe("readSegmentTuning", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(readSegmentTuning(null)).toEqual(D);
    expect(readSegmentTuning(undefined)).toEqual(D);
    expect(readSegmentTuning("")).toEqual(D);
  });

  it("merges a partial override over the defaults", () => {
    const t = readSegmentTuning('{"sentencePauseMs":500,"softCapWords":45}');
    expect(t.sentencePauseMs).toBe(500);
    expect(t.softCapWords).toBe(45);
    expect(t.silenceMs).toBe(D.silenceMs);
  });

  it("ignores unknown keys and non-numeric values", () => {
    const t = readSegmentTuning('{"nonsense":1,"silenceMs":"soon","minWords":6}');
    expect(t).toEqual({ ...D, minWords: 6 });
  });

  it("falls back to the defaults on malformed JSON", () => {
    // A tuning knob must never be able to stop a recording.
    expect(readSegmentTuning("{not json")).toEqual(D);
    expect(readSegmentTuning("[]")).toEqual(D);
    expect(readSegmentTuning("7")).toEqual(D);
  });

  it("refuses values that would break segmentation", () => {
    // A zero or negative delay would close a card on every single chunk.
    expect(readSegmentTuning('{"sentencePauseMs":0}').sentencePauseMs).toBe(D.sentencePauseMs);
    expect(readSegmentTuning('{"minWords":-3}').minWords).toBe(D.minWords);
    // A hard cap below the soft cap is incoherent; keep the defaults for both.
    expect(readSegmentTuning('{"hardCapWords":10}').hardCapWords).toBe(D.hardCapWords);
  });
});
