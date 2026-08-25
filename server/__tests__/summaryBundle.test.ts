import { describe, it, expect } from "vitest";
import { parseSummaryBundle } from "../providers/summary.ts";

describe("parseSummaryBundle", () => {
  it("reads all three sections out of one response", () => {
    const out = parseSummaryBundle(`### SUMMARY (EN)
The team went through the budget and agreed to postpone the hire.

### SUMMARY (HU)
A csapat átnézte a költségvetést és elnapolta a felvételt.

### TITLE
Budget review and hiring freeze`);

    expect(out.en).toBe("The team went through the budget and agreed to postpone the hire.");
    expect(out.hu).toBe("A csapat átnézte a költségvetést és elnapolta a felvételt.");
    expect(out.subject).toBe("Budget review and hiring freeze");
  });

  it("tolerates a preamble, stray blank lines and a different header depth", () => {
    const out = parseSummaryBundle(`Sure, here you go:

## Summary (EN)

First point.
Second point.


## summary (hu)
Első pont.
Második pont.

## Title
Two topics discussed
`);

    expect(out.en).toBe("First point.\nSecond point.");
    expect(out.hu).toBe("Első pont.\nMásodik pont.");
    expect(out.subject).toBe("Two topics discussed");
  });

  it("strips quotes from the title, like the single-title prompt does", () => {
    const out = parseSummaryBundle(`### SUMMARY (EN)\na\n\n### SUMMARY (HU)\nb\n\n### TITLE\n"Quoted title"`);
    expect(out.subject).toBe("Quoted title");
  });

  it("leaves a missing section empty so the caller can decide what to do", () => {
    const out = parseSummaryBundle(`### SUMMARY (EN)\nOnly English arrived.`);
    expect(out.en).toBe("Only English arrived.");
    expect(out.hu).toBe("");
    expect(out.subject).toBe("");
  });

  it("returns nothing at all when the model ignored the format", () => {
    // The caller falls back to the per-language prompts on this, rather than
    // showing the raw blob as a summary.
    const out = parseSummaryBundle("I'm not going to use your headers, here is a summary instead.");
    expect(out).toEqual({ en: "", hu: "", subject: "" });
  });
});
