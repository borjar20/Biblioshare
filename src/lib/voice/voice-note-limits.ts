// Límites de las notas de voz (spec §7). Compartidos por la UI (feedback
// inmediato: mic atenuado) y la server action (la puerta real). El CHECK de
// Postgres (comments_audio_canonical) es la red de debajo, no la puerta.

export const VOICE_MIN_DURATION_MS = 2_000;
export const VOICE_MAX_DURATION_MS = 60_000;
/** A partir de aquí el timer pasa a cuenta atrás ámbar (spec §3). */
export const VOICE_COUNTDOWN_FROM_MS = 45_000;
/** Descartar/regrabar pide confirmación solo con más de esto grabado. */
export const VOICE_CONFIRM_DISCARD_FROM_MS = 15_000;
export const VOICE_MAX_BYTES = 2 * 1024 * 1024;
export const VOICE_MAX_PER_THREAD = 3;
export const VOICE_MAX_PER_DAY = 20;
export const VOICE_PEAK_COUNT = 64;

/** mime base aceptado → extensión del objeto en Storage. */
export const VOICE_ALLOWED_TYPES: ReadonlyMap<string, string> = new Map([
  ["audio/webm", "webm"],
  ["audio/mp4", "m4a"],
]);

/** `audio/webm;codecs=opus` → `audio/webm`. */
export function baseMimeType(type: string): string {
  return (type.split(";")[0] ?? "").trim().toLowerCase();
}

/** Lo mínimo que el gate necesita saber de un comentario ya cargado. */
export type VoiceGateComment = {
  isOwn: boolean;
  hasAudio: boolean;
  createdAt: string;
};

export type VoiceGate =
  | { allowed: true }
  | { allowed: false; reason: "thread_limit" | "consecutive" };

/**
 * Frenos suaves por usuario y hilo (spec §4): máx 3 audios propios, y no dos
 * seguidos — si el último comentario del hilo ENTERO (no de la rama) es un
 * audio tuyo sin respuesta de nadie, el mic se atenúa. El freno diario (20)
 * es solo del servidor: el cliente no ve tus otros hilos.
 */
export function voiceGate(comments: readonly VoiceGateComment[]): VoiceGate {
  const ownAudios = comments.filter((c) => c.isOwn && c.hasAudio).length;
  if (ownAudios >= VOICE_MAX_PER_THREAD) return { allowed: false, reason: "thread_limit" };
  const last = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  if (last?.isOwn && last.hasAudio) return { allowed: false, reason: "consecutive" };
  return { allowed: true };
}
