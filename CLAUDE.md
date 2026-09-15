# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (starts Express + Vite middleware on port 3000)
npm run dev

# Type-check only (no ESLint configured)
npm run lint

# Unit tests (vitest — src/lib/__tests__/ and server/__tests__/)
npm test

# Production build: Vite bundles the frontend, esbuild bundles server.ts → dist/server.cjs
npm run build

# Run production build
npm start

# Daemon helpers (build + background process, PID/log written to .run/)
./start.sh
./stop.sh
```

`PORT` overrides the default 3000. `start.sh` runs `npm run build` and then launches the resulting
bundle with `NODE_ENV=production node dist/server.cjs` (same entry point as `npm start`), so tsx is
only needed for `npm run dev`.

**Don't reintroduce `import.meta` into `server.ts`.** esbuild's `--format=cjs` output replaces
`import.meta` with `{}`, so anything derived from `import.meta.url` (e.g. the usual
`fileURLToPath(import.meta.url)` `__dirname` shim) becomes `undefined` and crashes the bundle on
load — while `npm run dev` under tsx/ESM keeps working, so the breakage only shows up in production.
Resolve paths from `process.cwd()` instead; `start.sh` and `npm start` both run from the repo root.

## Environment

Copy `.env.example` to `.env`. The server logs a warning (but keeps running) for each missing key,
and refuses only the affected session type.

| Var | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini Live translation models |
| `OPENAI_API_KEY` | The `gpt-realtime-translate` model |
| `SUMMARY_PROVIDER` | `gemini` \| `openai` \| `openrouter` \| `ollama` (default `gemini`) — powers AI summary + note titles |
| `SUMMARY_MODEL` / `SUMMARY_API_KEY` / `SUMMARY_BASE_URL` | Per-provider overrides; the key falls back to `GEMINI_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` |
| `TRANSLATE_PROVIDER` / `TRANSLATE_MODEL` / `TRANSLATE_API_KEY` / `TRANSLATE_BASE_URL` | Same four knobs for the *per-segment translation*, so it can run on its own provider |
| `OBSIDIAN_VAULT_DIR` | Where "Save to Obsidian" writes notes (has a hardcoded default in `server/obsidian.ts`) |

The summary/title provider is deliberately independent of the live-translation provider — a local
Ollama can title meetings while Gemini does the interpreting.

**The two text jobs can also be split from each other.** They are not the same shape: the segment
translation is ~130 small latency-sensitive requests in a half-hour meeting, the summary is one large
request at the end where quality matters and latency does not. Running both on one account also means
one outage takes out both — measured: an OpenAI key with no credit left turned every card into
"(translation failed)" *and* lost the recording's title in the same moment. So `TRANSLATE_*` mirrors
`SUMMARY_*` for the translation only. The fallback is deliberately **all-or-nothing**: without
`TRANSLATE_PROVIDER` the translation just uses the summary config, and once it is set nothing is
inherited — a field-by-field fallback would hand `gemini-flash-lite-latest` to OpenRouter and fail on
every single segment.

**OpenRouter gets its own provider branch, not the `openai` one.** It speaks the OpenAI *chat
completions* dialect; the `openai` branch posts to the *Responses* API (`/responses`), which
OpenRouter does not have — pointing `SUMMARY_BASE_URL` at it only earns a 404.

## Architecture

This is a **real-time speech interpreter** (any pair from a 27-language catalogue) built on Google's
Gemini Live API and OpenAI's Realtime Translation API. The core design keeps API keys server-side:
the browser never touches a provider directly.

### Data flow

```
Mic / Tab Audio
  → Web Audio API (16 kHz AudioContext)
  → ScriptProcessorNode → Float32 → Int16 PCM → base64
  → WebSocket (/api/live-ws) [client → server]
  → server.ts proxies to a Gemini Live session (sendRealtimeInput) or an OpenAI Realtime socket
  → provider callbacks → server relays typed JSON messages back to client
  → client decodes base64 PCM chunks (24 kHz) via Web Audio API → speakers
