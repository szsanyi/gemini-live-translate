export interface TranslationPair {
  id: string;
  originalText: string;
  translatedText: string;
  /** BCP-47 language codes (e.g. "hu", "en", "de"). */
  sourceLang: string;
  targetLang: string;
  /** True when captured in bidirectional mode (direction is auto-detected). */
  bidirectional?: boolean;
  /** Who said it. Set by transcript import; live sessions have no diarization. */
  speaker?: string;
  timestamp: Date;
  // Offsets in milliseconds relative to the start of the session (for subtitle export)
  startMs?: number;
  endMs?: number;
  /** True while the translation is still being fetched for an already-shown card
   *  (translated-transcript mode translates each finished segment separately). */
  isStreaming?: boolean;
}

/** A free-text note the user jots down during/after a conversation. */
export interface NoteEntry {
  id: string;
  text: string;
  timestamp: Date;
  /** When set, the note is attached to a specific translation pair (card),
   *  otherwise it's a standalone note in the conversation timeline. */
  pairId?: string;
}

/** An AI-generated conversation summary, produced in both languages. */
export interface SummaryEntry {
  id: string;
  en: string;
  hu: string;
  timestamp: Date;
}

/** The chosen language pair + direction for a session. */
export interface LangConfig {
  sourceLang: string;
  targetLang: string;
  bidirectional: boolean;
}

/**
 * What a session should actually do with the captured audio.
 *
 * Three combinations are meaningful:
 *   translate + speak   → live interpreter (spoken translation)
 *   translate, no speak → translated transcript (text only, no TTS cost)
 *   no translate        → plain recording (transcript in the spoken language)
 *
 * `speak` is meaningless without `translate`, so it is forced off in that case.
 * Only `speak` shapes the Live session config: when it is false the model is
 * instructed to stay silent, and the translation (if wanted) is done afterwards
 * by a text model. See docs/superpowers/specs/2026-08-04-translation-and-speech-toggles-design.md
 */
export interface SessionProfile extends LangConfig {
  /** Translate the speech. When false the session only transcribes. */
  translate: boolean;
  /** Let the Live model generate spoken output. Ignored when translate is false. */
  speak: boolean;
}

export type AudioSourceType = "microphone" | "tab-audio";

export interface SessionConfig extends SessionProfile {
  model: string;
  audioSource: AudioSourceType;
  /** Correction glossary for the model. Only reaches it at session open. */
  corrections?: Array<{ heard: string; meant: string }>;
}
