"use client";

// Capa fina sobre MediaRecorder + AudioContext (spec §6): graba 100 % en
// local (perder red durante la grabación no afecta), con pausa reanudable
// (MediaRecorder.pause concatena segmentos él solo) y un tick de ~100 ms que
// alimenta el timer, la waveform en vivo y las muestras de los 64 picos.

import { resamplePeaks } from "./peaks";

export type VoiceRecording = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  peaks: number[];
};

export type RecorderTick = { elapsedMs: number; amplitude: number };

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus", // Chrome / Android / WebView Capacitor
  "audio/webm",
  "audio/mp4", // Safari / iOS (AAC)
];

export function pickVoiceMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export class VoiceRecorderEngine {
  private chunks: BlobPart[] = [];
  private samples: number[] = [];
  private elapsedMs = 0;
  private lastTickAt = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private paused = false;

  private constructor(
    private stream: MediaStream,
    private recorder: MediaRecorder,
    private audioContext: AudioContext,
    private analyser: AnalyserNode,
    readonly mimeType: string,
  ) {}

  /** Pide el micro. Lanza el DOMException de getUserMedia (NotAllowedError…). */
  static async create(): Promise<VoiceRecorderEngine> {
    const mimeType = pickVoiceMimeType();
    if (!mimeType) throw new DOMException("MediaRecorder unsupported", "NotSupportedError");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType });
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    return new VoiceRecorderEngine(stream, recorder, audioContext, analyser, mimeType);
  }

  start(onTick: (tick: RecorderTick) => void): void {
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(1000); // timeslice: el blob crece por segundos, no al final
    this.lastTickAt = performance.now();
    const data = new Uint8Array(this.analyser.fftSize);
    this.interval = setInterval(() => {
      if (this.paused) {
        this.lastTickAt = performance.now();
        return;
      }
      const now = performance.now();
      this.elapsedMs += now - this.lastTickAt;
      this.lastTickAt = now;
      this.analyser.getByteTimeDomainData(data);
      let max = 0;
      for (const v of data) max = Math.max(max, Math.abs(v - 128));
      const amplitude = max / 128; // 0..1
      this.samples.push(amplitude);
      onTick({ elapsedMs: this.elapsedMs, amplitude });
    }, 100);
  }

  pause(): void {
    if (this.recorder.state === "recording") this.recorder.pause();
    this.paused = true;
  }

  resume(): void {
    if (this.recorder.state === "paused") this.recorder.resume();
    this.paused = false;
    this.lastTickAt = performance.now();
  }

  stop(): Promise<VoiceRecording> {
    return new Promise((resolve, reject) => {
      this.recorder.onstop = () => {
        this.release();
        resolve({
          blob: new Blob(this.chunks, { type: this.mimeType }),
          mimeType: this.mimeType,
          durationMs: Math.round(this.elapsedMs),
          peaks: resamplePeaks(this.samples),
        });
      };
      this.recorder.onerror = () => {
        this.release();
        reject(new Error("recording_failed"));
      };
      try {
        this.recorder.stop();
      } catch (e) {
        this.release();
        reject(e);
      }
    });
  }

  cancel(): void {
    try {
      if (this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      // ya estaba parado
    }
    this.release();
  }

  private release(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    for (const track of this.stream.getTracks()) track.stop();
    void this.audioContext.close().catch(() => {});
  }
}
