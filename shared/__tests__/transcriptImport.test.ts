import { describe, it, expect } from "vitest";
import { parseTeamsTranscript, mergeCues, cuesToPairs } from "../transcriptImport.ts";

const SAMPLE = `Sándor Deli-Szabó
0 minutes 10 seconds0:10
Sándor Deli-Szabó 0 minutes 10 seconds
See ya.

Tamás Bognár
0 minutes 12 seconds0:12
Tamás Bognár 0 minutes 12 seconds
See your funny.

Tamás Bognár
0 minutes 31 seconds0:31
Tamás Bognár 0 minutes 31 seconds
Okay.
Tamás Bognár 0 minutes 52 seconds
Yeah.

Attila Kiss
1 minute 12 seconds1:12
Attila Kiss 1 minute 12 seconds
Fiesta, Fiesta.
`;

describe("parseTeamsTranscript", () => {
  it("keeps only the real cues, dropping both decoration lines", () => {
    const cues = parseTeamsTranscript(SAMPLE);
    expect(cues.map((c) => c.text)).toEqual([
      "See ya.",
      "See your funny.",
      "Okay.",
      "Yeah.",
      "Fiesta, Fiesta.",
    ]);
  });

  it("attributes every cue to its speaker", () => {
    const cues = parseTeamsTranscript(SAMPLE);
    expect(cues.map((c) => c.speaker)).toEqual([
      "Sándor Deli-Szabó",
      "Tamás Bognár",
      "Tamás Bognár",
      "Tamás Bognár",
      "Attila Kiss",
    ]);
  });

  it("reads the spelled-out offset, singular and plural alike", () => {
    const cues = parseTeamsTranscript(SAMPLE);
    expect(cues.map((c) => c.startMs)).toEqual([10_000, 12_000, 31_000, 52_000, 72_000]);
  });

  it("marks a turn start only where the input announced one", () => {
    // The 0:52 cue is a continuation inside Tamás's 0:31 turn — no decoration lines.
    const cues = parseTeamsTranscript(SAMPLE);
    expect(cues.map((c) => c.turnStart)).toEqual([true, true, true, false, true]);
  });

  it("ends each cue where the next one starts, and gives the last a tail", () => {
    const cues = parseTeamsTranscript(SAMPLE);
    expect(cues.map((c) => c.endMs)).toEqual([12_000, 31_000, 52_000, 72_000, 76_000]);
  });

  it("reads hour offsets", () => {
    const cues = parseTeamsTranscript(
      "Nagy Béla\n1 hour 2 minutes 3 seconds1:02:03\nNagy Béla 1 hour 2 minutes 3 seconds\nStill here.\n",
    );
    expect(cues[0].startMs).toBe(3_723_000);
    expect(cues[0].text).toBe("Still here.");
  });

  it("joins a cue's wrapped text lines with a space", () => {
    const cues = parseTeamsTranscript(
      "Nagy Béla\n0 minutes 5 seconds0:05\nNagy Béla 0 minutes 5 seconds\nFirst part\nsecond part.\n",
    );
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe("First part second part.");
  });

  it("falls back to one cue per line when nothing looks like a header", () => {
    const cues = parseTeamsTranscript("Just a plain line.\n\nAnd another one.\n");
    expect(cues).toEqual([
      { speaker: null, startMs: null, endMs: null, text: "Just a plain line.", turnStart: true },
      { speaker: null, startMs: null, endMs: null, text: "And another one.", turnStart: true },
    ]);
  });

  it("returns nothing for an empty or whitespace-only paste", () => {
    expect(parseTeamsTranscript("")).toEqual([]);
    expect(parseTeamsTranscript("   \n\n  \t \n")).toEqual([]);
  });

  // The header pattern is `<anything> <time>`, which ordinary speech can satisfy.
  // Accepting such a line does not merely mis-attribute it — it loses the real cue.
  it("keeps a sentence that ends in a time phrase as text, in place", () => {
    const cues = parseTeamsTranscript(
      "Nagy Béla\n0 minutes 5 seconds0:05\nNagy Béla 0 minutes 5 seconds\n" +
        "We only have 10 seconds\nso let's hurry up and finish this part.\n",
    );
    expect(cues).toHaveLength(1);
    expect(cues[0].speaker).toBe("Nagy Béla");
    expect(cues[0].startMs).toBe(5_000);
    expect(cues[0].text).toBe(
      "We only have 10 seconds so let's hurry up and finish this part.",
    );
  });

  it("still recognises a continuation cue by its repeated speaker name", () => {
    // Guards the corroboration rule's second condition: without it, every
    // continuation inside a turn would be swallowed as body text.
    const cues = parseTeamsTranscript(SAMPLE);
    const continuation = cues.find((c) => c.startMs === 52_000);
    expect(continuation?.text).toBe("Yeah.");
    expect(continuation?.speaker).toBe("Tamás Bognár");
    expect(continuation?.turnStart).toBe(false);
  });

  it("recognises a header whose decoration block is missing, for a speaker already seen", () => {
    // The common partial-loss case. Without the fourth corroboration condition the
    // header line itself is appended to the previous cue's text, so the raw
    // "Attila Kiss 0 minutes 30 seconds" ends up in the meeting transcript and from
    // there in the summary prompt, the Obsidian note and every export.
    const text =
      "Attila Kiss\n0 minutes 10 seconds0:10\nAttila Kiss 0 minutes 10 seconds\nHello everyone.\n" +
      "Tamás Bognár\n0 minutes 20 seconds0:20\nTamás Bognár 0 minutes 20 seconds\nAgreed.\n" +
      "Attila Kiss 0 minutes 30 seconds\nI disagree, actually.\n";
    const cues = parseTeamsTranscript(text);
    expect(cues.map((c) => c.text)).toEqual([
      "Hello everyone.",
      "Agreed.",
      "I disagree, actually.",
    ]);
    expect(cues.map((c) => c.speaker)).toEqual(["Attila Kiss", "Tamás Bognár", "Attila Kiss"]);
    expect(cues.map((c) => c.startMs)).toEqual([10_000, 20_000, 30_000]);
    // And merging must not fold it back into Tamás's cue either.
    expect(mergeCues(cues).map((c) => c.text)).toEqual([
      "Hello everyone.",
      "Agreed.",
      "I disagree, actually.",
    ]);
  });

  it("does not treat a sentence tail as a header just because names were seen", () => {
    // The measured failure the corroboration rules exist for, with the fourth
    // condition in place: "We only have" is not a name that has spoken here.
    const text =
      "Nagy Béla\n0 minutes 5 seconds0:05\nNagy Béla 0 minutes 5 seconds\nStarting now.\n" +
      "Kis Anna\n0 minutes 8 seconds0:08\nKis Anna 0 minutes 8 seconds\n" +
      "We only have 10 seconds\nso let's hurry up.\n";
    const cues = parseTeamsTranscript(text);
    expect(cues).toHaveLength(2);
    expect(cues[1].speaker).toBe("Kis Anna");
    expect(cues[1].startMs).toBe(8_000);
    expect(cues[1].text).toBe("We only have 10 seconds so let's hurry up.");
  });

  it("accepts a paste that begins at a header, with no decoration before it", () => {
    // A selection copied from the middle of the transcript pane. Its first turn must
    // survive rather than being dropped for lack of a preceding decoration line.
    const cues = parseTeamsTranscript("Nagy Béla 0 minutes 5 seconds\nMid-selection.\n");
    expect(cues).toHaveLength(1);
    expect(cues[0].speaker).toBe("Nagy Béla");
    expect(cues[0].startMs).toBe(5_000);
    expect(cues[0].text).toBe("Mid-selection.");
  });
});

