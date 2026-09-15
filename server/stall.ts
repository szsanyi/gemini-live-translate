/**
 * Detects a Live session that has stopped transcribing but has not closed.
 *
 * Measured with `LIVE_DEBUG=1` on a real recording: for **107 seconds** the client
 * sent a perfectly steady 39 chunks / 208 KB every 5 s while Gemini returned zero
 * transcription deltas — and only then did the API admit the session was gone
 * (`Resource has been exhausted (e.g. check quota).`). Everything spoken in that
 * window was lost, and nothing in the server noticed: the socket was open, audio was
 * flowing, `onClose` had not fired. That single stall is bigger than every rotation
 * hole put together.
 *
 * Silence cannot be the signal. Audio chunks keep flowing while nobody speaks, so a
 * wall-clock timer would rotate a perfectly healthy session through every pause in a
 * meeting. What is actually diagnostic is **speech going up with nothing coming
 * back**, which is why this measures the level of each chunk and only counts the
 * ones loud enough to be speech.
 */

/** Capture rate of the PCM the client sends (see src/lib/constants.ts). */
const INPUT_SAMPLE_RATE = 16000;

/** RMS of 16-bit little-endian mono PCM, normalised to 0..1. */
export function pcmRms(buf: Buffer): number {
  const samples = Math.floor(buf.length / 2);
  if (samples === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const s = buf.readInt16LE(i * 2) / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / samples);
}

/** How long a 16 kHz mono 16-bit PCM buffer plays for, in milliseconds. */
export function pcmDurationMs(buf: Buffer): number {
  return (buf.length / 2 / INPUT_SAMPLE_RATE) * 1000;
}

/**
 * Above this RMS a chunk counts as speech rather than room tone.
 *
 * From the capture diagnostic on a real tab share: speech windows measured -26 to
 * -33 dBFS (0.05 - 0.022) and quiet windows -43 to -50 dBFS (0.007 - 0.003). 0.01
 * (-40 dBFS) sits in the gap, comfortably under speech and over the quiet floor.
 */
export const SPEECH_RMS = 0.01;

/**
 * Speech that may go unanswered before the session is presumed dead.
 *
 * Not wall-clock: 20 s of *speech* is roughly 35-40 s of a real conversation, which
 * is far past any normal transcription latency and still early enough to save most
 * of a stall like the 107-second one above.
 */
export const STALL_SPEECH_MS = 20000;

/**
 * The same, for a session that has not produced a single character since it opened.
 *
 * "Never worked at all" is a far clearer diagnosis than "went quiet mid-sentence", so
 * it does not need as much evidence. Measured on a real recording: the very first
 * session of a run was dead from birth and cost the first 1:28 of the meeting, of
 * which the detector's own 20 s of speech was a large part. Cutting the bar for this
 * one case recovers most of that without making a mid-recording stall trigger-happy.
 */
export const FIRST_STALL_SPEECH_MS = 7000;

export class StallDetector {
  private speechMs = 0;
  /** Has this session ever answered? Until it has, it is judged on a shorter leash. */
  private seenTranscript = false;

  constructor(
    private readonly speechRms: number = SPEECH_RMS,
    private readonly stallSpeechMs: number = STALL_SPEECH_MS,
    private readonly firstStallSpeechMs: number = FIRST_STALL_SPEECH_MS,
  ) {}

  /** Evidence required right now: less from a session that has never said anything. */
  private get threshold(): number {
    return this.seenTranscript ? this.stallSpeechMs : this.firstStallSpeechMs;
  }

  /**
   * Feed one captured chunk. Returns true the moment enough speech has gone up with
   * nothing coming back. The caller acts on that and calls `reset`.
   *
   * A loud non-speech source (music in a shared tab) can also trip this. The cost is
   * one extra session, and the replacement is opened before the old one is closed
   * and flushed, so a false positive loses no transcript.
   */
  onAudio(pcm: Buffer): boolean {
    if (pcmRms(pcm) < this.speechRms) return false; // silence proves nothing
    this.speechMs += pcmDurationMs(pcm);
    return this.speechMs >= this.threshold;
  }

  /** Any text at all means the session is alive. */
  onTranscript(): void {
    this.speechMs = 0;
    this.seenTranscript = true;
  }

  /**
   * After acting on a stall, and whenever a fresh session takes over. The replacement
   * has proven nothing yet, so it goes back on the short leash.
   */
  reset(): void {
    this.speechMs = 0;
    this.seenTranscript = false;
  }

  /** Unanswered speech so far, for the LIVE_DEBUG line. */
  get pendingSpeechMs(): number {
    return this.speechMs;
  }
}
