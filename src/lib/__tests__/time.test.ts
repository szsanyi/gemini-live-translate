import { describe, it, expect } from "vitest";
import { formatClock, formatSrtTime } from "../time";

describe("formatClock", () => {
  it("formats zero", () => expect(formatClock(0)).toBe("0:00"));
  it("formats seconds only", () => expect(formatClock(5000)).toBe("0:05"));
  it("formats minutes and seconds", () => expect(formatClock(90000)).toBe("1:30"));
  it("formats hours", () => expect(formatClock(3661000)).toBe("1:01:01"));
  it("clamps negative to zero", () => expect(formatClock(-500)).toBe("0:00"));
});

describe("formatSrtTime", () => {
  it("formats zero", () => expect(formatSrtTime(0)).toBe("00:00:00,000"));
  it("formats milliseconds", () => expect(formatSrtTime(1234)).toBe("00:00:01,234"));
  it("formats minutes", () => expect(formatSrtTime(90500)).toBe("00:01:30,500"));
  it("formats hours", () => expect(formatSrtTime(3661000)).toBe("01:01:01,000"));
  it("clamps negative to zero", () => expect(formatSrtTime(-1)).toBe("00:00:00,000"));
});