describe("mergeCues", () => {
  it("joins the continuation cues of one turn into a single cue", () => {
    const merged = mergeCues(parseTeamsTranscript(SAMPLE));
    expect(merged.map((c) => c.text)).toEqual([
      "See ya.",
      "See your funny.",
      "Okay. Yeah.",
      "Fiesta, Fiesta.",
    ]);
  });

  it("keeps the first start and the last end of a merged turn", () => {
    const merged = mergeCues(parseTeamsTranscript(SAMPLE));
    const tamas = merged[2];
    expect(tamas.startMs).toBe(31_000);
    expect(tamas.endMs).toBe(72_000);
  });

  it("does not merge two adjacent turns by the same speaker", () => {
    // Not in the sample (speakers alternate there), so built by hand: the second
    // turn carries its own decoration lines, hence turnStart.
    const text =
      "Nagy Béla\n0 minutes 5 seconds0:05\nNagy Béla 0 minutes 5 seconds\nFirst turn.\n" +
      "Nagy Béla\n0 minutes 9 seconds0:09\nNagy Béla 0 minutes 9 seconds\nSecond turn.\n";
    const merged = mergeCues(parseTeamsTranscript(text));
    expect(merged.map((c) => c.text)).toEqual(["First turn.", "Second turn."]);
  });

  it("leaves fallback cues alone (each is its own turn)", () => {
    const merged = mergeCues(parseTeamsTranscript("One line.\nAnother line.\n"));
    expect(merged).toHaveLength(2);
  });

  it("does not mutate its input", () => {
    const cues = parseTeamsTranscript(SAMPLE);
    mergeCues(cues);
    expect(cues).toHaveLength(5);
    expect(cues[2].text).toBe("Okay.");
  });
});

