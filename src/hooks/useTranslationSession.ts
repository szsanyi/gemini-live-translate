import { useRef, useCallback } from "react";
import type { ClientMsg, ServerMsg, StatusMsg } from "@/shared/protocol";
import type { SessionConfig } from "../types";

export interface SessionCallbacks {
  onStatus: (status: StatusMsg["status"], reason?: string) => void;
  onAudio: (base64: string) => void;
  onTranslation: (text: string) => void;
  onInputTranscription: (transcript: string) => void;
  onInterrupted: () => void;
  onTurnComplete: () => void;
  onError: (error: string) => void;
}

/**
 * Manages the WebSocket lifecycle for a translation session.
 *
 * Callbacks are stored in a ref (`cbRef`) so they are always up-to-date
 * without causing the socket handlers to be re-registered on every render.
 * This avoids the stale-closure problems that plagued the original monolithic
 * implementation.
 */
export function useTranslationSession(callbacks: SessionCallbacks) {
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks; // always-current, no stale closure

  const wsRef = useRef<WebSocket | null>(null);

  /** Send a base64-encoded PCM audio chunk to the server. Stable reference. */
  const sendAudio = useCallback((base64: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg: ClientMsg = { type: "audio", audio: base64 };
    ws.send(JSON.stringify(msg));
  }, []);

  /** Open the WebSocket and start the translation session. Stable reference. */
  const connect = useCallback((config: SessionConfig) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/live-ws`);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log("WebSocket open — sending init.");
      const msg: ClientMsg = {
        type: "init",
        model: config.model,
        sourceLang: config.sourceLang,
        targetLang: config.targetLang,
        bidirectional: config.bidirectional,
      };
      socket.send(JSON.stringify(msg));
    };

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ServerMsg;
      const cb = cbRef.current;

      switch (msg.type) {
        case "status":            cb.onStatus(msg.status, msg.reason); break;
        case "audio":             cb.onAudio(msg.audio); break;
        case "translation":       cb.onTranslation(msg.text); break;
        case "inputTranscription":cb.onInputTranscription(msg.transcript); break;
        case "interrupted":       cb.onInterrupted(); break;
        case "turnComplete":      cb.onTurnComplete(); break;
        case "error":             cb.onError(msg.error); break;
      }
    };

    socket.onclose = (e) => {
      console.log("WebSocket session closed:", e);
      cbRef.current.onStatus("disconnected");
    };

    socket.onerror = () => {
      console.error("WebSocket network error");
      // i18n key — App resolves it to the active interface language.
      cbRef.current.onError("error.connectionLost");
    };
  }, []);

  /**
   * Close the WebSocket. Stable reference. Pass `silent` when intentionally
   * tearing down to immediately reopen (e.g. a mid-session language swap) so the
   * old socket's `onclose` does not fire the `disconnected` callback and trigger
   * a full stop that would race the new connection.
   */
  const disconnect = useCallback((silent = false) => {
    const ws = wsRef.current;
    if (ws) {
      if (silent) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
      }
      try { ws.close(); } catch (_) {}
      wsRef.current = null;
    }
  }, []);

  return { connect, disconnect, sendAudio };
}
