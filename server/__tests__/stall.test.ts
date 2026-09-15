import { describe, it, expect } from "vitest";
import {
  pcmRms,
  pcmDurationMs,
  StallDetector,
  SPEECH_RMS,
  STALL_SPEECH_MS,
  FIRST_STALL_SPEECH_MS,
} from "../stall.ts";

/** One capture chunk: 2048 mono 16-bit samples, i.e. 128 ms at 16 kHz. */
function chunk(amplitude: number): Buffer {
  const buf = Buffer.alloc(2048 * 2);
  for (let i = 0; i < 2048; i++) buf.writeInt16LE(amplitude, i * 2);
  return buf;
}

const SILENCE = chunk(0);
/** ≈ 0.05 RMS — the level speech measured at on a real tab share (-26 dBFS). */
const SPEECH = chunk(1638);
/** ≈ 0.005 RMS — a quiet window between sentences (-46 dBFS). */
const ROOM_TONE = chunk(164);

describe("pcmRms", () => {
  it("reads digital silence as zero", () => {
    expect(pcmRms(SILENCE)).toBe(0);
  });

  it("normalises 16-bit samples to 0..1", () => {
    expect(pcmRms(chunk(16384))).toBeCloseTo(0.5, 3);
  });

  it("puts speech above the threshold and room tone below it", () => {
    expect(pcmRms(SPEECH)).toBeGreaterThan(SPEECH_RMS);
    expect(pcmRms(ROOM_TONE)).toBeLessThan(SPEECH_RMS);
  });

  it("survives an empty buffer", () => {
    expect(pcmRms(Buffer.alloc(0))).toBe(0);
  });
});

describe("pcmDurationMs", () => {
  it("reads a 2048-sample chunk as 128 ms", () => {
    expect(pcmDurationMs(SILENCE)).toBeCloseTo(128, 6);
  });
});

describe("StallDetector", () => {
  it("never fires on silence, however long it lasts", () => {
    // A meeting pause is not a dead session — audio keeps flowing while nobody talks,
    // so a wall-clock timer here would rotate through every silence.
    const d = new StallDetector();
    for (let i = 0; i < 2000; i++) expect(d.onAudio(SILENCE)).toBe(false);
    expect(d.pendingSpeechMs).toBe(0);
  });

  it("never fires on room tone below the speech threshold", () => {
    const d = new StallDetector();
    for (let i = 0; i < 2000; i++) expect(d.onAudio(ROOM_TONE)).toBe(false);
  });

  it("fires once enough unanswered speech has gone up", () => {
    const d = new StallDetector();
    d.onTranscript(); // a session that has been working, then goes quiet mid-recording
    const needed = Math.ceil(STALL_SPEECH_MS / 128);
    let fired = 0;
    for (let i = 1; i <= needed; i++) {
      if (d.onAudio(SPEECH)) { fired = i; break; }
    }
    expect(fired).toBe(needed);
  });

  it("does not fire one chunk early", () => {
    const d = new StallDetector();
    d.onTranscript();
    const needed = Math.ceil(STALL_SPEECH_MS / 128);
    for (let i = 1; i < needed; i++) expect(d.onAudio(SPEECH)).toBe(false);
  });

  it("treats any transcript as proof of life", () => {
    const d = new StallDetector();
    for (let i = 0; i < 100; i++) d.onAudio(SPEECH);
    expect(d.pendingSpeechMs).toBeGreaterThan(0);
    d.onTranscript();
    expect(d.pendingSpeechMs).toBe(0);
  });

  it("counts only the speech in a mix of speech and silence", () => {
    const d = new StallDetector();
    for (let i = 0; i < 10; i++) {
      d.onAudio(SPEECH);
      d.onAudio(SILENCE);
      d.onAudio(SILENCE);
    }
    expect(d.pendingSpeechMs).toBeCloseTo(10 * 128, 6);
  });

  it("honours a custom threshold, so a stall can be provoked in a test run", () => {
    const d = new StallDetector(SPEECH_RMS, 256, 256);
    expect(d.onAudio(SPEECH)).toBe(false);
    expect(d.onAudio(SPEECH)).toBe(true);
  });

  it("starts over after reset", () => {
    const d = new StallDetector(SPEECH_RMS, 256, 256);
    d.onAudio(SPEECH);
    d.reset();
    expect(d.onAudio(SPEECH)).toBe(false);
  });
});

describe("StallDetector — a session that has never answered", () => {
  const chunks = (ms: number) => Math.ceil(ms / 128);

  it("gives a newborn session a shorter leash than a working one", () => {
    const d = new StallDetector();
    let fired = 0;
    for (let i = 1; i <= chunks(FIRST_STALL_SPEECH_MS); i++) {
      if (d.onAudio(SPEECH)) { fired = i; break; }
    }
    expect(fired).toBe(chunks(FIRST_STALL_SPEECH_MS));
    // ...and that is well before the ordinary threshold would have fired.
    expect(FIRST_STALL_SPEECH_MS).toBeLessThan(STALL_SPEECH_MS);
  });

  it("switches to the ordinary threshold once the session has answered", () => {
    const d = new StallDetector();
    d.onTranscript(); // proof of life
    for (let i = 1; i < chunks(STALL_SPEECH_MS); i++) {
      expect(d.onAudio(SPEECH)).toBe(false);
    }
    expect(d.onAudio(SPEECH)).toBe(true);
  });

  it("puts a replacement session back on the short leash", () => {
    const d = new StallDetector();
    d.onTranscript();
    d.reset(); // a rotation handed over to a fresh session
    let fired = 0;
    for (let i = 1; i <= chunks(FIRST_STALL_SPEECH_MS); i++) {
      if (d.onAudio(SPEECH)) { fired = i; break; }
    }
    expect(fired).toBe(chunks(FIRST_STALL_SPEECH_MS));
  });

  it("still ignores silence while on the short leash", () => {
    const d = new StallDetector();
    for (let i = 0; i < 2000; i++) expect(d.onAudio(SILENCE)).toBe(false);
  });
});
