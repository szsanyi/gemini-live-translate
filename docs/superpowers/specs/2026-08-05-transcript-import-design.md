# Transcript import (pasted Teams transcript)

**Date:** 2026-08-05
**Status:** approved
**Follows:** `2026-08-04-session-store-design.md`

## Problem

Meetings that already happened cannot get into the app. The only way in is to play
the audio back and capture it live, which costs a full real-time pass and a Live
session for something that is already text.

The obvious route — Microsoft Graph (`/onlineMeetings/{id}/transcripts`) — is closed
in practice. Both the delegated and the application form of
`OnlineMeetingTranscript.Read.All` require admin consent, the application form
additionally requires a Teams-admin-created application access policy, and in a
hardened tenant non-admins cannot register an app at all. Measured on the target
tenant: **neither the recording nor the `.vtt` transcript can be downloaded.**

What *is* available is the transcript pane in the Teams UI, and a selection copied
out of it. That paste is the input this feature takes.

## Goals

1. Paste a Teams transcript and get a normal recording in the library.
2. Keep speaker attribution — a meeting transcript without speakers is much less useful.
3. Everything downstream (library, summary, corrections, Obsidian, txt/md/pdf/srt
   export) works on an imported recording with no changes.
4. No new provider calls at import time.

## Non-goals

- Any Microsoft Graph integration. It is blocked by tenant policy, not by effort.
- `.vtt` / `.srt` file import. Those files cannot be obtained here; the generic
  fallback (below) covers a hand-pasted plain transcript.
- Audio import / batch transcription of an mp4. Separate feature, needs a recording
  we cannot download.
- Automatic translation of imported segments (see *Translation* below).
- Phonetic reconstruction of a mis-recognised transcript (see *Known limitation*).

## Input format

A Teams transcript copied from the transcript pane. A speaker change emits four
lines, two of which are screen-reader duplicates:

```
Sándor Deli-Szabó                        ← bare name           (drop)
0 minutes 10 seconds0:10                 ← spelled time + short time, concatenated (drop)
Sándor Deli-Szabó 0 minutes 10 seconds   ← cue header: speaker + offset
See ya.                                  ← cue text
```

Further cues **inside the same turn** have no decoration — header plus text only:

```
Tamás Bognár 0 minutes 52 seconds
Yeah.
```

So the cue header is the one line that carries both pieces of information, and it is
the only line the parser anchors on.

### Grammar

```
header  := <speaker> WS <time>
time    := [<n> WS hour|hours WS] [<n> WS minute|minutes WS] <n> WS second|seconds
decor   := <time-without-speaker> <short-time>          e.g. "0 minutes 10 seconds0:10"
short   := <n>:<nn> | <n>:<nn>:<nn>
```

Singular and plural forms both occur (`1 minute 3 seconds`, `2 minutes 6 seconds`)
and the observed data uses `0 minutes` for offsets under a minute, so no component
may be assumed present or absent. `hour(s)` is unobserved in the sample (the meeting
was short) and is supported on the same pattern.

### Parsing algorithm

1. Split on newlines, trim each line, drop empties.
2. Drop every `decor` line. The trailing `short` time makes the pattern unambiguous —
   a `header` never ends in `n:nn`.
3. Find the `header` lines. For each, the cue text is every line up to the next
   header, joined with a space.
4. Drop a line that is identical to the *following* header's speaker — that is the
   bare-name decoration of a new turn.
5. `startMs` comes from the header's spelled-out time. `endMs` is the next cue's
   `startMs`; the last cue gets `startMs + TAIL_MS` (4 s, a module constant in
   `transcriptImport.ts` — it exists only so the final subtitle cue has a duration).

**The header pattern alone is not sufficient, and must be corroborated.** The `header`
grammar is `<anything> <time>`, so an ordinary sentence ending in a time phrase
satisfies it: "We only have 10 seconds" parses as speaker `"We only have"` at
`startMs: 10000`. Worse than the bogus attribution, the cue that sentence belonged to
is *lost* — the false header opens a new cue, leaving the real one with empty text,
which the drop-empty step then removes. Measured, not theorised.

A `header` match is therefore accepted only when at least one of these holds:

1. a `decor` line immediately preceded it — a real new turn was announced; or
2. its speaker equals the currently-open cue's speaker — a continuation inside a turn
   always repeats the same name; or
3. no cue is open yet — a partial copy beginning at a header line must not lose its
   whole first turn; or