```

### WebSocket message protocol (client ↔ server)

Defined once in **`shared/protocol.ts`** as discriminated unions — change shapes there, not inline.

**Client → server:**
- `{ type: "init", model, sourceLang, targetLang, bidirectional, translate, speak }` — opens a
  provider session. `sourceLang`/`targetLang` are BCP-47 primary subtags (`"hu"`, `"en"`, `"de"`, …),
  *not* a mode enum. `translate`/`speak` select the session profile (see **Session modes**).
- `{ type: "audio", audio: <base64 PCM 16kHz> }` — streams captured audio
- `{ type: "interrupt" }` — clears the OpenAI input buffer (no-op for Gemini)

**Server → client:**
- `{ type: "status", status: "server-connected" | "connected" | "disconnected", reason? }`
- `{ type: "audio", audio: <base64 PCM 24kHz> }` — translated speech
- `{ type: "translation", text }` — incremental text delta of the translation
- `{ type: "inputTranscription", transcript }` — incremental delta of what the speaker said
- `{ type: "interrupted" }` — Gemini interrupted the current turn
- `{ type: "turnComplete" }` — turn finished; client finalizes a `TranslationPair`
- `{ type: "error", error }` — error message

### HTTP endpoints

- `GET  /api/health` → `{ status, gemini: bool, openai: bool }`
- `POST /api/summarize` → `{ en, hu, subject }` — summarizes a transcript in **both** interface
  languages plus a short title in **one provider request** (`generateSummaryBundle`, section-delimited
  response). Anything the model leaves out is asked for again with the old per-language prompts, so a
  format slip costs what the previous three-call version did; a failing `subject` degrades to `""`
  instead of failing the request. Request count matters here — see *Measured API constraints*.
  **Summary length scales with the transcript** (`summaryDepth`): the prompt used to say only
  "concisely", so a two-minute exchange and a forty-minute meeting came back the same short
  paragraph.
  **A word target is a weak lever — the bullet count is the strong one.** Measured on the same
  10 356-word meeting: asking for "roughly 520 words" returned 212-234 (40-45%); asking for
  "at least 21 bullet points under 4 headings" returned exactly 21 bullets and 441-468 words.
  So `summaryDepth` leads with counts (one bullet per 500 transcript words, 4-30; sections =
  bullets/5, 2-8) and states the word figure only as a floor (one word per 20 transcript words,
  120-1000 — the input carries both languages). The other load-bearing sentence is the coverage
  demand ("every distinct topic, decision, commitment, name, number and open question"), which is
  what actually drives length; and the no-padding clause, which is what keeps a long but
  content-free recording short. Don't replace the counts with a word target again.
- `POST /api/subject` → `{ subject }` — AI title only, for the Obsidian dialog's "Generate" button
- `POST /api/save-obsidian` → `{ path, subject, updated }` — writes the Markdown note
- `POST /api/translate-text` → `{ translation }` — translates one finished transcript segment with the
  text model; used by the translated-transcript mode, where the Live model is silent
- `GET /api/sessions` → `{ sessions }` — library listing (no transcript bodies)
- `GET /api/sessions/:id` → `{ session }`, `PUT`/`POST /api/sessions/:id` — load and autosave upsert
  (POST exists only because `sendBeacon` can't PUT), `DELETE /api/sessions/:id?withNote=true`

### Key files

**Server-side**
- **`server.ts`** — Express + WebSocket entry point and the HTTP endpoints above. One AI session per
  client connection; in dev mode mounts Vite as middleware, in production serves `dist/` with an SPA
  fallback.
- **`server/instructions.ts`** — `buildInstruction(model, LangConfig)` → `systemInstruction` +
  BCP-47 `targetLang`. Prompts are composed from the languages' English names, so any pair works;
  keep prompt strings here rather than in providers.
- **`server/providers/gemini.ts`** — `createGeminiSession()`: Gemini Live SDK wiring, typed callbacks.
- **`server/providers/openai.ts`** — `createOpenAISession()`: OpenAI Realtime WebSocket relay.
- **`server/providers/textModel.ts`** — Shared text-model runner (Gemini / OpenAI Responses API /
  Ollama), configured from the `SUMMARY_*` env vars. Used by both the summary and the segment
  translation; add text-model consumers here rather than duplicating the dispatch. Also owns the
  **retry policy and error formatting** for every text-model call (see *Transient provider failures*).
- **`server/providers/summary.ts`** — Summary + title prompts on top of `textModel.ts`.
- **`server/providers/textTranslate.ts`** — `translateText()`: one finished transcript segment,
  translated by the text model.
- **`server/obsidian.ts`** — `saveToObsidian()`: writes `<vault>/<YYYY-MM-DD>/<YYYY-MM-DD HH-MM subject>.md`
  with Obsidian YAML frontmatter.
- **`shared/protocol.ts`**, **`shared/languages.ts`** — Shared with the browser. **No Node imports**
  in either: they must stay importable by Vite as well as tsx.

**Frontend**
- **`src/App.tsx`** — Root component (~650 lines): all session/transcript/notes/summary/export state,
  hook composition, dialog wiring.
- **`src/hooks/useAudioPlayback.ts`** — 24 kHz output AudioContext, PCM scheduling; mute lives in a
  ref (avoids a stale-closure bug when read from socket handlers).
- **`src/hooks/useAudioCapture.ts`** — Mic/tab-audio capture, ScriptProcessorNode pipeline.
- **`src/hooks/useTranslationSession.ts`** — WebSocket lifecycle; `cbRef.current = callbacks` keeps
  handlers always-fresh. `disconnect(silent)` suppresses the close callbacks.
- **`src/lib/`** — Pure functions: `pcm.ts`, `time.ts`, `export.ts`, `pdf.ts`, `constants.ts`.
  `export.ts`, `pcm.ts`, `time.ts` are unit-tested (`src/lib/__tests__/`).
- **`src/i18n.ts`** — UI string catalogue + `LangContext`. English is the source of truth; the
  Hungarian map is type-forced to have identical keys.
- **`src/themes.ts`** — Light/dark `ThemeConfig` objects holding Tailwind class fragments.
- **`src/components/`** — `Header`, `SettingsPanel`, `TranscriptList`, `TranscriptCard`, `NoteCard`,
  `NotesInput`, `SummaryCard`, `Controls`, `AudioVisualizer`, `ExportDialog`, `ObsidianDialog`,
  `ImportDialog`.
- **`src/types.ts`** — `TranslationPair`, `NoteEntry`, `SummaryEntry`, `LangConfig`,
  `AudioSourceType`, `SessionConfig`.

### Session modes

Two booleans on `SessionProfile` (`src/types.ts`) give three meaningful profiles:

| `translate` | `speak` | Mode | Models |
|---|---|---|---|
| ✓ | ✓ | Interpreter | user-selected Live model, spoken output |
| ✓ | ✗ | Translated transcript | 3.1 Flash Live (silenced) + text model per segment |
| ✗ | — | Plain recording | 3.1 Flash Live (silenced) |

Both are settable only before a session starts (`disabled={isActive}`), and `speak` is forced off when
`translate` is off. **Only `speak` shapes the Live session config** — a translated-transcript session
uses the exact same silent config as a plain recording; the difference is entirely client-side, in
whether each finished segment is sent to `/api/translate-text`.

Silent sessions are pinned to `TRANSCRIPTION_MODEL` via `resolveLiveModel()` in
`shared/languages.ts`, which both the UI lock and the server go through so the rule isn't duplicated.

Design record: `docs/superpowers/specs/2026-08-04-translation-and-speech-toggles-design.md`.

### Session store

Recorded sessions live on disk so a refresh can't lose a meeting:
`data/sessions/<id>/session.json` (root overridable via `SESSIONS_DIR`; `data/` is gitignored).
A directory per session, because the audio recording will land beside its transcript.

- **`shared/session.ts`** — the stored shape plus `serializeSession`/`parseSession`. **All
  (de)serialization goes through here.** `TranslationPair`/`NoteEntry`/`SummaryEntry` hold real
  `Date`s; JSON turns them into strings, and a session revived with string timestamps type-checks
  fine and then breaks `buildTranscriptBlocks` (`.getTime()`) and every export path. Round-tripping
  is unit-tested in `shared/__tests__/session.test.ts` — extend those tests when the shape changes.
- **`server/sessions.ts`** — disk store. Session ids are validated (`isValidSessionId`) and the
  resolved path is confirmed to sit inside the store root before any read/write/delete; ids come from
  HTTP and there is a DELETE endpoint behind them. Writes go to a temp file and rename, so a killed
  autosave can't leave a half-written `session.json`. An unparseable session is skipped in the
  listing with a warning rather than failing the whole library.
- **`src/hooks/useSessionStore.ts`** — listing, load, delete, and the debounced autosave
  (`SESSION_AUTOSAVE_MS`, 3 s). A failed write is kept queued and retried; it never interrupts a
  recording. `pagehide` hands the pending payload to `navigator.sendBeacon`, since a `fetch` during
  unload is routinely cancelled.
- **`src/components/RecordingsDrawer.tsx`** — the library UI, opened from the header, with tag filtering.
- **`src/components/SessionBar.tsx`** — the open recording's name and tags. The name is editable, the
  ✨ button asks `/api/subject` for one based on what was said, and a recording that stops unnamed
  gets named automatically **once** (`autoTitledRef` guards against re-spending calls on resume).
  Tags are normalised through `normalizeTags` (trimmed, case-insensitively de-duplicated) and are
  written into the Obsidian note's frontmatter alongside `meeting`/`livetranslate` — spaces become
  dashes there, since an Obsidian tag cannot contain a space.

Any stored session can be **resumed**. `elapsedMs` records total recorded time, and new segments are
offset by it (`offsetNow()` in `App.tsx`) so subtitle cues stay monotonic instead of restarting at
zero and overlapping. Resuming in a different mode is fine: each pair carries its own languages, and
`TranscriptCard` renders single-column when a pair has no translation.

Deleting a recording also deletes its Obsidian note. That reaches into the user's vault, so
`deleteVaultNote` accepts only the path the app recorded itself, only when it resolves inside the
configured vault, and only when the filename matches the app's own scheme.

"Clear History" **detaches** from the stored session instead of emptying it — clearing the screen
must not wipe what's already in the library.

Design record: `docs/superpowers/specs/2026-08-04-session-store-design.md`.

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

The import action lives in the **recordings drawer's** header, not in `SessionBar` —
bringing something into the library belongs where the library is. An import creates an
ordinary stored session (`translate: false, speak: false`, model pinned to
`TRANSCRIPTION_MODEL`), so the library, summary, corrections, Obsidian save and all
exports work on it unchanged and it stays resumable. There is no server endpoint — the
existing autosave persists it.

**The session's id and date come from the meeting date the user typed, not from "now".**
`newSessionId(baseDate)` builds the id from it (hence the year padding there — a
half-typed year would otherwise mint an id `isValidSessionId` rejects, and every
autosave would 400 behind a small "retrying" chip), and `doObsidianSave` posts it as
`when` so the note is filed under the day the meeting happened.

`TranslationPair.speaker` exists for this: live sessions have no diarization, so it is
optional, and pairs without it render and export exactly as before.

Known limitation: if the meeting was transcribed with the wrong spoken language set in
Teams, the source text is phonetic nonsense ("See ya" for *szia*) and no correction
rule fixes it — the fix is upstream, in the Teams transcription language.

Design record: `docs/superpowers/specs/2026-08-05-transcript-import-design.md`.

### Models and languages

| Model | Special config | Bidirectional |
|---|---|---|
| `models/gemini-3.5-live-translate-preview` | Adds `translationConfig: { targetLanguageCode, echoTargetLanguage }` | no (single fixed output language) |
| `models/gemini-3.1-flash-live-preview` | System instruction only | yes |
| `gpt-realtime-translate` | OpenAI Realtime WS; `session.update` sets `audio.output.language` | no |

`shared/languages.ts` is the single catalogue (27 languages, each with `code` + `en`/`hu` display
names) and owns the per-model capability rules: `allowedSourceCodes()`, `allowedTargetCodes()`,
`supportsBidirectional()`. OpenAI's support is **asymmetric** — it understands Hungarian but cannot
speak it, so the source and target lists differ. `App.handleModelChange` re-clamps the selected pair
through those helpers whenever the model changes, and source/target are always kept distinct.

### Transient provider failures

The text model returns `503 UNAVAILABLE` ("this model is currently experiencing high
demand") often enough to hit a normal meeting — measured, several times an hour on the
flash alias. Two things follow from that, both in `server/providers/textModel.ts`:

- **`runPrompt` retries.** 408/429/500/502/504/503 and dropped connections get four
  attempts with exponential backoff and jitter; anything else (400, 404, a missing key)
  fails immediately, because a retry cannot fix it. Every text-model consumer — the note
  title, the summary, the per-segment translation — goes through `runPrompt`, so none of
  them needs its own retry. **The `@google/genai` SDK does no retries of its own unless
  `httpOptions.retryOptions` is passed**, so without this layer a single blip failed the
  whole request.
- **A retry never fights a quota.** When the provider names its own wait (`RetryInfo`
  in the body, the "Please retry in 46.4s" sentence, or a `Retry-After` header) that wait
  is the only one that can work, so `withRetry` honours it — and when it is longer than
  `maxRetryAfterMs` (8 s) it stops after the first attempt instead of spending the rest of
  the budget on certain failures. Backing off 500 ms into an exhausted per-minute quota
  doesn't just fail, it burns three more requests out of the same empty bucket. The
  "(N attempts)" suffix reports attempts actually made, so it must not be derived from the
  budget. A 429 carrying `insufficient_quota` (OpenAI's spent balance) is marked `permanent`
  and not retried at all — that one is billing, not throttling.
- **Provider errors are unwrapped before they leave the server.** The SDK puts the entire
  JSON error body into `Error.message`, which used to surface in the UI as
  `Could not generate a name: {"error":{"code":503,…}}`. `describeProviderError` reduces
  it to `Gemini 503: This model is currently experiencing high demand… [UNAVAILABLE]`.
  Keep new provider calls going through `httpError`/`describeProviderError`.

The automatic naming of a stopped recording clears `autoTitledRef` again when the attempt
failed (`App.tsx`), so one outage doesn't leave the recording permanently unnamed — the
guard is only there to stop a re-render firing a second concurrent call.

### Corrections (speech-recognition fixes)

`shared/corrections.ts` holds the rules ("what was written" → "what was meant") and
both mechanisms, which do **different** jobs — neither alone is enough:

- **Substitution** (`applyCorrections`) is the only thing that fixes the transcript.
  Applied to every finished segment and retroactively across the open recording.
- **The glossary** (`buildGlossary`) is the only thing that improves the model's own
  output. It goes into the Live system instruction and the `/api/translate-text`
  prompt. Because a Live session's instruction is fixed at open, rules added
  mid-recording only reach the Live model on the next start; the text-translation
  prompt is built per segment, so there they apply immediately.

Rules are per-recording by default (stored on the session) and can be marked
`global`, which persists them to `data/corrections.json` via `/api/corrections`.

Matching notes: boundaries use Unicode lookarounds, **not** `\b` — JavaScript's `\b`
is ASCII-only, so `\bmély\b` treats "é" as a boundary and fires inside "mélyebb".
Longer phrases are applied first (`sortRules`) so "marad mély" wins over "mély".

**Known limitation, measured:** the ASR is not deterministic. The same synthesized
audio was transcribed "coals", "coal's" and "code's" across three runs, so an exact
substitution rule catches only the variant it was taught. Teaching each variant is
the intended workaround; fuzzy matching was deliberately not added, since it would
rewrite legitimate words.

### Measured API constraints

Verified against the live API — don't re-derive these from the docs, and don't "fix" the code by
undoing them:

- **The Live models only accept `responseModalities: [AUDIO]`.** Asking 3.1 Flash Live for `TEXT` is
  rejected at session open ("The requested combination of response modalities (TEXT) is not supported
  by the model"). So spoken output **cannot** be turned off by configuration.
- **A "stay silent" system instruction does work.** Under it, 3.1 Flash Live emitted 0 audio chunks
  for a 9 s utterance while `inputAudioTranscription` still returned a complete, correct transcript.
  That is where the token saving in the silent modes comes from. It is a soft guarantee though — some
  runs still emitted a handful of chunks, so `gemini.ts` also drops audio parts when `speak` is false.
- **`gemini-3.5-live-translate-preview` ignores text input entirely** (speech→speech only), which is
  why it cannot serve as the transcription model.
- **A Live session dies every 7-10 minutes on a long meeting, and `contextWindowCompression` does
  not prevent it.** Observed in `.run/live-translate.log` while recording a 43-minute meeting:
  `The input token count exceeds the maximum number of tokens allowed 8192` (the context accumulates
  until the window overflows) and `...client failed to close the connection after receiving a GoAway
  signal once the session duration expired`. `contextWindowCompression: { triggerTokens: "6144",
  slidingWindow: {} }` is set in `gemini.ts` and *is* accepted at session open — but the 8192 death
  was still logged after it was enabled, so it is not sufficient on its own. Don't "fix" this by
  tuning the trigger; the working mechanism is **session rotation** (below).
- **`inputAudioTranscription: {}` means automatic language detection, and it drifts.** The SDK
  documents `languageCodes` as: "If omitted or empty, defaults to automatic language detection."
  With it empty, an English meeting was observed switching mid-recording to being transcribed as
  Spanish. The session profile already knows what is being spoken, so `gemini.ts` always passes
  `languageCodes` (`spokenLanguageCodes`: the source language, plus the target only when the session
  is bidirectional and both are genuinely spoken). Verified accepted at session open for both a
  one-language and a two-language hint. Never pass an empty list — that is the same as omitting it.
- **`usageMetadata.totalTokenCount` and `goAway` arrive on messages with no `serverContent`.**
  `gemini.ts`'s `onmessage` returns early when `serverContent` is missing, so both must be handled
  *before* that guard — otherwise the early return swallows exactly the warnings that say the
  session is about to die.
- **A glossary in the system instruction does not reach the ASR.** With "Kohl's" in a
  forceful glossary, `inputAudioTranscription` still returned "coals" — three
  variations of the instruction changed nothing. The same glossary *did* make the
  model's own translation say "Kohl's". This is why corrections need substitution for
  the transcript and the glossary for the translation.
  **Untried but promising:** `AudioTranscriptionConfig.customVocabulary` is an ASR-level
  phrase bias ("biases the ASR model to improve recognition of these specific terms"),
  which is a different channel from the system instruction. Feeding the corrections'
  `meant` values into it is the obvious next attempt at fixing the transcript at the
  source instead of by substitution afterwards. Measure it before trusting it.
- **There is no live, word-by-word transcript to be had from this model.**
  `LiveServerContent.interimInputTranscription` is documented as "low latency transcription
  updated while the user is speaking" — exactly what a live subtitle needs. Measured on
  `gemini-3.1-flash-live-preview` over 104 seconds of continuous speech: **0 interim messages**
  and **5 finals**, arriving 16-20 s apart, each carrying a whole utterance at once. Earlier
  relay statistics over 633 five-second windows agree: median 0 deltas per window, 62% of
  windows empty, and ~70 characters per delta when one arrives. **The client cannot show words
  as they are spoken because the words do not arrive as they are spoken**, and no segmentation
  setting changes that — `src/lib/segmentation.ts` only decides where an already-delivered block
  is cut. Seeing the transcript appear live needs a streaming ASR that emits interim hypotheses
  (Deepgram, Google Cloud STT v2, AssemblyAI, Azure Speech); `realtimeInputConfig.automaticActivityDetection`
  (`silenceDurationMs`, `endOfSpeechSensitivity`) can only make the *blocks* arrive sooner, never
  make them word-by-word. Untried at the time of writing.
- **`AudioTranscriptionConfig.diarization` is accepted and then ignored.** The SDK types promise
  both the config flag (`diarization?: boolean`) and the result field
  (`Transcription.speakerLabel`, "e.g. spk_1, spk_2"). Measured on
  `gemini-3.1-flash-live-preview` with two speakers in the audio: the session opened with no
  error and **every** transcription chunk came back with `speakerLabel` undefined — as did
  `finished` and `languageCode`. This Live endpoint populates **only `text`** in `Transcription`.
  So speaker-aware card splitting cannot be built on the Live API; a batch STT with diarization
  or an acoustic speaker-change detector would be needed instead. Don't re-derive this from the
  SDK types — they describe a shape the model does not fill in.
- **Free-tier Gemini keys only have quota for the `*-latest` aliases.** Pinned ids
  (`gemini-2.0-flash`, `gemini-2.5-pro`, `gemini-3-pro-preview`, …) return HTTP 429 with `limit: 0`.
  `gemini-flash-latest` and `gemini-flash-lite-latest` work.
- **On the free tier the scarce resource is *requests*, not tokens.** `gemini-flash-latest`
  currently resolves to `gemini-3.7-flash`, and its
  `generativelanguage.googleapis.com/generate_content_free_tier_requests` quota was observed
  refusing at both `limit: 5` and `limit: 20` (two windows, minute and day, same metric name)
  with a ~41–46 s `retryDelay`. That is why `/api/summarize` asks for both summaries **and**
  the title in one request rather than three parallel ones — see `generateSummaryBundle`.
  When adding an AI feature, count the requests it costs per user action.

### Type-checking blind spot

`npm run lint` (plain `tsc --noEmit`) does **not** flag a `useState` binding that shadows an imported
function of the same name in a `.tsx` file — the shadowed call type-checks clean and then throws at
runtime ("X is not a function", blank page). It was hit once already, by naming session state
`translate` while `i18n`'s `translate` was imported (now aliased to `translateString` in `App.tsx`).
After touching `App.tsx`, load the page and check the console; a green lint is not sufficient.

### Non-obvious behaviours

- **Pause-based segmentation.** Gemini's live-translate preview streams continuously without firing
  `turnComplete` per sentence, so `App.registerActivity` arms a `SEGMENT_SILENCE_MS` (1200 ms) timer
  on every text chunk and closes the segment into its own transcript card / subtitle cue. `finalizeRef`
  keeps that timer from firing a stale finalizer. OpenAI has no turn signal at all — the server fakes
  one after 1500 ms of silence (`scheduleTurnComplete`).
  **Sentence-boundary splitting was built and reverted** (`docs/superpowers/specs/2026-09-15-sentence-boundary-segmentation-design.md`,
  commits `dd29530` / `2be3922`). The rule itself worked — measured 38% of cards ended mid-clause
  before it — but it made the app feel worse in use: waiting for a sentence boundary produces larger,
  blockier cards, and the transcript does not arrive continuously enough for that to be worth it (see
  the interim-transcription constraint below). Read that measurement before rebuilding this.
- **The server rotates the Live session before the API can kill it.** `rotateGemini` (server.ts)
  opens a replacement session and only then closes the old one, so client audio keeps flowing into
  the old session until the swap and the client is never told anything happened. Triggers:
  `usageMetadata.totalTokenCount` reaching `ROTATE_AT_TOKENS` (5500, under the 8192 ceiling), a
  `goAway`, or `ROTATE_INTERVAL_MS` (5 min) as a backstop for models that report no usage — and
  that backstop only fires when it has work to do (`shouldRotateOnSchedule`): a model that reports
  usage is already covered by the token trigger, so replacing a session sitting at 1200 tokens
  spends a Live-session quota slot for nothing. Measured in `.run/live-translate.log`: 188 sessions
  opened for 95 recordings, roughly double, and that quota is what answers `Resource has been
  exhausted` when a meeting genuinely needs a new session mid-recording. A
  generation counter (`server/rotation.ts`) makes a rotated-away session's callbacks fall silent, so
  its own close is not reported to the client as a lost connection. **This is what actually fixes the
  7-10 minute death**, and it is invisible where a client-side reconnect costs a visible gap.
  **The retiring session keeps relaying transcript for `ROTATE_FLUSH_MS` (1.5 s) after the swap.**
  Its ASR lags the audio it was already given, so at the swap it is still holding the tail of the
  current utterance — and the replacement can never produce that text, having never heard that audio.
  Closing it at the swap (and silencing it from the moment the replacement *started* opening, which
  is what `++geminiGen` before the `await` did) put a hole in the transcript at every rotation:
  invisible to a speaker who happened to pause, a lost phrase to a fast, continuous one. Hence the
  two guards in `RotationState`: `isLive` for control events (close, usage, GoAway, turnComplete) and
  `isRelaying`, which also covers the session on its way out, for transcript text only. The retiring
  session is sent `sendRealtimeInput({ audioStreamEnd: true })` so it flushes at once instead of
  waiting out the grace period. Don't collapse the two guards back into one.
  A session that closes on its own also **nulls `geminiSession`** — a closed Live session swallows
  everything sent to it, so keeping the handle turned a dead session into a silently frozen
  transcript while the client kept streaming audio at it.
  Verified end-to-end with `LIVE_ROTATE_MS=8000` and a synthetic audio client: three rotations in
  30 s while the client saw only `["server-connected","connected"]` — no `disconnected` at all.
- **A Live session stops transcribing long before it admits it is dead.** Measured with
  `LIVE_DEBUG=1` on a real recording: for **107 seconds** the client sent a perfectly steady
  39 chunks / 208 KB every 5 s while Gemini returned **zero** transcription deltas — and only then
  did the API close it with `Resource has been exhausted (e.g. check quota).` Everything spoken in
  that window was lost, and nothing noticed: the socket was open, audio was flowing, `onClose` had
  not fired. **One such stall loses more than every rotation hole put together**, so this, not the
  rotation, is the main answer to "it skips parts". `StallDetector` (`server/stall.ts`) catches it
  and rotates. **Silence cannot be the signal** — audio chunks keep flowing while nobody speaks, so
  a wall-clock timer would rotate through every pause in a meeting; what is diagnostic is *speech
  going up with nothing coming back*, hence the per-chunk RMS and `SPEECH_RMS` (0.01, measured to
  sit in the gap between speech at -26…-33 dBFS and quiet windows at -43…-50 dBFS). A stall
  rotation gets a longer flush window (`STALL_FLUSH_MS`) than an ordinary one, because a session
  that went quiet may be merely far behind rather than dead, and `audioStreamEnd` makes a lagging
  one dump its backlog. `LIVE_STALL_MS` provokes it in seconds, like `LIVE_ROTATE_MS`.
  **A session that has never produced a single character is judged on a shorter leash**
  (`FIRST_STALL_SPEECH_MS`, 7 s of speech against the ordinary 20): "never worked at all" is a
  far clearer diagnosis than "went quiet mid-sentence". Measured — a recording's very first
  session was dead from birth and cost its first 1:28. A rotation resets that leash, since the
  replacement has proven nothing either.
- **A dropped session reconnects itself, backing off.** An unexpected close *while the capture is
  still running* reconnects the provider session (up to `MAX_SESSION_RECONNECTS`) instead of stopping
  the recording, reusing the live stream. The wait comes from `reconnectDelayMs` (`src/lib/reconnect.ts`):
  exponential from `SESSION_RECONNECT_DELAY_MS` with ±15% jitter, and a floor of
  `SESSION_RECONNECT_QUOTA_DELAY_MS` when the close reason is a quota refusal (`isQuotaRefusal`
  matches Gemini's literal `Resource has been exhausted (e.g. check quota).`). **A fixed 800 ms spent
  the whole budget in four seconds**, which is the one thing that cannot work against a quota — the
  bucket refills on a clock, so all five attempts failed and the recording stopped. This is the
  `textModel.ts` rule ("a retry never fights a quota") applied to the Live path; the close reason now
  reaches `App.onStatus` as its second argument, so don't drop it again. The discriminator is `captureActiveRef`: `stopTranslating` clears it
  synchronously before disconnecting, so anything still marked active in the `disconnected` callback
  died on its own. Stopping instead means the user has to notice the stop, rewind the shared tab and
  start over — which is how the session-limit bug above was first reported, four times in one meeting.
- **Mid-session language swap.** Swapping languages while live calls `restartSessionWithLangs`, which
  reconnects the provider session via `disconnect(true)` (silent) so the old socket's `onclose`
  doesn't trigger a full stop that races the new connection. `captureActiveRef` lets the reconnect
  reuse the live mic/tab stream instead of re-prompting for permission.
- **Obsidian saves update in place.** `obsidianSavedPath` is sent back as `existingPath`, so repeat
  saves overwrite this session's note (date/time preserved from the filename) rather than creating
  dated variants. `saveToObsidian` only accepts an `existingPath` that matches the note naming scheme
  *and* resolves inside the vault. Clear History resets the path and title.
- **Error strings crossing the boundary.** Client-side errors are passed as i18n keys prefixed
  `error.`; server errors arrive as ready-made (Hungarian) strings. `App.onError` branches on that
  prefix — keep the convention when adding errors.
- **Export pipeline.** `buildTranscriptBlocks()` builds one chronological document model (pairs with
  their attached notes, plus interleaved standalone notes and summaries); the txt / md / pdf renderers
  all consume it, so formats stay in sync. Add a format by adding a renderer, not a second model.
- **PDF fonts.** `src/lib/pdf.ts` fetches DejaVuSans from `/public/fonts` at runtime — jsPDF's builtin
  Helvetica cannot render Hungarian `ő`/`ű`. Emoji are omitted from PDF output.
- **The transcript follows the conversation only while the user is at the bottom.**
  `useStickToBottom` (used by `TranscriptList`, which owns the scroll container) keeps the view
  pinned to the live edge until the user scrolls up — then it stays put however much text keeps
  arriving, and a "Go to current" button appears to get back. Scrolling up mid-meeting to fix a
  word or attach a note is the whole point; an unconditional `scrollIntoView` on every chunk made
  that impossible. The follow-scroll is deliberately **instant**, not smooth: a smooth animation is
  still running when the next chunk lands, so scrolling away would fight it back down.

### Styling

Tailwind v4 via `@tailwindcss/vite` (no `tailwind.config.js`). `src/index.css` defines semantic CSS
variables (`--bg-base`, `--text-primary`, `--accent-primary`, …) under `:root` / `[data-theme="dark"]`;
`App` stamps `data-theme` on the root div. Prefer these variables over hardcoded colors. `DESIGN.md`
holds the full design-token source (Material-style color roles + typography scale).

### Audio pipeline details

- **Input**: `getUserMedia` (mic) or `getDisplayMedia` (tab audio — video tracks are stopped
  immediately, only the audio track is kept; a stream with no audio track throws a Hungarian
  "share system/tab audio" hint). Captured at 16 kHz, chunked by `ScriptProcessorNode` (buffer 2048),
  converted to 16-bit PCM, base64-encoded, sent over the WebSocket.
- **Output**: Incoming 24 kHz PCM chunks are decoded and scheduled via `AudioBufferSourceNode` with a
  50 ms slide buffer (`nextStartTimeRef`) to prevent gaps. Active sources are tracked in
  `activeSourcesRef` for clean interruption. Sample rates and buffer sizes live in `src/lib/constants.ts`.
- **The two input paths are not symmetric.** `getUserMedia` honours the 16 kHz `sampleRate`
  constraint, so the mic path feeds the 16 kHz `AudioContext` natively. `getDisplayMedia` ignores it
  and hands out 48 kHz, so tab audio is **resampled inside the WebAudio graph** — an extra step the
  mic path doesn't have, and the first thing to check when text arrives late from a shared tab.
- **Capture diagnostic.** `localStorage.audioDebug = "1"` makes `useAudioCapture` log the
  context/track rates once and then, every 5 s, the capture drift (`captured` audio vs. `wall`
  clock) plus the input level (`rms` / `peak` / `floor` / `quiet` share of frames).
  **Measured on a real tab-share session: drift holds at ≈ -1.6 ms/s with occasional resyncs**
  — a few tenths of a second over minutes, i.e. ordinary clock skew. So the resampled 48→16 kHz
  path is *not* the source of a perceptible delay from a shared tab; don't go looking there again.
  The level stats are for the next question — whether the model's VAD gets a quiet enough signal to
  detect start- and end-of-speech in time. `server/providers/gemini.ts` currently sets **no**
  `realtimeInputConfig.automaticActivityDetection`, so VAD timing is entirely on Google's defaults;
  `endOfSpeechSensitivity` and `silenceDurationMs` are the knobs if a pause is being missed.

### Build

`npm run build` runs two steps:
1. `vite build` — bundles the React frontend into `dist/` (HTML + assets)
2. `esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs`
   — bundles the server as a single CJS file, keeping `node_modules` external

The `@/` path alias (tsconfig + vite) resolves to the **repo root**, so browser code imports shared
modules as `@/shared/languages`.
