# Translation and speech toggles

**Date:** 2026-08-04
**Status:** approved

## Problem

The app can only work as a live interpreter: it always translates, and it always
speaks the translation aloud. Two use cases are unserved.

1. **Recording without translation.** A Hungarian-only phone call or meeting needs
   a transcript, not a translation.
2. **Translation without generated speech.** Spoken output is the most expensive
   part of a session. When the user only reads the transcript, generating audio
   wastes tokens.

Everything currently lives in browser memory, so a page refresh loses a session.
That is a real problem but a separate one — it is deliberately **out of scope
here** and gets its own spec.

## Measured constraints

These were verified against the live API before designing, not assumed.

| Probe | Result |
|---|---|
| `gemini-3.1-flash-live-preview` + `responseModalities: [TEXT]` | **Rejected** at session open: *"The requested combination of response modalities (TEXT) is not supported by the model"* |
| `gemini-3.5-live-translate-preview` + text input | No output at all — it is a speech→speech model |
| `gemini-3.1-flash-live-preview` + `[AUDIO]`, normal translate instruction | 49 audio chunks, correct input transcript, correct Hungarian translation |
| `gemini-3.1-flash-live-preview` + `[AUDIO]`, "stay silent" instruction | **0 audio chunks**, input transcript still complete and correct |

Two conclusions drive the whole design:

- **Speech generation cannot be switched off via response modalities.** The Live
  models only accept `AUDIO`. Switching to a different Live model does not help —
  3.1 Flash is the one that explicitly refuses `TEXT`.
- **A system instruction can silence the model while input transcription keeps
  working.** This is what makes both new modes possible, and it is where the
  token saving actually comes from. `proactivity.proactiveAudio` was not needed.

Consequence: translating *without* generated speech requires two phases — the Live
model transcribes, and a **text** model translates that transcript.
`gemini-flash-latest` is confirmed working on the project's key (most pinned model
ids return HTTP 429 `limit: 0` on free-tier keys).

## Design

### Mode matrix

Two independent booleans on the session config, surfaced as two checkboxes in the
settings panel:

| `translate` | `speak` | Mode | Models used |
|---|---|---|---|
| ✓ | ✓ | Interpreter (today's behaviour) | user-selected Live model, audio out |
| ✓ | ✗ | Translated transcript | 3.1 Flash Live (silenced) + `gemini-flash-latest` |
| ✗ | — | Plain recording | 3.1 Flash Live (silenced) |

`translate: false` makes `speak` meaningless, so the speech checkbox is disabled
and forced off in that state.

Both checkboxes are settable **only before the session starts** (`disabled={isActive}`,
matching the existing language selects). No mid-session switching: the user
explicitly chose this simplification, and it avoids reconnect churn.

### Model selection

When `speak` is off or `translate` is off, the model choice is not the user's to
make — the app pins the Live model to `models/gemini-3.1-flash-live-preview`
(the only one that can be instructed to stay silent) and locks the model block
with a short explanatory note. Unlocking happens by re-enabling speech.

The note also names the text model doing the translation, so the pairing is not
hidden from the user.

### Where the text translation happens

**Client-triggered, per finalized segment.** The client already owns segmentation
(the 1200 ms `SEGMENT_SILENCE_MS` pause timer in `App.tsx`). When a segment
closes:

1. The card is created immediately with the source text; its translation side is
   marked streaming.
2. The client POSTs that exact segment text to `POST /api/translate-text`.
3. The response fills in `translatedText` for that card id.

A server-side segmenter was rejected: it would run its own pause detection and
could drift from the client's, landing a translation in the wrong card. Keying off
the client's own segment boundary makes correct pairing structural rather than
lucky.

### Protocol changes

`InitMsg` gains two fields:

```ts
translate: boolean;
speak: boolean;
```

No new WebSocket message types. The text translation rides on a new HTTP endpoint,
consistent with the existing `/api/summarize` and `/api/subject`:

```
POST /api/translate-text
  { text, sourceLang, targetLang }  →  { translation }
```

### Server changes

- **`server/instructions.ts`** — add a silent-transcription branch returning the
  "listen only, never speak" instruction, and stop assuming a target language is
  always meaningful.
- **`server/providers/gemini.ts`** — take the profile; select the silent
  instruction, skip `translationConfig`, and **drop audio parts before relaying
  them when `speak` is false**. The silent instruction is a soft guarantee from a
  model; this makes it a hard one, so a chatty model can neither leak sound nor
  waste client bandwidth.
- **`server/providers/textModel.ts`** (new) — the provider dispatch
  (`resolveConfig` + `runPrompt` for gemini/openai/ollama) extracted from
  `summary.ts`, which currently keeps it private. Summary and text translation are
  now both consumers, so it becomes shared instead of duplicated. This is the only
  refactor in scope, and it sits directly in the path of the work.
- **`server/providers/textTranslate.ts`** (new) — `translateText(text, src, tgt)`
  built on `textModel.ts`.

### Client changes

- **`SettingsPanel`** — two checkboxes, disabled while active; model block locks
  with a note when speech or translation is off.
- **`App`** — `translate`/`speak` state; when `speak` is false the output
  `AudioContext` is never started at all; on segment finalize, fire the
  translate-text request when in translated-transcript mode.
- **`types.ts`** — `SessionConfig` gains the two flags; `TranslationPair`'s
  translated text becomes legitimately empty in recording mode.
- **`TranscriptCard`** — render a single, full-width column when the pair has no
  translation, instead of an empty second panel. Copy action copies just the
  source text in that case.
- **`Controls`** — Mute is disabled when `speak` is false, with a tooltip saying
  why (there is no audio to mute). Mute stays for the interpreter mode: it silences
  playback of audio that is still being generated, which is a different thing from
  not generating it.
- **`i18n.ts`** — new keys in both EN and HU.

### Export behaviour

`ExportOptions.targetText` already gates the translation row in the txt/md/pdf
renderers, so recording-mode exports need no new plumbing — the target row simply
has nothing to show. `buildSrt` must change: it currently always emits two lines
per cue, and should emit only the source line when there is no translation, so
subtitle files from a recording session are not padded with blank lines.

### Error handling

- **Text translation failure does not stop the session.** The card keeps its source
  text and shows the translation as failed. The recorded text is the valuable
  artifact; translation is an overlay on top of it, and losing a meeting because a
  translation call 429'd would be the worse failure.
- **Quota errors** surface the provider's message, as `/api/summarize` already does.
- **A model that speaks despite the silent instruction** is handled server-side by
  dropping audio parts, so no client change is needed to stay safe.

### Testing

- **Unit (vitest, `src/lib/__tests__/`)** — `buildSrt` with translation-less pairs;
  the txt and markdown renderers with `targetText` off and with empty translations.
- **Unit** — `buildInstruction` returns the silent instruction for the recording
  profile and omits `translationConfig` for it.
- **Manual** — all three modes end to end with a real microphone, confirming that
  recording mode produces no audible output and no audio chunks reach the client.

## Out of scope

- Session persistence, the recordings list, and delete — next spec.
- Saving the raw captured audio to a file (MediaRecorder).
- Mid-session switching of either toggle.
