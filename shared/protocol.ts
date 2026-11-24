/**
 * Shared WebSocket message protocol — client (App.tsx) and server (server.ts).
 *
 * Single source of truth for all message shapes. Field-name mismatches here
 * are caught at compile time, not at runtime.
 *
 * No Node.js imports — this file must be importable by Vite (browser) too.
 */

// ─── Client → Server ─────────────────────────────────────────────────────────

export interface InitMsg {
  type: "init";
  model: string;
  /** BCP-47 source language code (auto-detected hint in bidirectional mode). */
  sourceLang: string;
  /** BCP-47 target language code. */
  targetLang: string;
  /** Translate both directions between source and target. */
  bidirectional: boolean;
  /** Translate at all. When false the session only produces a transcript. */
  translate: boolean;
  /** Let the model speak. When false it is instructed to stay silent, which is
   *  where the token saving comes from — the Live models cannot be switched to a
   *  text-only response modality at all. */
  speak: boolean;
  /**
   * Correction rules to put in front of the model as a glossary. Measured: this
   * improves the model's own output (the translation) but has no effect on the
   * input transcription, which the client fixes by substitution instead.
   *
   * The system instruction is fixed once a session opens, so rules added mid-session
   * only reach the model on the next start.
   */
  corrections?: Array<{ heard: string; meant: string }>;
}

export interface AudioInputMsg {
  type: "audio";
  /** Base64-encoded 16 kHz 16-bit PCM */
  audio: string;
}

export interface InterruptMsg {
  type: "interrupt";
}

export type ClientMsg = InitMsg | AudioInputMsg | InterruptMsg;

// ─── Server → Client ─────────────────────────────────────────────────────────

export interface StatusMsg {
  type: "status";
  status: "server-connected" | "connected" | "disconnected";
  reason?: string;
}

export interface AudioOutputMsg {
  type: "audio";
  /** Base64-encoded 24 kHz 16-bit PCM */
  audio: string;
}

export interface TranslationMsg {
  type: "translation";
  /** Incremental text delta of the translated output */
  text: string;
}

export interface InputTranscriptionMsg {
  type: "inputTranscription";
  /** Incremental text delta of the speaker's original speech */
  transcript: string;
}

export interface InterruptedMsg {
  type: "interrupted";
}

export interface TurnCompleteMsg {
  type: "turnComplete";
}

export interface ErrorMsg {
  type: "error";
  error: string;
}

export type ServerMsg =
  | StatusMsg
  | AudioOutputMsg
  | TranslationMsg
  | InputTranscriptionMsg
  | InterruptedMsg
  | TurnCompleteMsg
  | ErrorMsg;

// ─── Parse helper (usable on both sides) ─────────────────────────────────────

/**
 * Parses a raw WebSocket message payload into a typed ClientMsg.
 * Returns null if the payload is not valid JSON or has no `type` field.
 */
export function parseClientMsg(data: string): ClientMsg | null {
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed?.type === "string") return parsed as ClientMsg;
    return null;
  } catch {
    return null;
  }
}
