# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (starts Express + Vite middleware on port 3000)
npm run dev

# Type-check only (no ESLint configured)
npm run lint

# Production build: Vite bundles the frontend, esbuild bundles server.ts → dist/server.cjs
npm run build

# Run production build
npm start

# Daemon helpers (build + background process, PID written to .run/)
./start.sh
./stop.sh
```

## Environment

Copy `.env.example` to `.env` and set `GEMINI_API_KEY`. The server checks for it at startup and blocks Gemini sessions if missing.

## Architecture

This is a **real-time speech translation app** (Hungarian ↔ English) using Google's Gemini Live API. The core design keeps the API key server-side: the browser never touches Gemini directly.

### Data flow

```
Mic / Tab Audio
  → Web Audio API (16 kHz AudioContext)
  → ScriptProcessorNode → Float32 → Int16 PCM → base64
  → WebSocket (/api/live-ws) [client → server]
  → server.ts proxies to Gemini Live session (sendRealtimeInput)
  → Gemini callbacks → server relays typed JSON messages back to client
  → client decodes base64 PCM chunks (24 kHz) via Web Audio API → speakers
```

### WebSocket message protocol (client ↔ server)

**Client → server:**
- `{ type: "init", model, mode }` — opens a new Gemini Live session with the chosen model/mode
- `{ type: "audio", audio: <base64 PCM 16kHz> }` — streams captured audio
- `{ type: "interrupt" }` — signals manual stop

**Server → client:**
- `{ type: "status", status: "server-connected" | "connected" | "disconnected" }` — lifecycle events
- `{ type: "audio", audio: <base64 PCM 24kHz> }` — translated speech
- `{ type: "translation", text }` — text of the translation (streamed)
- `{ type: "inputTranscription", transcript }` — what the user said
- `{ type: "interrupted" }` — Gemini interrupted the current turn
- `{ type: "turnComplete" }` — a full exchange is done; client finalizes a `TranslationPair`
- `{ type: "error", error }` — error message

### Key files

**Server-side**
- **`server.ts`** — Express + WebSocket entry point. One AI session per client connection. Delegates to providers; in dev mode mounts Vite as middleware.
- **`server/instructions.ts`** — Maps (model, mode) → `systemInstruction` string + BCP-47 `targetLang` code.
- **`server/providers/gemini.ts`** — `createGeminiSession()`: Gemini Live SDK wiring, typed callbacks, no `any`.
- **`server/providers/openai.ts`** — `createOpenAISession()`: OpenAI Realtime WebSocket relay (currently disabled in UI).
- **`shared/protocol.ts`** — Discriminated-union WS types (`ClientMsg`, `ServerMsg`, `parseClientMsg`). No Node imports — safe for both Vite and tsx.

**Frontend**
- **`src/App.tsx`** — Root component: state, hook composition, layout skeleton (~220 lines).
- **`src/hooks/useAudioPlayback.ts`** — 24 kHz output AudioContext, PCM scheduling, mute via ref (avoids stale-closure bug).
- **`src/hooks/useAudioCapture.ts`** — Mic/tab-audio capture, ScriptProcessorNode pipeline.
- **`src/hooks/useTranslationSession.ts`** — WebSocket lifecycle; `cbRef.current = callbacks` keeps handlers always-fresh.
- **`src/lib/`** — Pure functions: `pcm.ts`, `time.ts`, `export.ts`, `constants.ts`. All unit-tested (`src/lib/__tests__/`).
- **`src/components/`** — UI: `Header`, `SettingsPanel`, `TranscriptList`, `TranscriptCard`, `Controls`, `AudioVisualizer`.
- **`src/types.ts`** — Shared types: `TranslationPair`, `TranslationMode`, `AudioSourceType`, `SessionConfig`.

### Models and modes

Two Gemini models are supported, with different `liveConfig` structures:

| Model | Special config |
|---|---|
| `models/gemini-3.5-live-translate-preview` | Adds `translationConfig: { targetLanguageCode, echoTargetLanguage }` |
| `models/gemini-3.1-flash-live-preview` | System instruction only (no `translationConfig`) |

Three translation modes: `bidirectional`, `hu-to-en`, `en-to-hu`. Instructions are built in `server/instructions.ts`.

### Audio pipeline details

- **Input**: `getUserMedia` (mic) or `getDisplayMedia` (tab audio; video tracks are immediately stopped, only the audio track is kept). Captured at 16 kHz, downsampled via `ScriptProcessorNode` (buffer size 2048), converted to 16-bit PCM, base64-encoded, sent over WebSocket.
- **Output**: Incoming 24 kHz PCM chunks are decoded and scheduled via `AudioBufferSourceNode` with a 50 ms slide buffer (`nextStartTimeRef`) to prevent gaps. All active sources are tracked in `activeSourcesRef` for clean interruption.

### Build

`npm run build` runs two steps:
1. `vite build` — bundles the React frontend into `dist/` (HTML + assets)
2. `esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs` — bundles the server as a single CJS file, keeping `node_modules` external