4. the speaker candidate is a name that has already opened a cue in this same paste —
   it is therefore a speaker and not a sentence tail. `"We only have"` is never such a
   name, so the measured failure above stays fixed; `"Attila Kiss"` is one as soon as
   he has spoken with decoration, which is the common partial-loss case below.

A match satisfying none of them is body text and is appended to the open cue.

Accepted trade-off: if a `decor` block is missing mid-transcript **for a speaker who
has not yet spoken**, the following header is not recognised — and the cost is not
merely attribution. The header *string itself* is appended to the previous speaker's
cue text, so `"Attila Kiss 0 minutes 30 seconds"` becomes part of the meeting text and
flows on into the summary prompt, the Obsidian note and every export. Quietly, too:
the preview still reads plausibly. Condition 4 removes this for any speaker already
seen, which covers the observed format (where a speaker change always carries `decor`
somewhere in the paste); a first-ever speaker whose decoration is missing remains
exposed. No further heuristics (fuzzy name matching, time-monotonicity checks) are
used; they would trade a measured failure for speculative ones.

Not handled, deliberately: a variant where the two time renderings of a `decor` block
arrive on separate lines. That format has never been observed, and inventing a rule for
it would widen the header pattern against no evidence.

**Fallback:** if step 3 accepts no headers at all, every non-empty line becomes a cue
with no speaker and no time. A paste from a differently-versioned Teams client, or a
hand-assembled transcript, then still imports as readable text instead of failing.

Such cues keep `startMs`/`endMs` unset, and that has one visible consequence:
`buildSrt` substitutes `startMs ?? 0`, so an SRT exported from a timestamp-less import
stacks every cue at 00:00. Accepted rather than papered over — synthesising offsets
would fabricate timings the source never had, and a transcript pasted without times
has no subtitle track to give. The txt/md/pdf exports are unaffected.

### Merging

The sample would otherwise produce a card per fragment: one speaker's 1:56 → 2:06 →
2:13 → 2:24 → 2:26 run is five cards of one sentence each.

**The turn boundary is in the input, so no time heuristic is needed.** A new turn is
exactly what the two decoration lines announce; continuation cues inside a turn have
none. The parser therefore marks each cue with `turnStart`, and `mergeCues` joins the
cues of one turn into a single cue — first `startMs`, last `endMs`, texts joined with a
space. This reproduces Teams' own grouping rather than guessing at it.

A gap-based threshold was considered and rejected: `endMs` is by construction the next
cue's `startMs`, so the inter-cue gap is always zero and any such threshold merges
everything. Measuring start-to-start instead would have split the 2:13 → 2:24 pair
(11 s) in the middle of a run that visibly belongs together.

On the fallback path there are no decoration lines, so every cue is its own turn and
nothing merges. Same if a partial copy loses the decorations: more, smaller cards —
degraded, not wrong.

## Design

### `shared/transcriptImport.ts` (new)

Pure, no Node imports — it must stay importable by Vite as well as tsx, like the other
`shared/` modules.

```ts
export interface Cue {
  speaker: string | null;
  /** Null only on the no-header fallback path. */
  startMs: number | null;
  endMs: number | null;
  text: string;
  /** True when the input announced a new speaker turn here (see Merging). */
  turnStart: boolean;
}

export function parseTeamsTranscript(text: string): Cue[];
export function mergeCues(cues: Cue[]): Cue[];
export function cuesToPairs(cues: Cue[], opts: {
  sourceLang: string;
  baseDate: Date;
}): TranslationPair[];
```

The parser fills `endMs`, so `mergeCues` can keep the first cue's `startMs` and the
last one's `endMs` without recomputing anything, and `cuesToPairs` is a plain mapping.

`cuesToPairs` sets `translatedText: ""`, `targetLang` equal to `sourceLang` (nothing
is translated yet), and `timestamp = baseDate + (startMs ?? 0)`. `TranscriptCard`
derives `hasTranslation` from `translatedText.trim().length > 0` and already renders
single-column when it is empty, so untranslated imported cards need no component work
beyond the speaker line.

### `speaker` on `TranslationPair`

A new optional field rather than a `"Name: text"` prefix inside `originalText`.
A prefix would be re-parsed by every consumer, would leak into the correction rules'
match surface, and could not be styled. Touched:

- `src/types.ts` — `speaker?: string`
- `shared/session.ts` — carry it through `parsePair`; `serializeSession` already
  spreads the pair, so only parsing needs the field. Round-trip test extended.
