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
