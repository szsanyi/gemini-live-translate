import {
  SEGMENT_HARD_CAP_WORDS,
  SEGMENT_MIN_WORDS,
  SEGMENT_SENTENCE_PAUSE_MS,
  SEGMENT_SILENCE_MS,
  SEGMENT_SOFT_CAP_WORDS,
} from "./constants";

/**
 * When a transcript card should close.
 *
 * The old rule was a fixed 1200 ms pause in the incoming text stream, which knew
 * nothing about the sentence it was cutting. Measured over 165 cards from three real
 * recordings, **38% ended mid-clause** — and each fragment was then handed to the
 * text model as a standalone unit to translate, which is where
 * "the office here shortly" → "az iroda itt hamarosan" came from.
 *
 * Nothing here touches React, the network or a ref: it is a decision about a string,
 * so it can be tested exhaustively.
 */

export interface SegmentTuning {
  /** Silence needed to close when the text already ends a sentence. */
  sentencePauseMs: number;
  /** Silence needed otherwise — the original fixed timer. */
  silenceMs: number;
  /** Below this word count the short pause does not apply. */
  minWords: number;
  /** Past this, close at the next sentence boundary without waiting. */
  softCapWords: number;
  /** Past this, close anywhere. */
  hardCapWords: number;
}

export const DEFAULT_SEGMENT_TUNING: SegmentTuning = {
  sentencePauseMs: SEGMENT_SENTENCE_PAUSE_MS,
  silenceMs: SEGMENT_SILENCE_MS,
  minWords: SEGMENT_MIN_WORDS,
  softCapWords: SEGMENT_SOFT_CAP_WORDS,
  hardCapWords: SEGMENT_HARD_CAP_WORDS,
};

/**
 * Does the text end a sentence? Trailing quotes and brackets are stepped over, since
 * a quoted sentence ends just as firmly as a bare one.
 *
 * A decimal at the very end of a chunk ("87.") can fool this. The `minWords` floor
 * and the 600 ms of silence still required make that rare enough to accept.
 */
export function endsSentence(text: string): boolean {
  return /[.!?]["'”’)\]]*\s*$/.test(text);
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Close right now, without waiting for silence?
 *
 * `speakerChanged` is the reserved hook for an acoustic speaker-change detector.
 * Nothing sets it today. It can only ever confirm a boundary the sentence rule
 * already offers — never cut on its own — so an unreliable signal cannot bring back
 * the mid-clause cuts this module exists to remove.
 */
export function shouldCloseNow(
  text: string,
  tuning: SegmentTuning = DEFAULT_SEGMENT_TUNING,
  speakerChanged?: boolean,
): boolean {
  const n = wordCount(text);
  // No boundary to wait for: an unpunctuated run must still be bounded.
  if (n >= tuning.hardCapWords) return true;
  if (n < tuning.minWords) return false;
  if (!endsSentence(text)) return false;
  return n >= tuning.softCapWords || speakerChanged === true;
}

/** How much silence must follow before this card closes. */
export function closeAfterMs(
  text: string,
  tuning: SegmentTuning = DEFAULT_SEGMENT_TUNING,
): number {
  if (wordCount(text) < tuning.minWords) return tuning.silenceMs;
  return endsSentence(text) ? tuning.sentencePauseMs : tuning.silenceMs;
}

/**
 * Parse a `localStorage.segmentTuning` override over the defaults.
 *
 * Every value is validated, and anything suspect is dropped rather than applied: a
 * zero delay would close a card on every chunk, and a hard cap under the soft cap is
 * incoherent. **A tuning knob must never be able to stop a recording**, so a
 * malformed value costs its own override and nothing else.
 */
export function readSegmentTuning(raw: string | null | undefined): SegmentTuning {
  if (!raw) return { ...DEFAULT_SEGMENT_TUNING };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SEGMENT_TUNING };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ...DEFAULT_SEGMENT_TUNING };
  }

  const out = { ...DEFAULT_SEGMENT_TUNING };
  for (const key of Object.keys(out) as (keyof SegmentTuning)[]) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      out[key] = value;
    }
  }

  // A cap below the floor it is supposed to sit above would close every card at once.
  if (out.hardCapWords <= out.softCapWords) out.hardCapWords = DEFAULT_SEGMENT_TUNING.hardCapWords;
  if (out.hardCapWords <= out.softCapWords) out.softCapWords = DEFAULT_SEGMENT_TUNING.softCapWords;

  return out;
}
