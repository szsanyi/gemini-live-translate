import { useState, useRef, useCallback } from "react";
import { INPUT_SAMPLE_RATE, SCRIPT_BUFFER_SIZE } from "../lib/constants";
import { floatTo16BitPCM, arrayBufferToBase64 } from "../lib/pcm";
import type { AudioSourceType } from "../types";

/** RMS below this (≈ -54 dBFS) counts as a pause rather than speech, for the diagnostic. */
const QUIET_RMS = 0.002;

/** Opt-in capture diagnostics: `localStorage.audioDebug = "1"` in the console. */
function isAudioDebug(): boolean {
  try {
    return localStorage.getItem("audioDebug") === "1";
  } catch {
    return false;
  }
}

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
  const driftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

    const debug = isAudioDebug();
    let capturedSamples = 0;
    // Per-window level statistics, reset on every diagnostic log (see below).
    const win = { frames: 0, quiet: 0, sumSq: 0, floor: Infinity, peak: 0 };

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      capturedSamples += input.length;
      if (debug) {
        let sq = 0;
        for (let i = 0; i < input.length; i++) sq += input[i] * input[i];
        const meanSq = sq / input.length;
        const rms = Math.sqrt(meanSq);
        win.frames++;
        win.sumSq += meanSq;
        if (rms < QUIET_RMS) win.quiet++;
        if (rms < win.floor) win.floor = rms;
        if (rms > win.peak) win.peak = rms;
      }
      const pcm = floatTo16BitPCM(input);
      onChunk(arrayBufferToBase64(pcm));
    };

    // Capture diagnostic, enabled with localStorage.audioDebug = "1".
    //
    // `drift` (captured audio vs. real time) answers whether the capture path itself
    // is falling behind. Measured on a real tab-share session: it holds at roughly
    // -1.6 ms/s with occasional resyncs — ordinary clock skew, a few tenths of a
    // second over minutes, so the resampled 48→16 kHz input path is NOT where a
    // perceptible delay comes from.
    //
    // The level stats are the next question: what the model's voice-activity
    // detection actually receives. `rms` is the window's average level, `floor` its
    // quietest frame and `quiet` the share of frames below QUIET_RMS. Compare a mic
    // session against a tab session:
    //   • tab much quieter than mic (low rms) → start-of-speech is detected late,
    //     and the fix is a gain stage before the PCM is sent;
    //   • tab floor never gets near silence / quiet≈0% while mic reaches it → the
    //     VAD never sees a pause, so end-of-speech (and with it the finished card)
    //     lands late, and the fix is realtimeInputConfig.automaticActivityDetection
    //     in server/providers/gemini.ts, which currently sets no VAD options at all.
    if (debug) {
      const track = captureStream.getAudioTracks()[0];
      console.log(
        `[audio] source=${audioSource} ctx.sampleRate=${ctx.sampleRate} ` +
        `baseLatency=${ctx.baseLatency ?? "n/a"} track=`,
        track?.getSettings(),
      );
      const startedAt = performance.now();
      const dB = (v: number) => (v > 0 && Number.isFinite(v) ? (20 * Math.log10(v)).toFixed(0) : "-inf");
      driftTimerRef.current = setInterval(() => {
        const wall = (performance.now() - startedAt) / 1000;
        const captured = capturedSamples / ctx.sampleRate;
        const frames = Math.max(1, win.frames);
        console.log(
          `[audio] wall=${wall.toFixed(1)}s captured=${captured.toFixed(1)}s ` +
          `drift=${(captured - wall).toFixed(2)}s | rms=${dB(Math.sqrt(win.sumSq / frames))}dB ` +
          `peak=${dB(win.peak)}dB floor=${dB(win.floor)}dB ` +
          `quiet=${Math.round((100 * win.quiet) / frames)}% frames=${win.frames}`,
        );
        win.frames = 0; win.quiet = 0; win.sumSq = 0; win.floor = Infinity; win.peak = 0;
      }, 5000);
    }
  }, []);

  const stop = useCallback(() => {
    if (driftTimerRef.current) {
      clearInterval(driftTimerRef.current);
      driftTimerRef.current = null;
    }
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
