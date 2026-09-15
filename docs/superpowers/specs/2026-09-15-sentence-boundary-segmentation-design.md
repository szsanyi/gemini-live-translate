# Sentence-boundary transcript segmentation

**Date:** 2026-09-15
**Status:** approved

## Problem

Transcript cards are cut by a fixed 1200 ms pause in the incoming text stream
(`SEGMENT_SILENCE_MS`, `App.registerActivity`). That timer knows nothing about the
sentence it is cutting, so it routinely closes a card mid-clause and hands the
fragment to the text model as a standalone unit to translate.

Measured over 165 cards from three real recordings:

| | cards | share |
|---|---|---|
| ends mid-sentence | 63 | **38%** |
| contains more than one speaker | 39 | 24% |
| both | 23 | 14% |

Nearly half the cards have one of the two problems. The damage is visible in the
Hungarian: one speaker's sentence split across two cards produced

```
EN: ... so I'll send you Yeah. Yeah. I'll take your Yeah. I'm headed for
HU: ... szóval küldeni fogok Igen. Igen. Elfogadom a te Igen. Úton vagyok

EN: the office here shortly, and I will get them all done this morning.
HU: az iroda itt hamarosan, és ma reggel mindent elintézek.
```

`az iroda itt hamarosan` is not a translation error. The second card *begins*
mid-clause, and no model can translate a sentence it was handed half of.

## Goals

1. A card ends at a sentence boundary whenever the transcript offers one.
2. Cards do not get longer than they are today — a monologue must not grow into a
   single huge card the user waits minutes for.
3. The split rule is a pure function, unit-tested, with the thresholds tunable
   without a rebuild.
4. A future speaker-change signal plugs in without redesigning anything.

## Non-goals

- **Speaker-aware splitting.** `AudioTranscriptionConfig.diarization` was measured
  today: accepted at session open, then ignored — every chunk came back with
  `speakerLabel`, `finished` and `languageCode` all undefined. The Live endpoint
  populates only `text`. This is recorded in CLAUDE.md; do not re-derive it.
- **Retroactively re-splitting a card that is already on screen.** Mechanically
  possible, but it would reshuffle 24% of cards under the reader's eyes, and the
  pieces would have no timestamps of their own — `words` is empty too, so there are
  no per-word offsets to split `startMs`/`endMs` on, and the SRT export would
  degrade. Deferred to its own feature, gated on an offline measurement of whether a
  text model can identify speaker turns in these transcripts at all.
- **Translation quality work.** The two other causes found alongside this one —
  no context between segments, and a register (`tegezés`/`magázás`) that flips
  between cards — are a separate change to the translation prompt.
- Batching several segments into one translation request.

## Design

### The rule

A new pure module, `src/lib/segmentation.ts`, answers two questions about the text
accumulated in the open card. It knows nothing about React, the network, or refs.

```ts
closeAfterMs(text, tuning)   // how much silence must follow before closing
shouldCloseNow(text, tuning) // close immediately, without waiting for silence
```

`shouldCloseNow` is asked first; only if it says no does `closeAfterMs` set the timer.
Within each function the first matching row wins.

**`shouldCloseNow`** — close without waiting for silence:

| condition | why |
|---|---|
| ≥ `hardCapWords` (120) | last resort against an unpunctuated run; cuts anywhere |
| ≥ `softCapWords` (60) **and** ends a sentence | the cap, taken at a sentence boundary so it still cuts nothing |

**`closeAfterMs`** — how much silence must follow:

| condition | delay | why |
|---|---|---|
| fewer than `minWords` (4) | `silenceMs` (1200) | a bare "Yeah." is a card only if speech actually stopped — this row wins even when it ends a sentence |
| text ends `.` `?` `!` | `sentencePauseMs` (**600**) | a whole sentence is in hand; nothing to wait for |
| anything else | `silenceMs` (1200) | **exactly today's behaviour** — the fallback |

