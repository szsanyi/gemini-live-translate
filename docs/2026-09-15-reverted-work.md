# What was built on 2026-09-15, and reverted

All of it is preserved on the branch **`work/2026-09-15-session-resilience`** (tip
`e7be9b6`). Nothing was deleted; `main`-line history on `devid-devwork` simply returns
to `130b63e`.

It was reverted because the app behaved worse in use over the evening, and the cause
could not be isolated while five changes were in flight at once. The intent is to
re-apply them **one at a time, testing each on a real meeting before adding the next**.

---

## The measurements — keep these even if none of the code comes back

These cost an evening to establish and are the most valuable thing here. All were
verified against the live API on `gemini-3.1-flash-live-preview` unless stated.

**The transcript does not arrive continuously in silent mode.** Over 633 five-second
relay windows: median **0** transcription messages per window, 62% of windows empty,
~70 characters per message when one arrives. A separate 104-second probe saw 5
messages, 16-20 s apart, each a whole utterance. The very first recording of the day —
made *before* any change — already showed a median 7.6 s between cards, p90 29.6 s,
max 165 s. **So the blocky delivery is the provider's behaviour, not something a
client-side change caused or can fix.**

**`LiveServerContent.interimInputTranscription` is never populated.** The SDK documents
it as "low latency transcription updated while the user is speaking" — exactly what a
live subtitle needs. Zero messages over 104 seconds of continuous speech.

**`AudioTranscriptionConfig.diarization` is accepted and then ignored.** Session opens
without error; every chunk comes back with `speakerLabel`, `finished` and
`languageCode` all undefined. The endpoint fills in only `text`.

**Spoken output is what makes the transcript stream.** Same video, two modes:

| | interpreter (3.5-live-translate, speak on) | silent (3.1-flash-live) |
|---|---|---|
| windows carrying text | 70% | 35% |
| messages per 5 s | 2.39 | 0.35 |
| characters per message | 13 | 119 |
| rotations | 0 | 2 |
| silent stalls | 0 | 2 |

Same throughput (6.2 vs 8.3 chars/s), radically different granularity. **Note:
`3.1-flash-live` with speak on was tried afterwards and did *not* stream** — so this is
not simply "speak makes it stream"; the model matters and the mechanism is not
established.

**Token reports cannot be trusted across models.** `3.5-live-translate` reported 100
tokens for 7.5 minutes of audio, which is impossible.

**A Live session stops transcribing long before it admits it is dead.** 107 seconds of
steady audio (39 chunks / 208 KB per 5 s) with zero transcription, ended only by
`Resource has been exhausted`.

---

## The changes, in the order worth re-applying

### 1. Stall watchdog — highest value, lowest risk
`server/stall.ts`. Detects a Live session that has stopped transcribing but not closed,
from **speech going up with nothing coming back** (per-chunk RMS; silence cannot be the
signal, since audio flows through every pause). Rotates when it fires. A session that
has never produced a character is judged on a shorter leash (7 s of speech vs 20).

*Evidence it works:* fired three times in one evening, each time restoring a recording
that would otherwise have gone silent for minutes.
*Test:* record until the log shows `🔇 No transcript for Ns of speech — rotating`, then
check the transcript continues.

### 2. Rotation keeps the retiring session relaying — medium value, low risk
`server/rotation.ts` + `server.ts`. The old code silenced the outgoing session the
moment its replacement *started* opening, and closed it at the swap; the ASR lags the
audio it already holds, so the tail was discarded at every rotation. Now two guards
(`isLive` for control events, `isRelaying` for transcript text) and an `audioStreamEnd`
flush with a grace window.

*Test:* `LIVE_ROTATE_MS=8000`, record, check no words are lost across rotations.

### 3. Reconnect backoff — small, self-contained
`src/lib/reconnect.ts`. The fixed 800 ms retry spent all five attempts in four seconds,
which cannot work against a quota. Exponential with jitter, plus a floor when the close
reason is a quota refusal.

*Test:* hard to provoke deliberately; verify by unit tests and watch the console line
`Session dropped (...), reconnecting n/5 in Nms`.

### 4. Separate provider for the segment translation — configuration only
`TRANSLATE_PROVIDER` / `_MODEL` / `_API_KEY` / `_BASE_URL` in `textModel.ts`, plus an
OpenRouter branch (it speaks chat completions, not the Responses API the `openai`
branch uses). One exhausted account then stops taking out both the cards and the
recording's title — which is exactly what happened when an OpenAI key ran out of credit.

*Test:* set `TRANSLATE_PROVIDER` and confirm cards translate while the title still
comes from the other provider.

### 5. Scheduled-rotation skip + session age floor — the riskiest, add last
`shouldRotateOnSchedule`. Skips the 5-minute backstop rotation when the model reports
usage and it is low, because 188 sessions were being opened for 95 recordings. The age
floor (12 min) exists because a model that under-reports usage would otherwise keep the
skip firing for ever.

*Why last:* it is an optimisation whose whole premise — that the token report is
truthful — was measured false on one of the two models.

---

## Not worth re-applying as it was

**Sentence-boundary segmentation** (`docs/superpowers/specs/2026-09-15-sentence-boundary-segmentation-design.md`
on the branch). The rule worked on its own terms — 38% of cards ended mid-clause before
it, and the fragments were being handed to the translator as standalone units. But
waiting for a sentence boundary makes cards larger and blockier, and with a transcript
that arrives in 16-20 s lumps the extra wait bought a worse feel for a benefit the
delivery pattern swallows. Read the spec before rebuilding it, and only consider it
with a provider that delivers continuously.

---

## The open problem

Seeing words appear as they are spoken — named as one of the app's core points — cannot
be built on this Live model: the words do not arrive as they are spoken. It needs a
streaming ASR that emits interim hypotheses (Deepgram, Google Cloud STT v2,
AssemblyAI, Azure Speech). That would also make items 1, 2, 3 and 5 above unnecessary,
since their whole purpose is keeping a fragile long-lived session alive.
