import {
  SESSION_RECONNECT_DELAY_MS,
  SESSION_RECONNECT_MAX_DELAY_MS,
  SESSION_RECONNECT_QUOTA_DELAY_MS,
} from "./constants";

/**
 * Does this close reason mean the provider refused us for quota reasons?
 *
 * Observed verbatim in the server log as `Resource has been exhausted (e.g. check
 * quota).` — Google's RESOURCE_EXHAUSTED, the Live-session equivalent of an HTTP 429.
 */
export function isQuotaRefusal(reason?: string): boolean {
  if (!reason) return false;
  return /resource[ _]has[ _]been[ _]exhausted|resource_exhausted|quota|\b429\b/i.test(reason);
}

/**
 * How long to wait before reconnect attempt `attempt` (1-based).
 *
 * The old fixed 800 ms spent the whole reconnect budget in about four seconds, which
 * is the one thing that cannot work against a quota: the bucket refills on a clock,
 * so five attempts inside four seconds are five certain failures and then a stopped
 * recording. This is the same rule the text model already follows ("a retry never
 * fights a quota") applied to the Live path.
 *
 * Exponential from `SESSION_RECONNECT_DELAY_MS`, capped, with ±15% jitter so repeated
 * failures don't line up. A quota refusal additionally gets a floor — a per-minute
 * window needs seconds, not milliseconds — which the jitter never eats into far
 * enough to matter.
 *
 * `rand` is injectable so the schedule can be asserted in tests.
 */
export function reconnectDelayMs(
  attempt: number,
  reason?: string,
  rand: () => number = Math.random,
): number {
  const n = Math.max(1, Math.floor(attempt));
  const backoff = Math.min(
    SESSION_RECONNECT_MAX_DELAY_MS,
    SESSION_RECONNECT_DELAY_MS * 2 ** (n - 1),
  );
  const floor = isQuotaRefusal(reason) ? SESSION_RECONNECT_QUOTA_DELAY_MS : 0;
  const delay = Math.max(backoff, floor);
  return Math.round(delay * (0.85 + rand() * 0.3));
}
