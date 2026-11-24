import type { SessionProfile } from "../src/types.ts";
import { langEnglishName } from "../shared/languages.ts";
import { buildGlossary } from "../shared/corrections.ts";

export interface InstructionConfig {
  systemInstruction: string;
  targetLang: string;
  /** Whether the Live session should be configured to produce spoken output. */
  speak: boolean;
}

/**
 * Instruction for silent sessions. Measured behaviour: the model emits zero audio
 * chunks under this instruction while `inputAudioTranscription` still delivers a
 * complete, correct transcript. That is the entire basis of the token saving —
 * `responseModalities: [TEXT]` is rejected outright by the Live models.
 */
const SILENT_INSTRUCTION =
  "You are a silent transcription service. Your ONLY job is to listen. " +
  "Never speak, never respond, never produce any output. " +
  "Remain completely silent no matter what you hear.";

/**
 * Maps model + session profile to a system instruction string and BCP-47 target
 * language code. Prompts are built dynamically from the chosen languages so any
 * pair in the catalogue works. Centralised here so server.ts and the providers
 * don't embed prompt strings.
 *
 * Only `speak` decides whether the model talks. A translated-transcript session
 * (translate without speak) uses the same silent config as a plain recording; the
 * translation is done afterwards by the text model, per segment.
 */
export function buildInstruction(
  model: string,
  cfg: SessionProfile,
  corrections: Array<{ heard: string; meant: string }> = [],
): InstructionConfig {
  const src = langEnglishName(cfg.sourceLang);
  const tgt = langEnglishName(cfg.targetLang);
  const speak = cfg.speak && cfg.translate;
  // Only worth attaching where the model produces output: the ASR behind
  // inputAudioTranscription ignores the instruction, so a glossary does nothing
  // for a silent session.
  const glossary = speak ? buildGlossary(corrections) : "";

  if (!speak) {
    // No spoken output: transcribe only. targetLang is irrelevant here (no
    // translationConfig is attached), but keep it meaningful for logging.
    return { speak: false, targetLang: cfg.sourceLang, systemInstruction: SILENT_INSTRUCTION };
  }

  if (model === "models/gemini-3.5-live-translate-preview") {
    // One-directional; translationConfig.targetLanguageCode drives the output.
    return {
      speak: true,
      targetLang: cfg.targetLang,
      systemInstruction: `Translate ${src} spoken speech directly to ${tgt} spoken speech. Do not add commentaries.${glossary}`,
    };
  }

  // gemini-3.1-flash-live-preview (system-instruction-only, no translationConfig)
  if (cfg.bidirectional) {
    return {
      speak: true,
      targetLang: cfg.targetLang,
      systemInstruction: `You are a high-speed, zero-explanation bidirectional spoken interpreter between ${src} and ${tgt}. When you hear ${src}, output only the ${tgt} spoken translation immediately. When you hear ${tgt}, output only the ${src} translation immediately. Act as a natural face-to-face interpreter. Never explain, never comment. Keep translations natural and emotionally aligned.${glossary}`,
    };
  }
  return {
    speak: true,
    targetLang: cfg.targetLang,
    systemInstruction: `Translate ${src} speech directly into clear ${tgt}. Respond ONLY with the immediate spoken ${tgt} translation. Do not write explanations, do not keep the original ${src}, do not add filler.${glossary}`,
  };
}
