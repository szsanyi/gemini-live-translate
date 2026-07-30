import { WebSocket } from "ws";

export interface OpenAICallbacks {
  onConnected: () => void;
  onAudio: (base64: string) => void;
  onTranslation: (text: string) => void;
  onInputTranscription: (transcript: string) => void;
  onTurnComplete: () => void;
  onError: (error: string) => void;
  onClose: () => void;
}

/**
 * Opens an OpenAI Realtime Translation WebSocket session.
 * Returns the socket so the caller can forward audio and close it.
 *
 * `targetLang` is a BCP-47 code; the model's language coverage is narrower than
 * Gemini's (see OPENAI_OUTPUT_LANG_CODES), so the caller restricts the choices.
 */
export function createOpenAISession(
  apiKey: string,
  targetLang: string,
  callbacks: OpenAICallbacks,
  scheduleTurnComplete: () => void,
): WebSocket {
  const ws = new WebSocket(
    "wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate",
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );

  ws.on("open", () => {
    console.log("🟢 OpenAI Realtime Translation session opened.");
    ws.send(JSON.stringify({
      type: "session.update",
      session: {
        audio: {
          input: {
            transcription: { model: "gpt-realtime-whisper" },
            noise_reduction: { type: "near_field" },
          },
          output: { language: targetLang },
        },
      },
    }));
    callbacks.onConnected();
  });

  ws.on("message", (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown> & {
        type: string;
        delta?: string;
        error?: { message?: string };
      };

      if (msg.type === "session.output_audio.delta" && msg.delta) {
        callbacks.onAudio(msg.delta);
        scheduleTurnComplete();
      }
      if (msg.type === "session.output_transcript.delta" && msg.delta) {
        callbacks.onTranslation(msg.delta);
        scheduleTurnComplete();
      }
      if (msg.type === "session.input_transcript.delta" && msg.delta) {
        callbacks.onInputTranscription(msg.delta);
      }
      if (msg.type === "session.closed") {
        callbacks.onClose();
      }
      if (msg.type === "error") {
        const errMsg = msg.error?.message ?? JSON.stringify(msg.error) ?? "Ismeretlen OpenAI hiba";
        console.error("🔴 OpenAI error:", errMsg);
        callbacks.onError(`OpenAI: ${errMsg}`);
      }
    } catch (e) {
      console.error("OpenAI message parse error:", e);
    }
  });

  ws.on("error", (err: Error) => {
    console.error("🔴 OpenAI WebSocket error:", err.message);
    callbacks.onError(`OpenAI kapcsolati hiba: ${err.message}`);
  });

  ws.on("close", () => {
    console.log("⚪ OpenAI session closed.");
    callbacks.onClose();
  });

  return ws;
}
