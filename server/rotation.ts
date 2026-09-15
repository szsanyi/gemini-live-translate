/**
 * Which of a client's Live sessions may still speak to the browser.
 *
 * A rotation (see `rotateGemini` in server.ts) always has two sessions alive for a
 * moment, and they are not interchangeable:
 *
 *  - Control events — the session's own close, its token usage, a GoAway — count
 *    only from the **live** session. A retired session closing is expected, and
 *    reporting it to the client would look like a lost connection.
 *  - Transcript text is different: the ASR lags the audio it has already received,
 *    so at the instant of the swap the outgoing session is still holding the tail of
 *    whatever is being said. That tail belongs in the transcript, and the incoming
 *    session can never produce it — it never heard that audio. So a **retiring**
 *    session keeps relaying text until it has flushed.
 *
 * This is the whole reason the class exists: closing the old session at the swap put
 * a hole in the transcript at every rotation. A speaker who pauses often never
 * noticed (the rotation landed in a pause); a fast, continuous speaker lost a phrase
 * every few minutes.
 */
export class RotationState {
  private lastGen = 0;
  private liveGen = 0;
  private retiringGen = 0;

  /**
   * Stamp for a session that is being opened. It is deliberately NOT live yet:
   * opening takes a network round trip, and during it the existing session is still
   * the one receiving audio and producing transcript.
   */
  reserve(): number {
    return ++this.lastGen;
  }

  /**
   * The reserved session is open and now receives the audio. The session it replaces
   * keeps relaying transcript until `retire`. Returns the generation that is now
   * retiring (0 when there was no previous session).
   */
  promote(gen: number): number {
    const previous = this.liveGen;
    this.liveGen = gen;
    this.retiringGen = previous;
    return previous;
  }

  /** The retiring session has flushed its tail and can be closed. */
  retire(gen: number): void {
    if (gen !== 0 && this.retiringGen === gen) this.retiringGen = 0;
  }

  /** Control events (close, usage, GoAway, errors) count only from the live session. */
  isLive(gen: number): boolean {
    return gen !== 0 && gen === this.liveGen;
  }

  /** Transcript text is wanted from the live session and from the one flushing out. */
  isRelaying(gen: number): boolean {
    return this.isLive(gen) || (gen !== 0 && gen === this.retiringGen);
  }
}

/**
 * Whether the backstop timer should actually replace the session.
 *
 * The timer exists for models that report no `usageMetadata` at all — without it
 * they would drift into the 8192-token death unnoticed. A model that *does* report
 * usage is already covered by the token trigger, so firing the timer as well
 * replaces a healthy session for nothing.
 *
 * That is not free. Every rotation opens a second Live session, and the whole log
 * shows 188 sessions opened for 95 recordings — roughly double. The quota those
 * come out of is what answers `Resource has been exhausted` when a meeting needs a
 * new session, so a pointless rotation is a real cost paid at the worst moment.
 */
/**
 * Longest a Live session may live on the strength of a low token report alone.
 *
 * Measured: `gemini-3.5-live-translate-preview` reported **100 tokens for 7.5 minutes**
 * of audio, which is impossible — the input alone is a multiple of that. A model that
 * under-reports this way would keep the skip below firing for ever, and the session
 * would drift toward the 8192 ceiling with nothing watching. The token trigger is an
 * optimisation; this is the floor under it.
 */
export const MAX_SESSION_AGE_MS = 12 * 60 * 1000;

export function shouldRotateOnSchedule(
  usageReported: boolean,
  liveTokens: number,
  rotateAtTokens: number,
  sessionAgeMs = 0,
  maxSessionAgeMs = MAX_SESSION_AGE_MS,
): boolean {
  // The safety floor comes first: it must hold even when the usage report says the
  // session is fine, because the report itself is what cannot be trusted.
  if (sessionAgeMs >= maxSessionAgeMs) return true;
  if (!usageReported) return true;
  return liveTokens >= rotateAtTokens;
}
