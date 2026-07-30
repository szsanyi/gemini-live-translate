import { useState, useRef, useCallback } from "react";
import { OUTPUT_SAMPLE_RATE, PLAYBACK_SLIDE_S } from "../lib/constants";
import { decodePcmToFloat32 } from "../lib/pcm";

/**
 * Manages the 24 kHz output AudioContext and scheduled PCM playback.
 *
 * isMuted is tracked via a ref so that toggling mute mid-session
 * takes effect immediately — avoiding the stale-closure bug that existed
 * when App.tsx read `isMuted` state inside a socket.onmessage closure.
 */
export function useAudioPlayback() {
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isMutedRef = useRef(false);
  const [outputAnalyser, setOutputAnalyser] = useState<AnalyserNode | null>(null);

  const start = useCallback(() => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: OUTPUT_SAMPLE_RATE,
    });
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctxRef.current = ctx;
    analyserRef.current = analyser;
    nextStartTimeRef.current = 0;
    setOutputAnalyser(analyser);
  }, []);

  /** Stop all playing sources without closing the AudioContext. */
  const stopSources = useCallback(() => {
    activeSourcesRef.current.forEach(src => {
      try { src.stop(); } catch (_) {}
    });
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;
  }, []);

  /** Decode and schedule a base64-encoded 16-bit PCM chunk. */
  const enqueueChunk = useCallback((base64: string) => {
    if (isMutedRef.current) return;
    const ctx = ctxRef.current;
    const analyser = analyserRef.current;
    if (!ctx || !analyser) return;

    try {
      const float32 = decodePcmToFloat32(base64);
      const buf = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
      buf.copyToChannel(float32, 0);

      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      const now = ctx.currentTime;
      if (nextStartTimeRef.current < now) {
        nextStartTimeRef.current = now + PLAYBACK_SLIDE_S;
      }
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += buf.duration;

      activeSourcesRef.current.push(source);
      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
      };
    } catch (err) {
      console.error("Audio playback error:", err);
    }
  }, []);

  /** Stop playback and close the AudioContext. */
  const stop = useCallback(() => {
    stopSources();
    if (ctxRef.current) {
      try { ctxRef.current.close(); } catch (_) {}
      ctxRef.current = null;
    }
    analyserRef.current = null;
    setOutputAnalyser(null);
  }, [stopSources]);

  /** Update the mute state via ref so it applies immediately to the next chunk. */
  const setMuted = useCallback((muted: boolean) => {
    isMutedRef.current = muted;
  }, []);

  return { start, stop, stopSources, enqueueChunk, setMuted, outputAnalyser };
}
