// Eventos de las notas de voz (spec §10). El repo aún no tiene proveedor de
// analítica de producto: hoy solo trazan en dev, pero el punto de enganche
// existe para cuando lo haya (mismo criterio que celebrations/analytics.ts).
//
// REGLA DE PRIVACIDAD: sin ids de comentario ni de post, sin texto libre.
// Superficie y números, nada que identifique contenido.

export type VoiceNoteAnalyticsEvent =
  | "recording_started"
  | "recording_discarded"
  | "voice_note_published"
  | "playback_started"
  | "playback_completed"
  | "playback_rate_changed";

export type VoiceNoteAnalyticsContext = {
  /** Dónde está el hilo: página de post, club o ficha. */
  surface?: "post" | "club" | "detail";
  durationMs?: number;
  rate?: number;
};

export function logVoiceNote(
  name: VoiceNoteAnalyticsEvent,
  context: VoiceNoteAnalyticsContext = {},
): void {
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[voice-note] ${name}`, context);
  }
  // ponytail: sin proveedor de analítica todavía. Cuando lo haya, emitir aquí.
}
