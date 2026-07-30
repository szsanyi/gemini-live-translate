import {
  GoogleGenAI,
  Modality,
  type Session,
  type LiveServerMessage,
  type LiveConnectConfig,
} from "@google/genai";
import type { LangConfig } from "../../src/types";
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
}

/**
 * Opens a Gemini Live session and wires the SDK callbacks to our typed events.
 * Returns the Session so the caller can send audio and close it.
 */
export async function createGeminiSession(
  model: string,
  lang: LangConfig,
  apiKey: string,
  callbacks: GeminiCallbacks,
): Promise<Session> {
  const { systemInstruction, targetLang } = buildInstruction(model, lang);

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  const liveConfig: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    outputAudioTranscription: {},
    inputAudioTranscription: {},
    systemInstruction,
  };

  if (model === "models/gemini-3.5-live-translate-preview") {
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
        const sc = msg.serverContent;
        if (!sc) return;

        if (sc.modelTurn?.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.inlineData?.data) callbacks.onAudio(part.inlineData.data);
            if (part.text)            callbacks.onTranslation(part.text);
          }
        }

        if (sc.outputTranscription?.text) {
          callbacks.onTranslation(sc.outputTranscription.text);
        }
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