- `src/components/TranscriptCard.tsx` — render the name above the original text.
- `src/lib/export.ts` — `renderTranscriptText` / `renderTranscriptMarkdown` prefix the
  speaker when present; `buildSrt` leaves cues alone.
- `src/lib/pdf.ts` — same prefix as the text renderer.

The summary prompt consumes the transcript through the same block model, so speaker
attribution reaches `/api/summarize` for free and produces a better summary.

### `src/components/ImportDialog.tsx` (new)

- Textarea for the paste.
- Source-language select, defaulting to the current `sourceLang`.
- Meeting date (date input, defaults to today). **Required for correctness, not
  cosmetics:** `saveToObsidian` derives the note's directory and filename from the
  session date, so importing last week's meeting without it files the note under
  today.
- Live preview from the parser: cue count, distinct speaker count, transcript length.
  This doubles as the format check — a paste the parser does not understand shows
  "no speakers / no timestamps" before anything is imported.
- Import button, disabled while the parse yields zero cues.

### Wiring in `App.tsx`

`importTranscript(cues, { sourceLang, baseDate })`:

1. `startNewSession()` — an import never merges into the open recording.
2. `ensureSessionId()`, with `sessionCreatedAtRef` set to `baseDate`.
3. `setPairs(cuesToPairs(...))`.
4. Profile written as `translate: false, speak: false` — an imported transcript is a
   plain recording that happens not to have come from a microphone.
5. `elapsedBeforeRef.current` = last cue's `endMs`, so resuming the recording with a
   live session continues the cue timeline instead of overlapping it.

The existing autosave effect (`App.tsx:435`) then writes it to disk on its own. No new
HTTP endpoint, no server change.

Entry point: an import button in the `RecordingsDrawer` header, beside the close
button. (The new-recording action lives in `SessionBar`, not the drawer; the library
header is where a "bring something into the library" action belongs.)

### Translation

Not automatic. `/api/translate-text` takes one segment per call; the sample paste is
~40 cues, so an automatic import would fire ~40 provider calls for a transcript the
user may only want to read. Translation stays the existing per-segment action, and
merging has already cut the number of segments it would cost.

## Known limitation (measured, not hypothetical)

The sample transcript from the target tenant is Hungarian speech transcribed by an
**English** recogniser: "See ya" for *szia*, plus "See your funny", "Min and the city
is so bad", "My demo leak", "The Hojwaj", "Hey Cortana". This is not fixable by
correction rules — the rules substitute exact strings, and these are phonetic
mis-hearings, not consistent misspellings.

The fix is upstream: set the spoken language to Hungarian when transcription starts in
Teams. The importer is worth building regardless — it is the only way in for any
already-finished meeting — but it cannot improve on what it is given.

A possible later pass: hand the mis-transcribed text to the existing `textModel.ts`
runner with a prompt to reconstruct the Hungarian, since the English words are
phonetic approximations of it. Deliberately out of scope until its quality is measured
on a real sample.

## Testing

`shared/__tests__/transcriptImport.test.ts`, driven by the real sample paste as a
fixture. It covers, because it happens to contain all of them:

- speaker-change blocks with both decoration lines
- continuation cues inside a turn (header + text, no decoration)
- singular and plural time units (`1 minute 3 seconds`, `2 minutes 6 seconds`)
- `0 minutes` offsets under a minute
- four distinct speakers, one of whom appears exactly once (`Attila Kiss`)
- a five-cue same-speaker turn (1:56 → 2:26) that must merge into one cue

Synthetic cases on top of the fixture, for what the sample happens not to contain:
two **adjacent turns by the same speaker**, which must not merge across the boundary;
`hour` offsets; the no-header fallback; an empty paste; and `cuesToPairs` timestamp and
offset arithmetic.

`shared/__tests__/session.test.ts` gains a `speaker` round-trip case, per the standing
rule in CLAUDE.md that a shape change extends those tests.

## Risks

- **`App.tsx` growth.** It is already ~1150 lines. The import logic lands as one
  function plus dialog state; the parser lives in `shared/`, the UI in its own
  component. Nothing else moves.
- **The `.tsx` shadowing blind spot.** CLAUDE.md records that `tsc --noEmit` will not
  flag a state binding shadowing an imported function in a `.tsx` file. The new
  imports (`parseTeamsTranscript`, `mergeCues`, `cuesToPairs`) must not collide with
  state names, and the page has to be loaded and the console checked after wiring.
