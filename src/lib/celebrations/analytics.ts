import type { CelebrationEvent } from "./types";
import { CELEBRATIONS } from "./registry";

// Eventos de analítica de celebraciones. El repo aún no tiene proveedor de
// analítica de producto (solo Speed Insights), así que esto es un punto de
// enganche: hoy solo traza en dev. Cablear PostHog/Vercel Analytics más adelante
// es cambiar el cuerpo de `emit`, nada más.
//
// REGLA DE PRIVACIDAD (brief): no se registran títulos, notas ni contenido de
// clubes privados — solo el tipo de celebración, intensidad, duración y contexto
// genérico. `AnalyticsContext` no admite texto libre del usuario a propósito.
export type CelebrationAnalyticsEvent =
  | "celebration_triggered"
  | "celebration_displayed"
  | "celebration_skipped_duplicate"
  | "celebration_skipped_preference"
  | "celebration_dismissed";

export interface CelebrationAnalyticsContext {
  event: CelebrationEvent;
  intensity?: "subtle" | "medium" | "high";
  durationMs?: number;
  /** Si se usó el fallback de movimiento reducido. */
  reducedMotion?: boolean;
  /** Contexto genérico, no identificable (p. ej. "club", "book"). */
  surface?: string;
}

export function logCelebration(
  name: CelebrationAnalyticsEvent,
  context: CelebrationAnalyticsContext,
): void {
  const config = CELEBRATIONS[context.event];
  const payload = {
    intensity: config.intensity,
    durationMs: config.durationMs,
    ...context,
  };
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[celebration] ${name}`, payload);
  }
  // ponytail: sin proveedor de analítica todavía. Cuando lo haya, emitir aquí.
}
