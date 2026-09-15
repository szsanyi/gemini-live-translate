import { describe, it, expect } from "vitest";
import { MAX_SESSION_AGE_MS, RotationState, shouldRotateOnSchedule } from "../rotation.ts";

/**
 * The bug these pin down: a rotation used to silence the outgoing session the moment
 * it *started* opening a replacement, and close it the moment the swap happened. The
 * ASR lags the audio it has already received, so that discarded both the open window
 * and the tail of the current utterance — a hole in the transcript at every rotation.
 */
describe("RotationState", () => {
  it("keeps the first session live from the moment it is promoted", () => {
    const rot = new RotationState();
    const first = rot.reserve();
    rot.promote(first);
    expect(rot.isLive(first)).toBe(true);
    expect(rot.isRelaying(first)).toBe(true);
  });

  it("leaves the live session untouched while a replacement is still opening", () => {
    const rot = new RotationState();
    const first = rot.reserve();
    rot.promote(first);

    const second = rot.reserve(); // opening; not live yet

    expect(rot.isLive(first)).toBe(true);
    expect(rot.isRelaying(first)).toBe(true);
    expect(rot.isLive(second)).toBe(false);
    expect(rot.isRelaying(second)).toBe(false);
  });

  it("relays the retiring session's transcript after the swap", () => {
    const rot = new RotationState();
    const first = rot.reserve();
    rot.promote(first);
    const second = rot.reserve();
    const retired = rot.promote(second);

    expect(retired).toBe(first);
    // Control events belong to the new session only...
    expect(rot.isLive(first)).toBe(false);
    expect(rot.isLive(second)).toBe(true);
    // ...but the old session's trailing transcript is still wanted.
    expect(rot.isRelaying(first)).toBe(true);
    expect(rot.isRelaying(second)).toBe(true);
  });

  it("silences the retiring session once it has flushed", () => {
    const rot = new RotationState();
    const first = rot.reserve();
    rot.promote(first);
    const second = rot.reserve();
    rot.promote(second);

    rot.retire(first);

    expect(rot.isRelaying(first)).toBe(false);
    expect(rot.isLive(first)).toBe(false);
    expect(rot.isRelaying(second)).toBe(true);
  });

  it("a replacement that never opened cannot silence the live session", () => {
    const rot = new RotationState();
    const first = rot.reserve();
    rot.promote(first);

    rot.reserve(); // open failed: never promoted

    expect(rot.isLive(first)).toBe(true);
    expect(rot.isRelaying(first)).toBe(true);
  });

  it("a second rotation retires only the session it replaced", () => {
    const rot = new RotationState();
    const a = rot.reserve(); rot.promote(a);
    const b = rot.reserve(); rot.promote(b);
    const c = rot.reserve(); rot.promote(c);

    expect(rot.isRelaying(a)).toBe(false); // two generations back: fully gone
    expect(rot.isRelaying(b)).toBe(true);
    expect(rot.isLive(c)).toBe(true);
  });

  it("never treats the 'no session' generation as live", () => {
    const rot = new RotationState();
    expect(rot.isLive(0)).toBe(false);
    expect(rot.isRelaying(0)).toBe(false);
    const first = rot.reserve();
    rot.promote(first);
    expect(rot.isRelaying(0)).toBe(false);
  });
});

describe("shouldRotateOnSchedule", () => {
  const LIMIT = 5500;

  it("rotates when the model reports no usage at all", () => {
    // The only reason the backstop timer exists: nothing else would catch the drift.
    expect(shouldRotateOnSchedule(false, 0, LIMIT)).toBe(true);
  });

  it("skips a healthy session whose usage is being reported", () => {
    expect(shouldRotateOnSchedule(true, 1200, LIMIT)).toBe(false);
  });

  it("still rotates when a reported session has reached the threshold", () => {
    expect(shouldRotateOnSchedule(true, LIMIT, LIMIT)).toBe(true);
    expect(shouldRotateOnSchedule(true, LIMIT + 800, LIMIT)).toBe(true);
  });

  it("does not skip on the token count alone when usage was never reported", () => {
    // A stale 0 from a model that reports nothing must not be read as "healthy".
    expect(shouldRotateOnSchedule(false, 0, LIMIT)).toBe(true);
  });
});

describe("shouldRotateOnSchedule — the age floor under the token trigger", () => {
  const LIMIT = 5500;
  const AGE = MAX_SESSION_AGE_MS;

  it("rotates an old session even when its usage report looks healthy", () => {
    // Measured: 3.5-live-translate reported 100 tokens for 7.5 minutes of audio.
    // Trusting that report would keep a session alive until the 8192 ceiling kills it.
    expect(shouldRotateOnSchedule(true, 100, LIMIT, AGE)).toBe(true);
    expect(shouldRotateOnSchedule(true, 100, LIMIT, AGE + 60_000)).toBe(true);
  });

  it("still skips a young healthy session", () => {
    expect(shouldRotateOnSchedule(true, 100, LIMIT, AGE - 1)).toBe(false);
    expect(shouldRotateOnSchedule(true, 1200, LIMIT, 60_000)).toBe(false);
  });

  it("leaves the token trigger in charge below the floor", () => {
    expect(shouldRotateOnSchedule(true, LIMIT, LIMIT, 60_000)).toBe(true);
    expect(shouldRotateOnSchedule(false, 0, LIMIT, 60_000)).toBe(true);
  });

  it("defaults to the old behaviour when no age is supplied", () => {
    expect(shouldRotateOnSchedule(true, 1200, LIMIT)).toBe(false);
    expect(shouldRotateOnSchedule(false, 0, LIMIT)).toBe(true);
  });
});
