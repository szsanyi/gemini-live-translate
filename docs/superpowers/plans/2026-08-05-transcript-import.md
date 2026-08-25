# Transcript Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste a transcript copied out of the Teams transcript pane and get a normal, fully-featured recording in the library.

**Architecture:** A pure parser in `shared/` turns the paste into cues (speaker + offsets + turn boundaries); a new dialog collects the paste, the spoken language and the meeting date; `App` maps cues to `TranslationPair[]` and the **existing** autosave effect persists them. `TranslationPair` gains an optional `speaker`, carried through session (de)serialization, the transcript card and all three text exports. No server change, no new HTTP endpoint, no provider call at import time.

**Tech Stack:** TypeScript, React 19, vitest 4, Tailwind v4, motion/react, lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-05-transcript-import-design.md`

## Global Constraints

- `shared/transcriptImport.ts` must contain **no Node imports** — `shared/` is imported by Vite and by tsx alike (CLAUDE.md).
- Do not add `import.meta` anywhere reachable from `server.ts` (CLAUDE.md). Not expected here; noted because `shared/` is bundled into the server.
- All new user-facing strings go in **both** maps in `src/i18n.ts`. `EN` is the source of truth; `HU` is `Record<StringKey, string>` and will fail type-check if a key is missing.
- Prefer the semantic CSS variables (`--bg-base`, `--text-muted`, `--border-medium`, …) and the `ThemeConfig` fragments over hardcoded colors.
- Type-check with `npm run lint`; unit tests with `npm test`. **Neither catches a `useState` binding that shadows an imported function in a `.tsx` file** (CLAUDE.md) — after Task 7, load the page and check the browser console.
- Commit after every task.

---

### Task 1: Cue parser — headers, decoration, offsets, turns

**Files:**
- Create: `shared/transcriptImport.ts`
- Test: `shared/__tests__/transcriptImport.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface Cue {
    speaker: string | null;
    startMs: number | null;
    endMs: number | null;
    text: string;
    turnStart: boolean;
  }
  export function parseTeamsTranscript(text: string): Cue[];
  ```

Read the *Input format* section of the spec before starting. The shape being parsed:
a new speaker turn emits **four** lines (bare name, screen-reader time + short time
concatenated, the real header, the text); a continuation cue inside the same turn
emits **two** (header, text).

- [ ] **Step 1: Write the failing test with the real sample as a fixture**

Create `shared/__tests__/transcriptImport.test.ts`. Keep `SAMPLE` byte-for-byte as
written here — it is a real paste from the target tenant, and every structural case
in this task is in it.

```ts
import { describe, it, expect } from "vitest";
import { parseTeamsTranscript } from "../transcriptImport.ts";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run shared/__tests__/transcriptImport.test.ts`
Expected: FAIL — cannot resolve `../transcriptImport.ts`.

- [ ] **Step 3: Write the parser**

Create `shared/transcriptImport.ts`:

```ts
/**
 * Parse a transcript copied out of the Microsoft Teams transcript pane.
 *
 * Importable from both the browser and the server — no Node imports here.
 *
 * Teams renders each cue three times for accessibility. A new speaker turn is:
 *
 *   Sándor Deli-Szabó                        ← bare name (decoration)
 *   0 minutes 10 seconds0:10                 ← spelled time + short time (decoration)
 *   Sándor Deli-Szabó 0 minutes 10 seconds   ← the header: speaker AND offset
 *   See ya.                                  ← the text
 *
 * A continuation cue inside the same turn has no decoration — header plus text only.
 * That asymmetry is the only signal for where a turn begins, and `mergeCues` relies
 * on it, so the decoration lines are classified rather than merely skipped.
 *
 * See docs/superpowers/specs/2026-08-05-transcript-import-design.md
 */

/** Duration given to the final cue, which has no successor to end it. */
const TAIL_MS = 4000;

/** "0 minutes 10 seconds0:10" — spelled-out time immediately followed by the short
 *  form. A header never ends in `n:nn`, which makes this unambiguous. */
const DECOR_RE = /^(?:\d+\s+(?:hours?|minutes?|seconds?)\s*)+\d{1,2}:\d{2}(?::\d{2})?$/;

/** "Speaker Name 1 minute 3 seconds" — hours and minutes are both optional, and
 *  singular and plural forms both occur in real output. */
const HEADER_RE =
  /^(.+?)\s+(?:(\d+)\s+hours?\s+)?(?:(\d+)\s+minutes?\s+)?(\d+)\s+seconds?$/;

