<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# LiveTranslate — real-time speech translation (Gemini + OpenAI)

A locally-runnable, real-time **speech translation** app. The browser streams microphone (or tab) audio to a Node.js server over a WebSocket; the server relays it to Google's **Gemini Live API** or OpenAI's **Realtime Translation API** and streams the translated speech and text transcripts back.

View the original app in AI Studio: https://ai.studio/apps/23dff49b-3fa2-471a-998e-83625c050410

## Features

- **Live speech translation** with spoken output and incremental text transcripts.
- **Any language pair** (model-permitting): pick a source and target language, swap them, or enable bidirectional mode. Default is Hungarian → English.
- **Pause-based segmentation** — a short silence closes the current segment into its own card, so long monologues become properly timed, real-time subtitle blocks.
- **Bilingual UI (i18n)** — English by default, switchable to Hungarian; the choice is saved to `localStorage`.
- **Light / dark theme** toggle (persisted).
- **Audio meters** (input/output waveforms) — hidden by default, toggleable from the header (persisted).
- **Notes** — jot chat-style notes during a session, either standalone in the flow or attached to a specific translation block; notes are editable (Ctrl/⌘+Enter to save, Enter inserts a newline).
- **AI summary** — summarize the conversation; the result appears in the flow in **both English and Hungarian**, each separately downloadable. The summary provider is configurable (Gemini / OpenAI / Ollama).
- **Export** — a download dialog lets you choose the format (**TXT / Markdown / PDF**) and exactly what to include (timestamps, original/translated text, notes, each summary language). Plus a bilingual **SRT** subtitle file.

## Run Locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and configure your API key(s) (see [Environment](#environment)).
3. Run the app:
   ```bash
   npm run dev
   ```
   The server listens on port `3000` by default; override with `PORT` (e.g. `PORT=3457 npm run dev`).

Production helpers: `./start.sh` builds and runs the server in the background (PID in `.run/`, logs in `.run/live-translate.log`); `./stop.sh` stops it. Health check: `GET /api/health`.

## Environment

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Required for the Gemini Live models. |
| `OPENAI_API_KEY` | Required for the OpenAI Realtime model. |
| `PORT` | HTTP/WS port (default `3000`). |
| `SUMMARY_PROVIDER` | AI-summary provider: `gemini` (default), `openai`, or `ollama`. |
| `SUMMARY_MODEL` | Summary model (defaults: gemini → `gemini-2.0-flash`, openai → `gpt-4o-mini`, ollama → `llama3.1`). |
| `SUMMARY_API_KEY` | Key for the summary provider (falls back to `GEMINI_API_KEY` / `OPENAI_API_KEY`; not needed for Ollama). |
| `SUMMARY_BASE_URL` | Override the summary endpoint (OpenAI-compatible base or Ollama host). |

The summary can therefore run on a different provider/key/model than the live translation.

## Models & language support

| Model | Provider | Languages | Notes |
|---|---|---|---|
| `gemini-3.5-live-translate-preview` | Google | Full catalogue (~27) | Dedicated speech-translation model; one-directional (target set via `translationConfig`). |
| `gemini-3.1-flash-live-preview` | Google | Full catalogue (~27) | General live model via system instruction; **the only model that supports bidirectional mode**. |
| `gpt-realtime-translate` | OpenAI | Input: 14 (incl. Hungarian) · Output: 13 | Requires `OPENAI_API_KEY`. Asymmetric: understands Hungarian as input but **cannot speak it**, so Hungarian is selectable only as the source. No bidirectional mode. |

The language catalogue and per-model allow-lists live in `shared/languages.ts`.

## Directory structure

```
src/
  App.tsx              Root component — state, hook wiring, layout skeleton
  i18n.ts              UI string catalogue (EN/HU) + LangContext / useLang
  types.ts             Shared frontend types (TranslationPair, NoteEntry, SummaryEntry, LangConfig, …)
  themes.ts            Theme tokens — light / dark; teal accent for both
  components/          UI components
    Header.tsx           Logo, language toggle, audio-meters toggle, light/dark toggle
    SettingsPanel.tsx    Model picker, source/target language selects + swap, bidirectional toggle, audio source
    TranscriptList.tsx   Scrollable timeline (pairs + notes + summaries) + live-stream block
    TranscriptCard.tsx   Single completed translation card + attached notes
    NoteCard.tsx         Editable note (chat bubble / attached variants)
    NotesInput.tsx       Bottom chat-style note input
    SummaryCard.tsx      AI summary block (EN + HU, per-language download)
    Controls.tsx         Start/stop, mute, AI summary, SRT/transcript export, clear
    ExportDialog.tsx     Transcript export modal — format + content checkboxes
    AudioVisualizer.tsx  Canvas waveform analyser
  hooks/               Custom React hooks
    useAudioPlayback.ts  24 kHz output AudioContext, PCM scheduling, mute-via-ref
    useAudioCapture.ts   Mic / tab-audio capture, ScriptProcessorNode pipeline
    useTranslationSession.ts  WebSocket lifecycle, cbRef pattern for fresh callbacks
  lib/                 Pure utility functions (unit-tested)
    pcm.ts             Float32↔Int16 PCM conversion, base64 helpers
    time.ts            formatClock / formatSrtTime
    export.ts          Transcript block model + txt / markdown renderers + SRT
    pdf.ts             Styled, Unicode-correct PDF export (jsPDF + DejaVu font)
    constants.ts       SAMPLE_RATE values, buffer sizes, SEGMENT_SILENCE_MS
    __tests__/         Vitest unit tests

server/
  instructions.ts      model + language config → systemInstruction + targetLang
  providers/
    gemini.ts          createGeminiSession() — Gemini Live relay, typed SDK callbacks
    openai.ts          createOpenAISession() — OpenAI Realtime relay
    summary.ts         generateSummary() — configurable Gemini / OpenAI / Ollama summary

shared/
  protocol.ts          Discriminated-union WS types (ClientMsg, ServerMsg, parseClientMsg)
  languages.ts         Language catalogue + per-model allow-lists + helpers

public/
  fonts/               DejaVuSans (normal + bold) — embedded into PDF exports
```

## Transcript, notes & export

The conversation is collected sentence-by-sentence on the page as you speak, showing both the original and the translated text with a relative timestamp (⏱ M:SS from session start). Notes and AI summaries join the same chronological timeline.

Once there is content, the **Download Transcript** button opens an export dialog where you choose:

- **Format** — `TXT`, `Markdown` (headings, bold labels, `>` blockquote notes), or `PDF` (styled, paginated, Unicode-correct via an embedded DejaVu font).
- **Content** — timestamps, original (source) text, translated text, notes, and each AI-summary language. Notes / summary options are disabled when no such blocks exist.

A bilingual **SRT** subtitle file (original + translation per cue, non-overlapping timings) is also available.

### OpenAI Realtime Translation protocol

The server connects to `wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate` and sends a `session.update` configuring `audio.input.transcription` (`gpt-realtime-whisper`), `audio.input.noise_reduction` and `audio.output.language` (the chosen target). Audio is streamed continuously as base64 PCM16 via `session.input_audio_buffer.append`. There is no turn lifecycle: translated audio (`session.output_audio.delta`), translated text (`session.output_transcript.delta`) and the source transcript (`session.input_transcript.delta`) all arrive incrementally in each event's `delta` field.

## Scripts

```bash
npm run dev     # Express + Vite middleware on :3000
npm run lint    # tsc --noEmit (type-check only)
npm test        # Vitest unit tests
npm run build   # Vite frontend bundle + esbuild server → dist/server.cjs
npm start       # run the production build
```
