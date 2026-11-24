import { describe, it, expect } from "vitest";
import { parseDurationMs, spokenLanguageCodes } from "../providers/gemini.ts";
import type { SessionProfile } from "../../src/types.ts";

const profile = (overrides: Partial<SessionProfile> = {}): SessionProfile => ({
  sourceLang: "en",
  targetLang: "hu",
  bidirectional: false,
  translate: true,
  speak: false,
  ...overrides,
});

describe("spokenLanguageCodes", () => {
  it("hints only the source language for a one-way session", () => {
    // The target is what the model outputs, not what the microphone hears.
    expect(spokenLanguageCodes(profile())).toEqual(["en"]);
  });

  it("hints both languages when both are actually spoken", () => {
    expect(spokenLanguageCodes(profile({ bidirectional: true }))).toEqual(["en", "hu"]);
  });

  it("never produces an empty list, which would re-enable auto-detection", () => {
    // An empty `languageCodes` is documented as the same as omitting it: the ASR falls
    // back to automatic detection, which was observed flipping English to Spanish
    // mid-recording.
    expect(spokenLanguageCodes(profile()).length).toBeGreaterThan(0);
    expect(spokenLanguageCodes(profile({ bidirectional: true, targetLang: "" })).length)
      .toBeGreaterThan(0);
  });

  it("does not repeat a language", () => {
    expect(spokenLanguageCodes(profile({ bidirectional: true, targetLang: "en" }))).toEqual(["en"]);
  });
});

describe("parseDurationMs", () => {
  it("reads a protobuf duration string", () => {
    // goAway.timeLeft arrives like this — seconds as a string, sometimes fractional.
    expect(parseDurationMs("5s")).toBe(5000);
    expect(parseDurationMs("1.5s")).toBe(1500);
    expect(parseDurationMs("0.25s")).toBe(250);
  });

  it("has no answer when the field is absent or unparseable", () => {
    expect(parseDurationMs(undefined)).toBeUndefined();
    expect(parseDurationMs("")).toBeUndefined();
    expect(parseDurationMs("soon")).toBeUndefined();
  });
});