describe("cuesToPairs", () => {
  const baseDate = new Date("2026-07-30T09:00:00.000Z");

  it("offsets each pair's timestamp by its cue start", () => {
    const pairs = cuesToPairs(mergeCues(parseTeamsTranscript(SAMPLE)), {
      sourceLang: "en",
      baseDate,
    });
    expect(pairs[0].timestamp.toISOString()).toBe("2026-07-30T09:00:10.000Z");
    expect(pairs[3].timestamp.toISOString()).toBe("2026-07-30T09:01:12.000Z");
  });

  it("carries speaker and subtitle offsets onto the pair", () => {
    const pairs = cuesToPairs(mergeCues(parseTeamsTranscript(SAMPLE)), {
      sourceLang: "en",
      baseDate,
    });
    expect(pairs[2].speaker).toBe("Tamás Bognár");
    expect(pairs[2].startMs).toBe(31_000);
    expect(pairs[2].endMs).toBe(72_000);
  });

  it("leaves the translation empty and both languages the same", () => {
    const pairs = cuesToPairs(mergeCues(parseTeamsTranscript(SAMPLE)), {
      sourceLang: "en",
      baseDate,
    });
    expect(pairs[0].translatedText).toBe("");
    expect(pairs[0].sourceLang).toBe("en");
    expect(pairs[0].targetLang).toBe("en");
  });

  it("gives every pair a distinct id", () => {
    const pairs = cuesToPairs(mergeCues(parseTeamsTranscript(SAMPLE)), {
      sourceLang: "en",
      baseDate,
    });
    expect(new Set(pairs.map((p) => p.id)).size).toBe(pairs.length);
  });

  it("omits speaker and offsets for timestamp-less fallback cues", () => {
    const pairs = cuesToPairs(parseTeamsTranscript("Plain line.\n"), {
      sourceLang: "hu",
      baseDate,
    });
    expect(pairs[0].speaker).toBeUndefined();
    expect(pairs[0].startMs).toBeUndefined();
    expect(pairs[0].endMs).toBeUndefined();
    expect(pairs[0].timestamp.toISOString()).toBe(baseDate.toISOString());
  });
});
