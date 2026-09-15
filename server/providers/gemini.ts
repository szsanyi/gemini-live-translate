import {
  GoogleGenAI,
  Modality,
  type Session,
  type LiveServerMessage,
  type LiveConnectConfig,
} from "@google/genai";
import type { SessionProfile } from "../../src/types";
import { buildInstruction } from "../instructions.ts";

export interface GeminiCallbacks {
  onConnected: () => void;
  onAudio: (base64: string) => void;
  onTranslation: (text: string) => void;
  onInputTranscription: (transcript: string) => void;
  onInterrupted: () => void;
  onTurnComplete: () => void;
  onError: (error: string) => void;
  onClose: (reason?: string) => void;
  /**
   * Running token total of this session's context, as the API reports it. The Live
   * session dies outright once it exceeds the model's input limit, so the caller uses
   * this to replace the session before that happens.
   */
  onUsage?: (totalTokens: number) => void;
  /** The API announced it is about to terminate this session. */
  onGoAway?: (timeLeftMs?: number) => void;
}

/**
 * The language(s) the microphone/tab will actually contain, as BCP-47 tags for the
 * ASR's `languageCodes` hint.
 *
 * This must be set. With `inputAudioTranscription: {}` the API documents a fallback to
 * *automatic language detection*, and detection was observed flipping mid-recording —
 * an English meeting suddenly came back transcribed as Spanish. The UI already knows
 * which language is being spoken, so guessing is never necessary.
 *
 * A bidirectional session genuinely has two spoken languages; a one-way session has
 * only the source (the target is what the model *outputs*, not what it hears).
 */
export function spokenLanguageCodes(lang: SessionProfile): string[] {
  const codes = lang.bidirectional ? [lang.sourceLang, lang.targetLang] : [lang.sourceLang];
  return [...new Set(codes.filter(Boolean))];
}

/** "5s" / "1.5s" → milliseconds. Protobuf durations arrive as strings. */
export function parseDurationMs(value?: string): number | undefined {
  if (!value) return undefined;
  const seconds = Number.parseFloat(value);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined;
}

/**
 * Opens a Gemini Live session and wires the SDK callbacks to our typed events.
 * Returns the Session so the caller can send audio and close it.
 */
export async function createGeminiSession(
  model: string,
  lang: SessionProfile,
  apiKey: string,
  callbacks: GeminiCallbacks,
  corrections: Array<{ heard: string; meant: string }> = [],
): Promise<Session> {
  const { systemInstruction, targetLang, speak } = buildInstruction(model, lang, corrections);

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  // AUDIO is the only response modality these models accept — asking for TEXT is
  // rejected at session open — so a silent session is achieved by instruction
  // (see buildInstruction) rather than by configuration.
  const liveConfig: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    // Never `{}` here — that is the documented switch into automatic language
    // detection, which drifts mid-recording (see spokenLanguageCodes).
    // No `diarization: true` here on purpose — it is accepted and then ignored by
    // this model. See "Measured API constraints" in CLAUDE.md.
    inputAudioTranscription: { languageCodes: spokenLanguageCodes(lang) },
    systemInstruction,
    // Without this a long meeting dies twice over, both seen in the server log:
    //   "The input token count exceeds the maximum number of tokens allowed 8192"
    //     — the session accumulates every turn until the window overflows, and
    //   "...client failed to close the connection after receiving a GoAway signal
    //    once the session duration expired"
    //     — the Live API caps how long one session may live.
    // Sliding-window compression fixes both: old turns are dropped instead of
    // overflowing, and enabling compression is what lifts the session-duration cap.
    // Interpreting loses nothing by forgetting old turns — each utterance stands alone.
    // The trigger sits below the 8192 ceiling so compression runs *before* the hard
    // limit rather than at it; `targetTokens` defaults to half the trigger.
    contextWindowCompression: {
      triggerTokens: "6144",
      slidingWindow: {},
    },
  };

  if (speak) {
    // Only meaningful when the model talks: this is how the translated text is
    // obtained in interpreter mode.
    liveConfig.outputAudioTranscription = {};
  }

  if (speak && model === "models/gemini-3.5-live-translate-preview") {
    liveConfig.translationConfig = {
      targetLanguageCode: targetLang,
      echoTargetLanguage: false,
    };
  }

  return ai.live.connect({
    model,
    config: liveConfig,
    callbacks: {
      onopen: () => {
        console.log("🟢 Gemini Live session opened.");
        callbacks.onConnected();
      },

      onmessage: (msg: LiveServerMessage) => {
        // These two arrive on messages that carry no serverContent, so they must be
        // handled before the guard below — otherwise the early return swallows exactly
        // the warnings that say the session is about to die.
        const total = msg.usageMetadata?.totalTokenCount;
        if (typeof total === "number") callbacks.onUsage?.(total);
        if (msg.goAway) callbacks.onGoAway?.(parseDurationMs(msg.goAway.timeLeft));

        const sc = msg.serverContent;
        if (!sc) return;

        if (sc.modelTurn?.parts) {
          for (const part of sc.modelTurn.parts) {
            // In a silent session the model is instructed not to speak, which it
            // honours in practice — but an instruction is a soft guarantee, so
            // drop any audio it does emit rather than relaying (and playing) it.
            if (part.inlineData?.data && speak) callbacks.onAudio(part.inlineData.data);
            if (part.text && speak)            callbacks.onTranslation(part.text);
          }
        }

        if (sc.outputTranscription?.text && speak) {
          callbacks.onTranslation(sc.outputTranscription.text);
        }
        // `sc.interimInputTranscription` is deliberately not read — measured empty on
        // this model. See "Measured API constraints" in CLAUDE.md.
        if (sc.inputTranscription?.text) {
          callbacks.onInputTranscription(sc.inputTranscription.text);
        }
        if (sc.interrupted)  callbacks.onInterrupted();
        if (sc.turnComplete) callbacks.onTurnComplete();
      },

      onerror: (err: ErrorEvent) => {
        console.error("🔴 Gemini error:", err);
        callbacks.onError(`Gemini hiba: ${err.message || "Ismeretlen hiba"}`);
      },

      onclose: (event: CloseEvent) => {
        console.log("⚪ Gemini session closed:", event.reason);
        callbacks.onClose(event.reason);
      },
    },
  });
}
