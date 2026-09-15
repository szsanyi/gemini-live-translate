export const INPUT_SAMPLE_RATE = 16000;
export const OUTPUT_SAMPLE_RATE = 24000;
export const SCRIPT_BUFFER_SIZE = 2048;
/** Scheduled playback slide buffer in seconds — prevents gaps between chunks. */
export const PLAYBACK_SLIDE_S = 0.05;
/** Silence after which a turn is automatically finalized (OpenAI, no explicit signal). */
export const TURN_SILENCE_MS = 1500;
/**
 * Pause (in ms) in the incoming text stream after which the current segment is
 * closed into its own transcript card / subtitle cue. Needed for models that
 * stream continuously without firing `turnComplete` per sentence (e.g. the
 * Gemini 3.5 live-translate preview), so a long monologue is split into
 * properly timed, real-time subtitle blocks instead of one big lump.
 */
export const SEGMENT_SILENCE_MS = 1200;
/**
 * The same, but when the accumulated text already ends a sentence. Half the wait,
 * because there is nothing left to wait for: a whole sentence is in hand. This is
 * what keeps sentence-boundary segmentation from making cards longer than the fixed
 * timer did — they satisfy an extra condition but wait half as long for it.
 */
export const SEGMENT_SENTENCE_PAUSE_MS = 600;
/**
 * Below this, a card does not get the short pause even if it ends a sentence. A bare
 * "Yeah." is a complete sentence and a useless card unless speech really stopped.
 */
export const SEGMENT_MIN_WORDS = 4;
/**
 * Past this, close at the **next** sentence boundary without waiting for silence, so
 * a monologue does not grow into one huge card. Taken at a boundary, so the cap
 * itself never cuts a sentence. Measured: only 2% of real cards reach it.
 */
export const SEGMENT_SOFT_CAP_WORDS = 60;
/**
 * Last resort: close anywhere. Only reachable when the transcript runs on without
 * punctuation, where there is no boundary to wait for.
 */
export const SEGMENT_HARD_CAP_WORDS = 120;
/**
 * Idle time after the last change before the session is written to disk. Collapses
 * a burst of segments into one write; the worst case on a crash is losing this
 * much of the transcript.
 */
export const SESSION_AUTOSAVE_MS = 3000;
/**
 * How many times a recording may reconnect its provider session by itself before
 * giving up and stopping. Bounded so a genuinely dead connection surfaces as a stop
 * instead of an endless reconnect loop.
 */
export const MAX_SESSION_RECONNECTS = 5;
/**
 * Base pause before an automatic reconnect, so a refused connection can't spin. The
 * actual wait grows exponentially from here — see `reconnectDelayMs` in lib/reconnect.
 */
export const SESSION_RECONNECT_DELAY_MS = 800;
/** Ceiling for the exponential reconnect backoff. */
export const SESSION_RECONNECT_MAX_DELAY_MS = 20000;
/**
 * Floor for a reconnect after a quota refusal (`Resource has been exhausted`). The
 * bucket refills on a clock, so a sub-second retry is a guaranteed failure that also
 * spends one of the few attempts available.
 */
export const SESSION_RECONNECT_QUOTA_DELAY_MS = 8000;