The shorter pause at a sentence boundary is what keeps cards from growing: they
satisfy an extra condition but wait half as long for it, so the net length is about
what it is today. Mid-sentence the behaviour is unchanged, so there is no case where
this is worse than the current timer.

`endsSentence` tests the trimmed tail for `.`, `?`, `!` (allowing a trailing quote or
bracket). A decimal at the very end of a chunk ("87.") can fool it; the `minWords`
floor and the required 600 ms of silence make that rare enough to accept.

### Tuning

Defaults live in `src/lib/constants.ts`. They are overridable at runtime through
`localStorage`, the same pattern `audioDebug` already uses in `useAudioCapture`:

```js
localStorage.segmentTuning = '{"sentencePauseMs":500,"softCapWords":45}'
```

Read once when a recording starts, merged over the defaults, and logged so the
effective values are visible. Unparseable JSON falls back to the defaults silently —
a tuning knob must never be able to stop a recording.

### Wiring

The decision replaces the fixed `setTimeout(..., SEGMENT_SILENCE_MS)` in
`App.registerActivity`. One ordering change is required and is the riskiest part of
this work:

```js
// today — the timer is armed BEFORE the text is appended
const handleIncomingInputSpeech = (text) => {
  registerActivity();
  activeInputRef.current += text;
};
```

The rule needs the full accumulated text, so accumulation must happen first and the
decision second. With a fixed delay this ordering was irrelevant; it is not any more.
`npm run lint` cannot catch this — see *Type-checking blind spot* in CLAUDE.md — so
the wiring is verified by loading the page and watching cards close.

**Which text decides:** the source transcript (`activeInputRef`), which carries the
punctuation and the meaning. In interpreter mode the translation accumulates too, but
the sentence boundary is the same one; if the source is empty the rule falls back to
the translation text.

**Unchanged:** `turnComplete` still closes immediately, `finalizeCurrentTurn` is
untouched, accumulation and rendering are untouched. The only question this changes is
*when* the close is called.

### The reserved speaker hook

`shouldCloseNow` takes an optional `speakerChanged?: boolean` that nothing sets today.
When an acoustic speaker-change detector is built, it lands as an optional field on the
`inputTranscription` message in `shared/protocol.ts`, the client passes it through, and
the rule gains one clause: *sentence end + speaker changed → close now*. No protocol
rewrite, no re-segmentation design.

The detector is deliberately confined to **confirming a boundary the sentence rule
already offers**, never to cutting on its own. A false positive can then only split at a
place the sentence rule had already judged safe, so an unreliable acoustic signal
cannot reintroduce the mid-sentence cuts this feature removes — at worst it splits one
speaker's two sentences apart. Measured context: in the
sampled transcripts the speaker changes land *on* sentence boundaries
(`"It looked so scary. | Yeah, it was pretty intense"`), so the sentence rule already
supplies the candidate points.

## Testing

`src/lib/__tests__/segmentation.test.ts` covers every row of the rule table, plus
strings taken from the real transcripts: `"I'm headed for"` must not close,
`"It looked so scary."` must close after the short pause, a 70-word run ending in a
period must close immediately, a 130-word run without punctuation must close anyway.

Tuning is tested through its own parser: unknown keys ignored, malformed JSON falls
back to defaults, partial objects merge over them.

The `App.tsx` wiring is verified manually in the browser, as CLAUDE.md requires.

## Measuring the result

The metric is the **share of cards ending mid-sentence**, because it measures this
rule and nothing else — unlike word counts, it does not move when the ASR returns
different words on a second pass of the same audio.

```
now:    63 / 165 cards   (38%)
target: under 10%
```

The residue is the unpunctuated runs that fall back to the old timer. Card count and
the word-length distribution are watched alongside it, so the cap can be judged
neither too tight nor inert.

**Not measured here:** whether the Hungarian reads better. That is subjective and has
two other causes (missing context, drifting register) addressed separately.
