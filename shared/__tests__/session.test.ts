import { describe, it, expect } from "vitest";
import {
  serializeSession,
  parseSession,
  toSummary,
  serializeSessionSummary,
  parseSessionSummary,
  isValidSessionId,
  newSessionId,
  normalizeTags,
  SESSION_VERSION,
  type SessionData,
} from "../session.ts";
import { buildTranscriptBlocks, renderTranscriptText, buildSrt } from "../../src/lib/export.ts";

const session = (overrides: Partial<SessionData> = {}): SessionData => ({
  version: SESSION_VERSION,
  id: "2026-08-04T19-48-12-a3f9",
  createdAt: new Date("2026-08-04T19:48:12.000Z"),
  updatedAt: new Date("2026-08-04T20:02:00.000Z"),
  title: "Firmware check",
  tags: ["client call", "hardware"],
  corrections: [{
    id: "c1",
    heard: "coals",
    meant: "Kohl's",
    global: true,
    createdAt: new Date("2026-08-04T19:52:00.000Z"),
  }],
  profile: {
    model: "models/gemini-3.1-flash-live-preview",
    sourceLang: "en",
    targetLang: "hu",
    bidirectional: false,
    translate: true,
    speak: false,
    audioSource: "microphone",
  },
  elapsedMs: 612000,
  pairs: [{
    id: "p1",
    originalText: "The upload timed out.",
    translatedText: "A feltöltés túllépte az időkorlátot.",
    sourceLang: "en",
    targetLang: "hu",
    speaker: "Tamás Bognár",
    timestamp: new Date("2026-08-04T19:50:00.000Z"),
    startMs: 1000,
    endMs: 4000,
  }],
  notes: [{
    id: "n1",
    text: "Check firmware first.",
    timestamp: new Date("2026-08-04T19:51:00.000Z"),
    pairId: "p1",
  }],
  summaries: [{
    id: "s1",
    en: "Upgrade failed twice.",
    hu: "A frissítés kétszer bukott el.",
    timestamp: new Date("2026-08-04T20:01:00.000Z"),
  }],
  obsidianPath: "/vault/meetings/2026-08-04/2026-08-04 19-48 Firmware check.md",
  hasAudio: false,
  ...overrides,
});

describe("session round-trip", () => {
  it("survives serialize → JSON → parse unchanged", () => {
    const original = session();
    const revived = parseSession(JSON.parse(JSON.stringify(serializeSession(original))));
    expect(revived).toEqual(original);
  });

  it("revives timestamps as real Date objects, not strings", () => {
    // The whole point of this module: JSON has no Date, and a string timestamp
    // breaks every export path that calls .getTime() or .toLocaleTimeString().
    const revived = parseSession(JSON.parse(JSON.stringify(serializeSession(session()))));
    expect(revived.createdAt).toBeInstanceOf(Date);
    expect(revived.pairs[0].timestamp).toBeInstanceOf(Date);
    expect(revived.notes[0].timestamp).toBeInstanceOf(Date);
    expect(revived.summaries[0].timestamp).toBeInstanceOf(Date);
  });

  it("keeps a revived session usable by the exporters", () => {
    const revived = parseSession(JSON.parse(JSON.stringify(serializeSession(session()))));
    const blocks = buildTranscriptBlocks(revived.pairs, revived.notes, revived.summaries);
    const txt = renderTranscriptText(blocks);
    expect(txt).toContain("The upload timed out.");
    expect(txt).toContain("Check firmware first.");
    expect(buildSrt(revived.pairs)).toContain("00:00:01,000 --> 00:00:04,000");
  });

  it("drops transient isStreaming state", () => {
    const withStreaming = session();
    withStreaming.pairs[0].isStreaming = true;
    const revived = parseSession(JSON.parse(JSON.stringify(serializeSession(withStreaming))));
    expect(revived.pairs[0].isStreaming).toBeUndefined();
  });

  it("carries the speaker through the round-trip", () => {
    const revived = parseSession(JSON.parse(JSON.stringify(serializeSession(session()))));
    expect(revived.pairs[0].speaker).toBe("Tamás Bognár");
  });

  it("leaves speaker absent when the pair has none", () => {
    const noSpeaker = session();
    delete noSpeaker.pairs[0].speaker;
    const revived = parseSession(JSON.parse(JSON.stringify(serializeSession(noSpeaker))));
    expect(revived.pairs[0]).not.toHaveProperty("speaker");
  });

  it("trims padded speaker strings on the way back in", () => {
    // Normalising user-facing strings on read is this module's convention —
    // matches how title is handled at line 212.
    const padded = session();
    padded.pairs[0].speaker = "  Nagy Béla  ";
    const revived = parseSession(JSON.parse(JSON.stringify(serializeSession(padded))));
    expect(revived.pairs[0].speaker).toBe("Nagy Béla");
  });

  it("treats blank speaker as absent, not as an empty string", () => {
    // An empty speaker would render an empty badge and a stray separator in
    // exports, so absent is the correct normalisation.
    const blank = session();
    blank.pairs[0].speaker = "   ";
    const revived = parseSession(JSON.parse(JSON.stringify(serializeSession(blank))));
    expect(revived.pairs[0]).not.toHaveProperty("speaker");
  });
});

