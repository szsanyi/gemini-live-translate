/**
 * Shared language catalogue — used by the browser (dropdowns) and the server
 * (system-instruction building). No Node imports: safe for Vite too.
 *
 * `code` is the BCP-47 primary subtag passed to Gemini's `translationConfig`
 * and OpenAI's `output.language`. `en`/`hu` are the display names for the two
 * interface languages.
 */
export interface LanguageDef {
  code: string;
  en: string;
  hu: string;
}

export const LANGUAGES: LanguageDef[] = [
  { code: "en", en: "English", hu: "Angol" },
  { code: "hu", en: "Hungarian", hu: "Magyar" },
  { code: "de", en: "German", hu: "Német" },
  { code: "fr", en: "French", hu: "Francia" },
  { code: "es", en: "Spanish", hu: "Spanyol" },
  { code: "it", en: "Italian", hu: "Olasz" },
  { code: "pt", en: "Portuguese", hu: "Portugál" },
  { code: "nl", en: "Dutch", hu: "Holland" },
  { code: "pl", en: "Polish", hu: "Lengyel" },
  { code: "ro", en: "Romanian", hu: "Román" },
  { code: "cs", en: "Czech", hu: "Cseh" },
  { code: "sk", en: "Slovak", hu: "Szlovák" },
  { code: "ru", en: "Russian", hu: "Orosz" },
  { code: "uk", en: "Ukrainian", hu: "Ukrán" },
  { code: "tr", en: "Turkish", hu: "Török" },
  { code: "el", en: "Greek", hu: "Görög" },
  { code: "da", en: "Danish", hu: "Dán" },
  { code: "sv", en: "Swedish", hu: "Svéd" },
  { code: "fi", en: "Finnish", hu: "Finn" },
  { code: "no", en: "Norwegian", hu: "Norvég" },
  { code: "ja", en: "Japanese", hu: "Japán" },
  { code: "zh", en: "Chinese", hu: "Kínai" },
  { code: "ko", en: "Korean", hu: "Koreai" },
  { code: "ar", en: "Arabic", hu: "Arab" },
  { code: "hi", en: "Hindi", hu: "Hindi" },
  { code: "vi", en: "Vietnamese", hu: "Vietnámi" },
  { code: "id", en: "Indonesian", hu: "Indonéz" },
];

/**
 * OpenAI Realtime Translate has asymmetric language support: it can *output*
 * (speak) only this set, but it understands more as input. The output list is
 * taken from the OpenAI playground language picker.
 */
export const OPENAI_OUTPUT_LANG_CODES = [
  "zh", "en", "fr", "de", "hi", "id", "it", "ja", "ko", "pt", "ru", "es", "vi",
];

/**
 * Input (source) languages for OpenAI: the output set plus Hungarian, which the
 * model understands but cannot speak (so it's input-only).
 */
export const OPENAI_INPUT_LANG_CODES = ["hu", ...OPENAI_OUTPUT_LANG_CODES];

const ALL_CODES = LANGUAGES.map((l) => l.code);

/** Codes allowed as the source (input/spoken) language for a model. */
export function allowedSourceCodes(model: string): string[] {
  if (model === "gpt-realtime-translate") return OPENAI_INPUT_LANG_CODES;
  return ALL_CODES;
}

/** Codes allowed as the target (output/translated) language for a model. */
export function allowedTargetCodes(model: string): string[] {
  if (model === "gpt-realtime-translate") return OPENAI_OUTPUT_LANG_CODES;
  return ALL_CODES;
}

/**
 * Bidirectional (auto-detect both ways) only makes sense for the general
 * instruction-driven model; the translate-preview and OpenAI endpoints have a
 * single fixed output language.
 */
export function supportsBidirectional(model: string): boolean {
  return model === "models/gemini-3.1-flash-live-preview";
}

/** Display name of a language code in the given interface language. */
export function langName(code: string, ui: "en" | "hu"): string {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? l[ui] : code.toUpperCase();
}

/** English display name — used server-side in prompts. */
export function langEnglishName(code: string): string {
  return langName(code, "en");
}