export interface Cue {
  speaker: string | null;
  /** Null only on the no-header fallback path. */
  startMs: number | null;
  endMs: number | null;
  text: string;
  /** True when the input announced a new speaker turn here. */
  turnStart: boolean;
}

const toMs = (h: string | undefined, m: string | undefined, s: string): number =>
  (Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s)) * 1000;

export function parseTeamsTranscript(text: string): Cue[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const cues: Cue[] = [];
  let current: Cue | null = null;
  // A decoration line was just seen, so the next header opens a new turn.
  let pendingTurn = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (DECOR_RE.test(line)) {
      pendingTurn = true;
      continue;
    }

    // The header grammar is `<anything> <time>`, so an ordinary sentence ending in a
    // time phrase ("We only have 10 seconds") satisfies it. Accepting that would not
    // merely mis-attribute the line: it opens a new cue and leaves the real one with
    // empty text, which the drop-empty step below then removes — the utterance is
    // lost. So a match counts as a header only when something corroborates it.
    const header = HEADER_RE.exec(line);
    if (header) {
      const speaker = header[1].trim();
      const corroborated =
        // A real new turn was announced by the decoration lines…
        pendingTurn ||
        // …or this is a partial copy that begins at a header, whose first turn must
        // not be dropped…
        current === null ||
        // …or it is a continuation inside a turn, which repeats the same name.
        speaker === current.speaker;
      if (corroborated) {
        current = {
          speaker,
          startMs: toMs(header[2], header[3], header[4]),
          endMs: null,
          text: "",
          turnStart: pendingTurn,
        };
        pendingTurn = false;
        cues.push(current);
        continue;
      }
      // Uncorroborated: fall through and treat the line as body text.
    }

    // The bare-name decoration: followed by the decoration time line, and repeated
    // in the header after it. Both conditions are checked so that a genuine
    // utterance which happens to be someone's name is not swallowed.
    if (DECOR_RE.test(lines[i + 1] ?? "")) {
      const after = HEADER_RE.exec(lines[i + 2] ?? "");
      if (after && after[1].trim() === line) continue;
    }

    if (!current) continue; // stray text before the first header
    current.text = current.text ? `${current.text} ${line}` : line;
  }

  const withText = cues.filter((c) => c.text.length > 0);
  if (withText.length > 0) {
    for (let i = 0; i < withText.length; i++) {
      const start = withText[i].startMs;
      withText[i].endMs =
        start == null ? null : withText[i + 1]?.startMs ?? start + TAIL_MS;
    }
    return withText;
  }

  // Nothing was recognised as a header: a differently-versioned Teams client, or a
  // hand-assembled transcript. Keep the content as readable text rather than failing.
  return lines.map((line) => ({
    speaker: null,
    startMs: null,
    endMs: null,
    text: line,
    turnStart: true,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run shared/__tests__/transcriptImport.test.ts`
Expected: PASS, 12 tests.

If "ends each cue where the next one starts" fails with `endMs: null`, the `?? start + TAIL_MS` precedence is the likely cause — `??` binds looser than `+`, so `withText[i + 1]?.startMs ?? start + TAIL_MS` is correct, but wrapping it as `(withText[i + 1]?.startMs) ?? (start + TAIL_MS)` makes it explicit.

- [ ] **Step 5: Type-check and commit**

```bash
npm run lint
git add shared/transcriptImport.ts shared/__tests__/transcriptImport.test.ts
git commit -m "feat: parse pasted Teams transcripts into cues"
```

---

### Task 2: Turn merging and pair conversion

**Files:**
- Modify: `shared/transcriptImport.ts`
- Test: `shared/__tests__/transcriptImport.test.ts`

**Interfaces:**
- Consumes: `Cue`, `parseTeamsTranscript` from Task 1.
- Produces:
  ```ts
  export function mergeCues(cues: Cue[]): Cue[];
  export function cuesToPairs(
    cues: Cue[],
    opts: { sourceLang: string; baseDate: Date },
  ): TranslationPair[];
  ```

Why no time threshold: `endMs` is by construction the next cue's `startMs`, so the
inter-cue gap is always zero and any gap threshold merges everything. The turn
boundary is already in the input via `turnStart`.

- [ ] **Step 1: Write the failing tests**

Append to `shared/__tests__/transcriptImport.test.ts`, and extend the import at the
top to `import { parseTeamsTranscript, mergeCues, cuesToPairs } from "../transcriptImport.ts";`

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run shared/__tests__/transcriptImport.test.ts`
Expected: FAIL — `mergeCues is not a function` / `cuesToPairs is not a function`.

- [ ] **Step 3: Implement both functions**

Add to the top of `shared/transcriptImport.ts`, next to the existing imports (there
are none yet, so this becomes the first line of the file, above the doc comment's
closing — put it directly after the doc comment):

```ts
import type { TranslationPair } from "../src/types.ts";
```

Then append to the end of the file:

```ts
/**
 * Collapse the continuation cues of a speaker turn into one cue.
 *
 * The turn boundary comes from the input (`turnStart`), not from a time heuristic:
 * `endMs` is the next cue's `startMs`, so every inter-cue gap is zero and a
 * gap threshold would merge the whole transcript.
 */
export function mergeCues(cues: Cue[]): Cue[] {
  const out: Cue[] = [];
  for (const cue of cues) {
    const prev = out[out.length - 1];
    if (prev && !cue.turnStart && prev.speaker === cue.speaker) {
      prev.text = `${prev.text} ${cue.text}`;
      prev.endMs = cue.endMs;
      continue;
    }
    out.push({ ...cue });
  }
  return out;
}

/**
 * Turn cues into transcript pairs. Nothing is translated: `translatedText` stays
 * empty and `targetLang` mirrors `sourceLang`, which is what `TranscriptCard`
 * renders as a single full-width column.
 */
export function cuesToPairs(
  cues: Cue[],
  opts: { sourceLang: string; baseDate: Date },
): TranslationPair[] {
  return cues.map((cue) => {
    const pair: TranslationPair = {
      id: `import-${Math.random().toString(36).slice(2, 10)}`,
      originalText: cue.text,
      translatedText: "",
      sourceLang: opts.sourceLang,
      targetLang: opts.sourceLang,
      timestamp: new Date(opts.baseDate.getTime() + (cue.startMs ?? 0)),
    };
    if (cue.speaker) pair.speaker = cue.speaker;
    if (cue.startMs != null) pair.startMs = cue.startMs;
    if (cue.endMs != null) pair.endMs = cue.endMs;
    return pair;
  });
}
```

`pair.speaker` does not exist yet — Task 3 adds it. Expect a type error here until
then; that is why Task 3 follows immediately.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run shared/__tests__/transcriptImport.test.ts`
Expected: PASS, 22 tests (12 from Task 1 + 10 here). (vitest transpiles without
type-checking, so the missing `speaker` field does not block the run.)

- [ ] **Step 5: Commit**

```bash
git add shared/transcriptImport.ts shared/__tests__/transcriptImport.test.ts
git commit -m "feat: merge transcript turns and convert cues to pairs"
```

Do not run `npm run lint` yet — it fails on `pair.speaker` until Task 3.

---

### Task 3: `speaker` on `TranslationPair`, through the session store

**Files:**
- Modify: `src/types.ts:1-17`
- Modify: `shared/session.ts:156-171` (`parsePair`)
- Test: `shared/__tests__/session.test.ts`

**Interfaces:**
- Consumes: `cuesToPairs` from Task 2 (which already sets `speaker`).
- Produces: `TranslationPair.speaker?: string`, surviving the JSON round-trip.

`serializeSession` spreads each pair (`{ ...p, timestamp: iso(p.timestamp) }`), so
serialization needs no change — only `parsePair`, which builds its result field by
field and would otherwise drop it.

- [ ] **Step 1: Write the failing tests**

In `shared/__tests__/session.test.ts`, add `speaker: "Tamás Bognár"` to the pair in
the `session()` fixture (after `targetLang: "hu",`), then add this to the
`describe("session round-trip")` block:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run shared/__tests__/session.test.ts`
Expected: FAIL — the round-trip test reports `undefined` for `speaker`, and the
existing `survives serialize → JSON → parse unchanged` test also fails because the
fixture now has a field `parsePair` drops.

- [ ] **Step 3: Add the field and parse it**

In `src/types.ts`, inside `TranslationPair`, after `targetLang: string;`:

```ts
  /** Who said it. Set by transcript import; live sessions have no diarization. */
  speaker?: string;
```

In `shared/session.ts`, in `parsePair`, after the `if (typeof p.bidirectional === "boolean")` line:

```ts
  if (typeof p.speaker === "string" && p.speaker.trim()) pair.speaker = p.speaker.trim();
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run shared/__tests__/session.test.ts`
Expected: PASS, including the pre-existing round-trip tests.

- [ ] **Step 5: Full check and commit**

Run: `npm test` (all suites) and `npm run lint` — the Task 2 type error is resolved now.

```bash
git add src/types.ts shared/session.ts shared/__tests__/session.test.ts
git commit -m "feat: carry a speaker name on transcript pairs"
```

---

### Task 4: Speaker in the text, markdown and PDF exports

**Files:**
- Modify: `src/lib/export.ts:65-68` (`TranscriptBlock`), `:102-111` (`buildTranscriptBlocks`), `:134` (text), `:166` (markdown)
- Modify: `src/lib/pdf.ts:93-97`
- Test: `src/lib/__tests__/export.test.ts`

**Interfaces:**
- Consumes: `TranslationPair.speaker` from Task 3.
- Produces: `TranscriptBlock` of kind `"pair"` gains `speaker: string` (empty string
  when the pair has none). Renderers prefix the source line with `<LANG> · <Speaker>`.

One document model feeds txt / md / pdf (CLAUDE.md: add a renderer, not a second
model), so the speaker is added to the model once and consumed three times.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/export.test.ts`:

```ts
describe("speaker attribution in exports", () => {
  // Named to avoid shadowing the module-level `pair()` helper at the top of this
  // file, whose defaults (Hungarian source, a translation, subtitle offsets) are
  // wrong for these cases.
  const speakerPair = (over: Partial<TranslationPair> = {}): TranslationPair => ({
    id: "p1",
    originalText: "See ya.",
    translatedText: "",
    sourceLang: "en",
    targetLang: "en",
    timestamp: new Date("2026-07-30T09:00:10.000Z"),
    ...over,
  });

  it("puts the speaker on the block model", () => {
    const [block] = buildTranscriptBlocks([speakerPair({ speaker: "Tamás Bognár" })]);
    expect(block.kind).toBe("pair");
    if (block.kind === "pair") expect(block.speaker).toBe("Tamás Bognár");
  });

  it("prefixes the source line in the text export", () => {
    const txt = renderTranscriptText(buildTranscriptBlocks([speakerPair({ speaker: "Tamás Bognár" })]));
    expect(txt).toContain("EN · Tamás Bognár: See ya.");
  });

  it("prefixes the source line in the markdown export", () => {
    const md = renderTranscriptMarkdown(buildTranscriptBlocks([speakerPair({ speaker: "Tamás Bognár" })]));
    expect(md).toContain("- **EN · Tamás Bognár:** See ya.");
  });

  it("emits the plain language label when there is no speaker", () => {
    const blocks = buildTranscriptBlocks([speakerPair()]);
    expect(renderTranscriptText(blocks)).toContain("EN: See ya.");
    expect(renderTranscriptText(blocks)).not.toContain("·");
    expect(renderTranscriptMarkdown(blocks)).toContain("- **EN:** See ya.");
  });

  it("leaves subtitle cues free of the speaker name", () => {
    // An SRT cue is burned into video; a speaker prefix there is noise.
    const srt = buildSrt([speakerPair({ speaker: "Tamás Bognár", startMs: 10_000, endMs: 12_000 })]);
    expect(srt).toContain("See ya.");
    expect(srt).not.toContain("Tamás Bognár");
  });
});
```

No import changes are needed: line 2 of the file already imports `buildSrt`,
`buildTranscriptBlocks`, `renderTranscriptText` and `renderTranscriptMarkdown`, and
line 3 imports the `TranslationPair` type.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/export.test.ts`
Expected: FAIL — `block.speaker` is `undefined`, and the text/markdown assertions
find no `·`.

- [ ] **Step 3: Thread the speaker through the model and the renderers**

In `src/lib/export.ts`, in the `TranscriptBlock` union's `"pair"` member, add
`speaker: string;` after `index: number;`.

In `buildTranscriptBlocks`, in the `blocks.push({ kind: "pair", … })` call, add after
`index,`:

```ts
        speaker: p.speaker ?? "",
```

In `renderTranscriptText`, replace the source line:

```ts
      if (opts.sourceText) lines.push(`${b.src}: ${b.original}`);
```

with:

```ts
      if (opts.sourceText) {
        lines.push(b.speaker ? `${b.src} · ${b.speaker}: ${b.original}` : `${b.src}: ${b.original}`);
      }
```

In `renderTranscriptMarkdown`, replace:

```ts
      if (opts.sourceText) out.push(`- **${b.src}:** ${b.original}`);
```

with:

```ts
      if (opts.sourceText) {
        out.push(b.speaker ? `- **${b.src} · ${b.speaker}:** ${b.original}` : `- **${b.src}:** ${b.original}`);
      }
```

In `src/lib/pdf.ts`, replace the source label write:

```ts
        write(b.src, { size: 9, style: "bold", color: [120, 120, 120] });
```

with:

```ts
        write(b.speaker ? `${b.src} · ${b.speaker}` : b.src, { size: 9, style: "bold", color: [120, 120, 120] });
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. `src/lib/__tests__/recording-mode.test.ts` and
`shared/__tests__/session.test.ts` also render transcripts — they must stay green,
since pairs without a speaker keep the old output exactly.

- [ ] **Step 5: Type-check and commit**

```bash
npm run lint
git add src/lib/export.ts src/lib/pdf.ts src/lib/__tests__/export.test.ts
git commit -m "feat: show the speaker in transcript exports"
```

---

### Task 5: Speaker on the transcript card

**Files:**
- Modify: `src/components/TranscriptCard.tsx:90-100`

**Interfaces:**
- Consumes: `TranslationPair.speaker` from Task 3.
- Produces: nothing for later tasks.

There is no test — this is presentational, and the project has no component test
setup. It is verified by eye in Task 7.

- [ ] **Step 1: Render the speaker beside the source language badge**

In the source-speech column, the `<div className="flex items-center gap-2">` that
holds the language badge currently ends right after the badge's ternary. Add the
speaker directly after that closing `)}`, still inside the flex row:

```tsx
            {pair.speaker && (
              <span className="text-[10px] font-semibold text-[var(--text-secondary)] truncate">
                {pair.speaker}
              </span>
            )}
```

Placed in the flex row rather than above the text so a card without a speaker looks
exactly as it does today.

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/TranscriptCard.tsx
git commit -m "feat: show the speaker on transcript cards"
```

---

### Task 6: The import dialog

**Files:**
- Create: `src/components/ImportDialog.tsx`
- Modify: `src/i18n.ts` (both `EN` and `HU`)

**Interfaces:**
- Consumes: `parseTeamsTranscript`, `mergeCues`, `Cue` from Tasks 1–2; `LANGUAGES` from `@/shared/languages`; `formatClock` from `../lib/time`.
- Produces:
  ```ts
  interface ImportDialogProps {
    open: boolean;
    /** Language to preselect — the app's current source language. */
    defaultSourceLang: string;
    t: ThemeConfig;
    onClose: () => void;
    onImport: (cues: Cue[], opts: { sourceLang: string; baseDate: Date }) => void;
  }
  export function ImportDialog(props: ImportDialogProps): JSX.Element;
  ```
  The dialog hands over **merged cues**; mapping to pairs is the caller's job.

- [ ] **Step 1: Add the strings to both catalogues**

In `src/i18n.ts`, in the `EN` object, after the `"recordings.*"` group:

```ts
  "import.open": "Import transcript",
  "import.title": "Import transcript",
  "import.explain": "Paste a transcript copied from the Teams transcript pane. Speakers and timestamps are detected automatically.",
  "import.paste": "Transcript",
  "import.placeholder": "Paste here…",
  "import.sourceLang": "Spoken language",
  "import.date": "Meeting date",
  "import.dateHint": "Used for the recording's date and the Obsidian note's filename.",
  "import.preview": "{cues} segments · {speakers} speakers · {duration}",
  "import.previewPlain": "{cues} segments · no speakers or timestamps detected",
  "import.previewEmpty": "Nothing to import yet.",
  "import.confirm": "Import",
```

And the same keys in `HU`, in the same position:

```ts
  "import.open": "Transcript importálása",
  "import.title": "Transcript importálása",
  "import.explain": "Illessz be egy a Teams transcript paneljéből kimásolt szöveget. A beszélőket és az időbélyegeket felismeri.",
  "import.paste": "Transcript",
  "import.placeholder": "Ide illeszd be…",
  "import.sourceLang": "Elhangzott nyelv",
  "import.date": "Meeting dátuma",
  "import.dateHint": "A felvétel dátuma és az Obsidian jegyzet fájlneve ebből lesz.",
  "import.preview": "{cues} szegmens · {speakers} beszélő · {duration}",
  "import.previewPlain": "{cues} szegmens · nincs felismert beszélő és időbélyeg",
  "import.previewEmpty": "Még nincs mit importálni.",
  "import.confirm": "Importálás",
```

- [ ] **Step 2: Verify the catalogues stay in sync**

Run: `npm run lint`
Expected: clean. A key present in `EN` but missing from `HU` fails here, because `HU`
is typed `Record<StringKey, string>`.

- [ ] **Step 3: Write the dialog**

Create `src/components/ImportDialog.tsx`. It follows `CorrectionDialog.tsx`'s
structure (backdrop + centered panel, `AnimatePresence`, header with a close button).

```tsx
import { useMemo, useState } from "react";
import { X, FileInput } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ThemeConfig } from "../themes";
import { useLang } from "../i18n";
import { LANGUAGES, langName } from "@/shared/languages";
import { parseTeamsTranscript, mergeCues, type Cue } from "@/shared/transcriptImport";
import { formatClock } from "../lib/time";

interface ImportDialogProps {
  open: boolean;
  /** Language to preselect — the app's current source language. */
  defaultSourceLang: string;
  t: ThemeConfig;
  onClose: () => void;
  onImport: (cues: Cue[], opts: { sourceLang: string; baseDate: Date }) => void;
}

/** Today as `YYYY-MM-DD` in local time, for the date input's default. */
const todayValue = (): string => {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

/**
 * Import a transcript that was copied out of the Teams transcript pane.
 *
 * The preview doubles as the format check: a paste the parser does not understand
 * reports "no speakers or timestamps" before anything is imported.
 */
export function ImportDialog({
  open,
  defaultSourceLang,
  t,
  onClose,
  onImport,
}: ImportDialogProps) {
  const { lang: uiLang, tr } = useLang();
  const [text, setText] = useState("");
  const [sourceLang, setSourceLang] = useState(defaultSourceLang);
  const [date, setDate] = useState(todayValue);

  const cues = useMemo(() => mergeCues(parseTeamsTranscript(text)), [text]);
  const speakers = useMemo(
    () => new Set(cues.map((c) => c.speaker).filter((s): s is string => !!s)).size,
    [cues],
  );
  const lastEnd = cues.length > 0 ? cues[cues.length - 1].endMs : null;

  const preview =
    cues.length === 0
      ? tr("import.previewEmpty")
      : speakers === 0 || lastEnd == null
        ? tr("import.previewPlain", { cues: cues.length })
        : tr("import.preview", {
            cues: cues.length,
            speakers,
            duration: formatClock(lastEnd),
          });

  const submit = () => {
    if (cues.length === 0) return;
    onImport(cues, { sourceLang, baseDate: new Date(`${date}T00:00:00`) });
    setText("");
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(92vw,40rem)] surface-card shadow-2xl flex flex-col max-h-[85vh]"
          >
            <div className="px-5 py-3.5 border-b border-[var(--border-medium)] flex items-center justify-between shrink-0">
              <h2 className={`text-xs font-bold tracking-wider uppercase ${t.text} flex items-center gap-2`}>
                <FileInput className="w-4 h-4" /> {tr("import.title")}
              </h2>
              <button
                type="button" onClick={onClose} title={tr("recordings.close")}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-3 overflow-y-auto">
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                {tr("import.explain")}
              </p>

              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                  {tr("import.paste")}
                </span>
                <textarea
                  id="import-text"
                  autoFocus
                  rows={12}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={tr("import.placeholder")}
                  className="px-3 py-2 text-xs font-mono resize-y border border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)]"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                    {tr("import.sourceLang")}
                  </span>
                  <select
                    id="import-lang"
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="px-3 py-2 text-sm border border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] cursor-pointer"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{langName(l.code, uiLang)}</option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                    {tr("import.date")}
                  </span>
                  <input
                    id="import-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    title={tr("import.dateHint")}
                    className="px-3 py-2 text-sm border border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)]"
                  />
                </label>
              </div>

              <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
                {preview}
              </p>

              <button
                id="import-confirm"
                type="button"
                onClick={submit}
                disabled={cues.length === 0 || !date}
                className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-all cursor-pointer ${t.strong} ${t.strongHover} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {tr("import.confirm")}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npm run lint`
Expected: clean. If `FileInput` is not exported by the installed lucide-react
version, use `FileText` instead — it is already imported elsewhere in the project
(`RecordingsDrawer.tsx`), so it definitely exists.

- [ ] **Step 5: Commit**

```bash
git add src/components/ImportDialog.tsx src/i18n.ts
git commit -m "feat: add the transcript import dialog"
```

---

### Task 7: Wire the import into the app

**Files:**
- Modify: `src/App.tsx` (imports, one state flag, one handler, two JSX additions)
- Modify: `src/components/RecordingsDrawer.tsx:10-33` (one new prop + a header button)

**Interfaces:**
- Consumes: `ImportDialog` (Task 6), `cuesToPairs` (Task 2), `Cue` (Task 1).
- Produces: nothing further.

The import deliberately reuses what already exists: `startNewSession()`,
`ensureSessionId()` and the autosave effect at `src/App.tsx:435`. **Add no new
persistence code** — writing the session to disk is already handled.

- [ ] **Step 1: Add the drawer's import button**

In `src/components/RecordingsDrawer.tsx`, add to `RecordingsDrawerProps`:

```ts
  onImport: () => void;
```

Add `onImport,` to the destructured parameter list, add `FileInput` to the
`lucide-react` import (or `Import` if `FileInput` is unavailable — match whatever
Task 6 used), and put the button in the header, before the close button:

```tsx
              <div className="flex items-center gap-1.5">
                <button
                  id="recordings-import"
                  type="button"
                  onClick={onImport}
                  title={tr("import.open")}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-all cursor-pointer"
                >
                  <FileInput className="w-4 h-4" />
                </button>
                <button
                  id="recordings-close"
                  type="button"
                  onClick={onClose}
                  title={tr("recordings.close")}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
```

That replaces the bare close button currently sitting in the header row — the two
buttons now share a flex wrapper, matching the header layout used elsewhere.

- [ ] **Step 2: Add the handler in `App.tsx`**

Add the imports:

```ts
import { ImportDialog } from "./components/ImportDialog";
import { cuesToPairs, type Cue } from "@/shared/transcriptImport";
```

**Naming check (CLAUDE.md):** `cuesToPairs` must not collide with any `useState`
binding in this file — a shadowed import type-checks clean and then throws at
runtime. Grep before adding: `grep -n "cuesToPairs\|ImportDialog" src/App.tsx`.

Add the state flag next to the other dialog flags (`recordingsOpen`,
`obsidianDialogOpen`, `correctionOpen`):

```ts
  const [importOpen, setImportOpen] = useState(false);
```

Add the handler next to `openSession` / `startNewSession`:

```ts
  /**
   * Bring a pasted transcript in as a recording. It becomes an ordinary stored
   * session: the autosave effect writes it, and it is fully resumable — new live
   * segments continue from the imported timeline via `elapsedBeforeRef`.
   */
  const importTranscript = (cues: Cue[], opts: { sourceLang: string; baseDate: Date }) => {
    if (cues.length === 0) return;
    startNewSession();

    const imported = cuesToPairs(cues, opts);
    const id = newSessionId(opts.baseDate);
    sessionCreatedAtRef.current = opts.baseDate;
    elapsedBeforeRef.current = imported[imported.length - 1]?.endMs ?? 0;
    sessionStartRef.current = 0;
    setSessionId(id);

    setPairs(imported);
    setSourceLang(opts.sourceLang);
    // Source and target are always kept distinct (CLAUDE.md), even though nothing is
    // translated here — so that turning translation on afterwards lands in a valid pair.
    setTargetLang(opts.sourceLang === "en" ? "hu" : "en");
    // An imported transcript is a plain recording that did not come from a mic.
    setTranslate(false);
    setSpeak(false);
    // It already has its text; don't spend a call naming it automatically.
    autoTitledRef.current = id;

    setImportOpen(false);
    setRecordingsOpen(false);
  };
```

`newSessionId(opts.baseDate)` rather than `ensureSessionId()`, so the stored id and
the library's sort order reflect the meeting date, not the import time.
`startNewSession()` runs first and sets `sessionId` to `null`, so the `setSessionId`
here is what takes effect.

- [ ] **Step 3: Render the dialog and pass the drawer prop**

In the JSX, add `onImport={() => setImportOpen(true)}` to the `<RecordingsDrawer />`
element, and add the dialog next to it:

```tsx
      <ImportDialog
        open={importOpen}
        defaultSourceLang={sourceLang}
        t={t}
        onClose={() => setImportOpen(false)}
        onImport={importTranscript}
      />
```

- [ ] **Step 4: Type-check and test**

Run: `npm run lint` then `npm test`
Expected: both clean.

- [ ] **Step 5: Verify in the browser — required, not optional**

`npm run dev`, then open the app. CLAUDE.md: a green `tsc --noEmit` does not prove a
`.tsx` file works, so this step is what actually validates Task 7.

1. Open the recordings drawer → click the import button.
2. Paste the sample from `shared/__tests__/transcriptImport.test.ts`. The preview
   must report **4 segments and 3 speakers**: the fixture has four turns (the two
   Tamás cues merge into one) spoken by three distinct people — Sándor, Tamás and
   Attila. `speakers` counts distinct names through a `Set`, not turns.
3. Import. Check: cards carry speaker names, the merged card reads "Okay. Yeah.",
   timestamps count from the meeting date, and the console is clean.
4. Reload the page, open the drawer — the recording is listed and reopens intact.
   (This proves the autosave path, which is the whole reason no new persistence
   code was written.)
5. Export as txt and as md: the source lines read `EN · Tamás Bognár: …`.
6. Set the model dropdown aside and press start: new live segments must append after
   the imported ones, not overlap them.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/RecordingsDrawer.tsx
git commit -m "feat: import a pasted transcript as a recording"
```

---

### Task 8: Document the feature

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a section after "Session store"**

```markdown
### Transcript import

A meeting that already happened can be brought in by pasting the transcript copied
out of the Teams transcript pane (`ImportDialog` → `shared/transcriptImport.ts`).
Microsoft Graph is not used: `OnlineMeetingTranscript.Read.All` needs admin consent
plus a Teams-admin application access policy, and in a hardened tenant an app
registration is unavailable — measured, not assumed.

Teams renders every cue three times for accessibility. A new speaker turn emits four
lines (bare name, spelled time + short time concatenated, the real `speaker + offset`
header, the text); a continuation cue inside the same turn emits only the header and
the text. **That asymmetry is the turn boundary**, and `mergeCues` merges on it rather
than on a time threshold — `endMs` is by construction the next cue's `startMs`, so
every inter-cue gap is zero and a gap threshold would merge the whole transcript.

An import creates an ordinary stored session (`translate: false, speak: false`), so
the library, summary, corrections, Obsidian save and all exports work on it unchanged
and it stays resumable. There is no server endpoint — the existing autosave persists it.

`TranslationPair.speaker` exists for this: live sessions have no diarization, so it is
optional, and pairs without it render and export exactly as before.

Known limitation: if the meeting was transcribed with the wrong spoken language set in
Teams, the source text is phonetic nonsense ("See ya" for *szia*) and no correction
rule fixes it — the fix is upstream, in the Teams transcription language.

Design record: `docs/superpowers/specs/2026-08-05-transcript-import-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document transcript import"
```

---

## Self-Review

**Spec coverage:** Input format + parsing algorithm → Task 1. Merging → Task 2.
`cuesToPairs` → Task 2. `speaker` through types/session/card/exports → Tasks 3–5.
`ImportDialog` (paste, language, meeting date, preview) → Task 6. App wiring, profile
flags, `elapsedBeforeRef`, drawer entry point → Task 7. Testing section → Tasks 1–4.
Non-goals (Graph, vtt/srt files, audio, auto-translation, phonetic reconstruction) →
no tasks, correctly. Documentation → Task 8.

**Deliberate deviation from the spec:** the spec's *Design* section says `endMs` is
filled by the parser and lists it on `Cue`; Task 1 does exactly that. The spec's
earlier *Parsing algorithm* step 5 also mentions `TAIL_MS` — implemented as a module
constant in `transcriptImport.ts`, as the spec states.

**Type consistency:** `Cue` (`speaker`/`startMs`/`endMs`/`text`/`turnStart`) is
defined in Task 1 and used unchanged in Tasks 2, 6, 7. `mergeCues(cues)` takes one
argument everywhere. `cuesToPairs(cues, { sourceLang, baseDate })` is called with that
exact shape in Task 2's tests and in Task 7. `TranscriptBlock.speaker` is a `string`
(empty when absent) in Task 4's model, renderers and tests. `ImportDialog`'s
`onImport(cues, opts)` matches `importTranscript`'s signature in Task 7.

**Known ordering constraint:** Task 2 leaves a deliberate type error
(`pair.speaker`) that Task 3 resolves. Task 2's commit step therefore skips
`npm run lint`, and Task 3 runs the full check. Do not reorder these two.
