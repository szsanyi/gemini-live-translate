import type { LangConfig } from "../src/types.ts";
import { langEnglishName } from "../shared/languages.ts";

export interface InstructionConfig {
  systemInstruction: string;
  targetLang: string;
}

/**
 * Maps model + language config to a system instruction string and BCP-47 target
 * language code. Prompts are built dynamically from the chosen languages so any
 * pair in the catalogue works. Centralised here so server.ts and the providers
 * don't embed prompt strings.
 */
export function buildInstruction(model: string, cfg: LangConfig): InstructionConfig {
  const src = langEnglishName(cfg.sourceLang);
  const tgt = langEnglishName(cfg.targetLang);

  if (model === "models/gemini-3.5-live-translate-preview") {
    // One-directional; translationConfig.targetLanguageCode drives the output.
    return {
      targetLang: cfg.targetLang,
      systemInstruction: `Translate ${src} spoken speech directly to ${tgt} spoken speech. Do not add commentaries.`,
    };
  }

  // gemini-3.1-flash-live-preview (system-instruction-only, no translationConfig)
  if (cfg.bidirectional) {
    return {
      targetLang: cfg.targetLang,
      systemInstruction: `You are a high-speed, zero-explanation bidirectional spoken interpreter between ${src} and ${tgt}. When you hear ${src}, output only the ${tgt} spoken translation immediately. When you hear ${tgt}, output only the ${src} translation immediately. Act as a natural face-to-face interpreter. Never explain, never comment. Keep translations natural and emotionally aligned.`,
    };
  }
  return {
    targetLang: cfg.targetLang,
    systemInstruction: `Translate ${src} speech directly into clear ${tgt}. Respond ONLY with the immediate spoken ${tgt} translation. Do not write explanations, do not keep the original ${src}, do not add filler.`,
  };
}
