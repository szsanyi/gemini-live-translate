import { runTextPrompt } from "./textModel.ts";
import { langEnglishName } from "../../shared/languages.ts";
import { buildGlossary } from "../../shared/corrections.ts";

/**
 * Translates one finished transcript segment with a text model.
 *
 * Used by the translated-transcript mode, where the Live model is silenced (it
 * cannot be switched to a text-only response modality, so silencing it is the only
 * way to avoid paying for generated speech). The client sends each segment as soon
 * as its pause-based boundary closes, which is what keeps the translation attached
 * to the right transcript card.
 */
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
  corrections: Array<{ heard: string; meant: string }> = [],
): Promise<string> {
  const src = langEnglishName(sourceLang);
  const tgt = langEnglishName(targetLang);
  // Unlike the Live session, this prompt is built per segment, so corrections
  // added mid-recording take effect immediately here.
  const glossary = buildGlossary(corrections);

  const prompt =
    `Translate the following ${src} text into ${tgt}.\n` +
    `Reply with ONLY the translation — no quotes, no explanation, no notes, and do ` +
    `not repeat the original. Keep the tone and register of the original. If the text ` +
    `is already in ${tgt}, return it unchanged.${glossary}\n\n` +
    `--- TEXT ---\n${text}`;

  const out = await runTextPrompt(prompt);
  return out.trim();
}
