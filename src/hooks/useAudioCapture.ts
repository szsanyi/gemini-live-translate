import { useState, useRef, useCallback } from "react";
import { INPUT_SAMPLE_RATE, SCRIPT_BUFFER_SIZE } from "../lib/constants";
import { floatTo16BitPCM, arrayBufferToBase64 } from "../lib/pcm";
import type { AudioSourceType } from "../types";

/**
 * Manages microphone / tab-audio capture and PCM streaming.
 *
 * Call start(source, onChunk) when the session is ready;
 * call stop() on disconnect or error.
 */
export function useAudioCapture() {
  const ctxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [inputAnalyser, setInputAnalyser] = useState<AnalyserNode | null>(null);

  const start = useCallback(async (
    audioSource: AudioSourceType,
    onChunk: (base64: string) => void,
  ) => {
    let captureStream: MediaStream;

    if (audioSource === "microphone") {
      captureStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: INPUT_SAMPLE_RATE,
        },
      });
    } else {
      console.log("Képernyő/Lap hang rögzítése indítása...");
      captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 320, height: 240, frameRate: 1 },
        audio: { echoCancellation: false, noiseSuppression: false, channelCount: 1 },
      });

      const audioTracks = captureStream.getAudioTracks();
      if (audioTracks.length === 0) {
        captureStream.getTracks().forEach(t => t.stop());
        throw new Error(
          "Nem választottál ki fül/rendszer hangot! Kérlek indítsd újra úgy, hogy az ablak kiválasztásakor bejelölöd a 'Rendszerhang megosztása' vagy a 'Fül hangjának megosztása' jelölőnégyzetet."
        );
      }
      captureStream.getVideoTracks().forEach(t => t.stop());
      captureStream = new MediaStream([audioTracks[0]]);
    }

    streamRef.current = captureStream;

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: INPUT_SAMPLE_RATE,
    });
    ctxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    setInputAnalyser(analyser);

    const sourceNode = ctx.createMediaStreamSource(captureStream);
    sourceNode.connect(analyser);

    const processor = ctx.createScriptProcessor(SCRIPT_BUFFER_SIZE, 1, 1);
    processorRef.current = processor;
    sourceNode.connect(processor);
    processor.connect(ctx.destination);

    processor.onaudioprocess = (e) => {
      const pcm = floatTo16BitPCM(e.inputBuffer.getChannelData(0));
      onChunk(arrayBufferToBase64(pcm));
    };
  }, []);

  const stop = useCallback(() => {
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch (_) {}
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current) {
      try { ctxRef.current.close(); } catch (_) {}
      ctxRef.current = null;
    }
    setInputAnalyser(null);
  }, []);

  return { start, stop, inputAnalyser };
}
