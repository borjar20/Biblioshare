// Sistema central de celebraciones (microanimaciones por evento). El alcance
// inicial son cuatro eventos; la unión está abierta para ampliar sin tocar el
// resto del sistema — añadir uno = añadir su entrada al registro (registry.ts)
// y su detector de dominio. Ver docs/superpowers/specs para el diseño.

export type CelebrationEvent =
  | "first_activity_of_day"
  | "daily_goal_completed"
  | "streak_milestone"
  | "first_club_participation"
  | "pet_level_up"
  | "pet_evolved"
  | "pet_mission_done"
  | "pet_achievement";

/** Cómo se deduplica: qué parte del payload forma la clave única por usuario. */
export type CelebrationScope =
  | "day" // una vez al día — clave incluye la fecha
  | "milestone" // una vez por hito — clave incluye el número
  | "ever" // una sola vez por usuario
  | "key"; // una vez por clave libre — clave incluye payload.key (misión del día y hueco, id de logro)

export interface CelebrationConfig {
  event: CelebrationEvent;
  intensity: "subtle" | "medium" | "high";
  durationMs: number;
  scope: CelebrationScope;
  /** Qué mostrar cuando el usuario pide movimiento reducido. */
  reducedMotionFallback: "static" | "fade" | "none";
}

// El payload es lo que viaja del detector de dominio al overlay. Deliberadamente
// genérico: soporta libros, películas, series y tipos futuros sin tocar el tipo.
export interface CelebrationPayload {
  event: CelebrationEvent;
  title?: string;
  message?: string;
  itemType?: "book" | "movie" | "series" | string;
  itemId?: string;
  passId?: string;
  clubId?: string;
  clubActivityId?: string;
  /** Hito de racha alcanzado (3, 7, 14…). */
  milestone?: number;
  /** Fecha "YYYY-MM-DD" para los eventos de alcance diario. */
  date?: string;
  /** Clave libre para los eventos de alcance `key` ("2026-09-03:1", "notes_50"). */
  key?: string;
  metadata?: Record<string, unknown>;
}

/** Preferencia del usuario sobre las celebraciones. */
export type CelebrationPreference = "full" | "reduced" | "disabled";
