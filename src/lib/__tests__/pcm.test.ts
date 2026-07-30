import { describe, it, expect } from "vitest";
import { floatTo16BitPCM } from "../pcm";

describe("floatTo16BitPCM", () => {
  it("converts silence (0.0) to zero PCM", () => {
    const input = new Float32Array([0, 0, 0]);
    const buf = floatTo16BitPCM(input);
    const view = new DataView(buf);
    expect(view.getInt16(0, true)).toBe(0);
    expect(view.getInt16(2, true)).toBe(0);
  });

  it("converts +1.0 to max positive int16", () => {
    const buf = floatTo16BitPCM(new Float32Array([1.0]));
    expect(new DataView(buf).getInt16(0, true)).toBe(0x7fff);
  });

  it("converts -1.0 to min negative int16", () => {
    const buf = floatTo16BitPCM(new Float32Array([-1.0]));
    expect(new DataView(buf).getInt16(0, true)).toBe(-0x8000);
  });

  it("clamps values beyond [-1, 1]", () => {
    const buf = floatTo16BitPCM(new Float32Array([2.0, -2.0]));
    const view = new DataView(buf);
    expect(view.getInt16(0, true)).toBe(0x7fff);
    expect(view.getInt16(2, true)).toBe(-0x8000);
  });

  it("output buffer is 2 bytes per sample", () => {
    const input = new Float32Array(10);
    expect(floatTo16BitPCM(input).byteLength).toBe(20);
  });
});