describe("parseSession robustness", () => {
  it("rejects a non-object payload", () => {
    expect(() => parseSession(null)).toThrow();
    expect(() => parseSession("nope")).toThrow();
  });

  it("rejects a session without an id", () => {
    expect(() => parseSession({ createdAt: "2026-08-04T19:48:12.000Z" })).toThrow(/no id/);
  });

  it("rejects an unparseable timestamp instead of inventing one", () => {
    const bad = JSON.parse(JSON.stringify(serializeSession(session()))) as Record<string, unknown>;
    (bad.pairs as Record<string, unknown>[])[0].timestamp = "not-a-date";
    expect(() => parseSession(bad)).toThrow(/Invalid date/);
  });

  it("defaults the mode flags to interpreter for files predating them", () => {
    const old = JSON.parse(JSON.stringify(serializeSession(session()))) as Record<string, unknown>;
    delete (old.profile as Record<string, unknown>).translate;
    delete (old.profile as Record<string, unknown>).speak;
    const revived = parseSession(old);
    expect(revived.profile.translate).toBe(true);
    expect(revived.profile.speak).toBe(true);
  });

  it("treats an empty title as absent", () => {
    const revived = parseSession({ ...(serializeSession(session()) as object), title: "   " });
    expect(revived.title).toBeNull();
  });
});

describe("listing entries", () => {
  it("summarises counts without carrying the bodies", () => {
    const s = toSummary(session());
    expect(s.pairCount).toBe(1);
    expect(s.noteCount).toBe(1);
    expect(s.summaryCount).toBe(1);
    expect(s).not.toHaveProperty("pairs");
  });

  it("round-trips through JSON", () => {
    const s = toSummary(session());
    const revived = parseSessionSummary(JSON.parse(JSON.stringify(serializeSessionSummary(s))));
    expect(revived).toEqual(s);
    expect(revived.createdAt).toBeInstanceOf(Date);
  });
});

describe("normalizeTags", () => {
  it("trims, collapses whitespace and keeps order", () => {
    expect(normalizeTags(["  client call ", "hardware"])).toEqual(["client call", "hardware"]);
    expect(normalizeTags(["client    call"])).toEqual(["client call"]);
  });

  it("de-duplicates case-insensitively, keeping the first spelling", () => {
    expect(normalizeTags(["Hardware", "hardware", "HARDWARE"])).toEqual(["Hardware"]);
  });

  it("drops empties and non-strings", () => {
    expect(normalizeTags(["  ", "", null, 42, "ok"])).toEqual(["ok"]);
    expect(normalizeTags("not an array")).toEqual([]);
    expect(normalizeTags(undefined)).toEqual([]);
  });

  it("survives the session round-trip", () => {
    const revived = parseSession(JSON.parse(JSON.stringify(serializeSession(session()))));
    expect(revived.tags).toEqual(["client call", "hardware"]);
  });

  it("defaults to no tags for files predating them", () => {
    const old = JSON.parse(JSON.stringify(serializeSession(session()))) as Record<string, unknown>;
    delete old.tags;
    expect(parseSession(old).tags).toEqual([]);
  });
});

describe("session ids", () => {
  it("accepts a generated id", () => {
    expect(isValidSessionId(newSessionId())).toBe(true);
  });

  it("generates chronologically sortable ids", () => {
    const a = newSessionId(new Date("2026-08-04T10:00:00"));
    const b = newSessionId(new Date("2026-08-04T11:00:00"));
    expect(a < b).toBe(true);
  });

  it("pads a year below 1000, so the id still passes its own validator", () => {
    // Reachable from the import dialog: a date input left with a half-typed year
    // keeps "0202-08-05" and parses to a valid Date. An unpadded id ("202-08-05T…")
    // fails isValidSessionId, and every autosave for that session then 400s.
    const id = newSessionId(new Date("0202-08-05T10:20:30"));
    expect(id.startsWith("0202-08-05T")).toBe(true);
    expect(isValidSessionId(id)).toBe(true);
  });

  it("rejects path traversal and absolute paths", () => {
    // These ids become directory names, with a delete endpoint behind them.
    for (const bad of [
      "../../etc",
      "/etc/passwd",
      "2026-08-04T19-48-12-a3f9/../../x",
      "..",
      "",
      "2026-08-04T19-48-12-a3f9 ",
      "2026-08-04T19-48-12-A3F9/x",
    ]) {
      expect(isValidSessionId(bad), `should reject: ${bad}`).toBe(false);
    }
  });
});
