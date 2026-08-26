// 64 picos 0..100 para la waveform: se calculan en el cliente al grabar y se
// persisten en comments.audio_peaks (smallint[]). Puro: testeable en node.
import { VOICE_PEAK_COUNT } from "./voice-note-limits";

function toPercent(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v * 100)));
}

/**
 * Reduce las muestras de amplitud (0..1, una por tick del AnalyserNode) a
 * `count` cubos, quedándose con el MÁXIMO de cada cubo (el pico, no la media:
 * una waveform de medias sale plana). Menos muestras que cubos → se devuelven
 * las que haya (una grabación corta pinta menos barras).
 */
export function resamplePeaks(samples: readonly number[], count = VOICE_PEAK_COUNT): number[] {
  if (samples.length === 0) return [];
  if (samples.length <= count) return samples.map(toPercent);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * samples.length) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * samples.length) / count));
    let max = 0;
    for (let j = start; j < end; j++) max = Math.max(max, samples[j] ?? 0);
    out.push(toPercent(max));
  }
  return out;
}

/**
 * Valida y sanea los picos que llegan del cliente a la server action: array
 * de ≤64 números finitos, redondeados y acotados a 0..100. Cualquier otra
 * cosa → null (la nota se publica sin waveform, no se rechaza por esto).
 */
export function sanitizePeaks(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > VOICE_PEAK_COUNT) return null;
  const out: number[] = [];
  for (const v of value) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    out.push(Math.max(0, Math.min(100, Math.round(v))));
  }
  return out;
}
