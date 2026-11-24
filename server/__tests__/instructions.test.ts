import { describe, it, expect } from "vitest";
import { buildInstruction } from "../instructions.ts";
import type { SessionProfile } from "../../src/types.ts";

const profile = (overrides: Partial<SessionProfile> = {}): SessionProfile => ({
  sourceLang: "hu",
  targetLang: "en",
  bidirectional: false,
  translate: true,
  speak: true,
  ...overrides,
});

const TRANSLATE_MODEL = "models/gemini-3.5-live-translate-preview";
const FLASH_MODEL = "models/gemini-3.1-flash-live-preview";

describe("buildInstruction", () => {
  it("asks for a spoken translation in interpreter mode", () => {
    const { systemInstruction, speak } = buildInstruction(TRANSLATE_MODEL, profile());
    expect(speak).toBe(true);
    expect(systemInstruction).toContain("Hungarian");
    expect(systemInstruction).toContain("English");
  });

  it("uses the bidirectional prompt only for the instruction-driven model", () => {
    const { systemInstruction } = buildInstruction(FLASH_MODEL, profile({ bidirectional: true }));
    expect(systemInstruction).toContain("bidirectional");
  });

  it("silences the model when speech is off, even though translation is on", () => {
    // This is the token-saving path: the Live models reject a text-only response
    // modality, so silence has to come from the instruction.
    const { systemInstruction, speak } = buildInstruction(FLASH_MODEL, profile({ speak: false }));
    expect(speak).toBe(false);
    expect(systemInstruction).toContain("silent");
    expect(systemInstruction).not.toContain("Translate");
  });

  it("silences the model in recording mode", () => {
    const { systemInstruction, speak } = buildInstruction(FLASH_MODEL, profile({ translate: false }));
    expect(speak).toBe(false);
    expect(systemInstruction).toContain("silent");
  });

  it("treats speak as meaningless without translate", () => {
    // Nothing to say when there is no translation, so the session stays silent.
    const { speak } = buildInstruction(FLASH_MODEL, profile({ translate: false, speak: true }));
    expect(speak).toBe(false);
  });

  it("reports the source language as the target for silent sessions", () => {
    // No translationConfig is attached in silent mode; the transcript is in the
    // spoken language.
    const { targetLang } = buildInstruction(FLASH_MODEL, profile({ translate: false }));
    expect(targetLang).toBe("hu");
  });
});
