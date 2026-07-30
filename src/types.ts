export interface TranslationPair {
  id: string;
  originalText: string;
  translatedText: string;
  /** BCP-47 language codes (e.g. "hu", "en", "de"). */
  sourceLang: string;
  targetLang: string;
  /** True when captured in bidirectional mode (direction is auto-detected). */
  bidirectional?: boolean;
  timestamp: Date;
  // Offsets in milliseconds relative to the start of the session (for subtitle export)
  startMs?: number;
  endMs?: number;
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

export type AudioSourceType = "microphone" | "tab-audio";

export interface SessionConfig extends LangConfig {
  model: string;
  audioSource: AudioSourceType;
}
