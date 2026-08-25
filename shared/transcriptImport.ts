import type { TranslationPair } from "../src/types.ts";

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
  // Speakers already accepted from a header in this paste. A partial copy can lose a
  // turn's decoration block, leaving its header uncorroborated by the three
  // conditions below — a name that has demonstrably spoken here corroborates it, and
  // keeps the header line out of the previous cue's text.
  const seenSpeakers = new Set<string>();

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
        // …or it is a continuation inside a turn, which repeats the same name…
        speaker === current.speaker ||
        // …or the name has already introduced a cue here, so it is a name and not a
        // sentence tail: the turn's decoration block was lost, not its speaker.
        seenSpeakers.has(speaker);
      if (corroborated) {
        seenSpeakers.add(speaker);
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
