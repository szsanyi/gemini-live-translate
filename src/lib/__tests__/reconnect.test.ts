import { describe, it, expect } from "vitest";
import { isQuotaRefusal, reconnectDelayMs } from "../reconnect";
import {
  SESSION_RECONNECT_MAX_DELAY_MS,
  SESSION_RECONNECT_QUOTA_DELAY_MS,
} from "../constants";

/** Jitter neutralised: 0.5 → factor 1.0, so the schedule itself can be asserted. */
const noJitter = () => 0.5;

describe("isQuotaRefusal", () => {
  it("recognises the close reason Gemini actually sends", () => {
    // Verbatim from .run/live-translate.log.
    expect(isQuotaRefusal("Resource has been exhausted (e.g. check quota).")).toBe(true);
  });

  it("recognises the other shapes a quota refusal arrives in", () => {
    expect(isQuotaRefusal("RESOURCE_EXHAUSTED")).toBe(true);
    expect(isQuotaRefusal("429 Too Many Requests")).toBe(true);
    expect(isQuotaRefusal("quota exceeded for this project")).toBe(true);
  });

  it("does not mistake an ordinary outage for a quota refusal", () => {
    // This one IS worth retrying quickly — it cleared on its own in seconds.
    expect(isQuotaRefusal("The service is currently unavailable.")).toBe(false);
    expect(isQuotaRefusal("")).toBe(false);
    expect(isQuotaRefusal(undefined)).toBe(false);
  });
});

describe("reconnectDelayMs", () => {
  it("backs off exponentially instead of hammering at a fixed 800 ms", () => {
    const schedule = [1, 2, 3, 4, 5].map((n) => reconnectDelayMs(n, undefined, noJitter));
    expect(schedule).toEqual([800, 1600, 3200, 6400, 12800]);
  });

  it("spends the whole budget over half a minute, not four seconds", () => {
    // The old behaviour: 5 × 800 ms ≈ 4 s, then the recording stopped.
    const total = [1, 2, 3, 4, 5]
      .map((n) => reconnectDelayMs(n, undefined, noJitter))
      .reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(20000);
  });

  it("caps the backoff", () => {
    expect(reconnectDelayMs(20, undefined, noJitter)).toBe(SESSION_RECONNECT_MAX_DELAY_MS);
  });

  it("waits out a quota refusal from the first attempt", () => {
    const first = reconnectDelayMs(1, "Resource has been exhausted (e.g. check quota).", noJitter);
    expect(first).toBe(SESSION_RECONNECT_QUOTA_DELAY_MS);
    // ...and keeps growing from there rather than sitting at the floor.
    expect(reconnectDelayMs(5, "Resource has been exhausted (e.g. check quota).", noJitter))
      .toBe(12800);
  });

  it("keeps jitter inside ±15% and never returns a useless delay", () => {
    for (const rand of [() => 0, () => 0.999]) {
      const d = reconnectDelayMs(1, undefined, rand);
      expect(d).toBeGreaterThanOrEqual(680);
      expect(d).toBeLessThanOrEqual(920);
    }
    // A quota wait must not be jittered down into pointlessness.
    expect(reconnectDelayMs(1, "quota", () => 0)).toBeGreaterThan(6500);
  });

  it("treats a bad attempt number as the first attempt", () => {
    expect(reconnectDelayMs(0, undefined, noJitter)).toBe(800);
    expect(reconnectDelayMs(-3, undefined, noJitter)).toBe(800);
  });
});
