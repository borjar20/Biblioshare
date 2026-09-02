import type {
  CelebrationConfig,
  CelebrationEvent,
  CelebrationPayload,
} from "./types";

// Registro central: la ÚNICA fuente de verdad de "qué hace cada celebración".
// Añadir un evento = añadir aquí su config y su detector de dominio; el
// provider, la cola y el overlay ya lo tratan sin cambios.
export const CELEBRATIONS: Record<CelebrationEvent, CelebrationConfig> = {
  first_activity_of_day: {
    event: "first_activity_of_day",
    intensity: "subtle",
    durationMs: 1400,
    scope: "day",
    reducedMotionFallback: "fade",
  },
  daily_goal_completed: {
    event: "daily_goal_completed",
    intensity: "medium",
    durationMs: 1600,
    scope: "day",
    reducedMotionFallback: "fade",
  },
  streak_milestone: {
    event: "streak_milestone",
    intensity: "high",
    durationMs: 1800,
    scope: "milestone",
    reducedMotionFallback: "static",
  },
  first_club_participation: {
    event: "first_club_participation",
    intensity: "medium",
    durationMs: 1600,
    scope: "ever",
    reducedMotionFallback: "fade",
  },
  // Mascota (spec 2026-09-02 §8): se ganan al calcular el snapshot en /mascota
  // cuando level > last_level o cambia la etapa. `milestone` = nivel / índice
  // de etapa (STAGE_INDEX en src/lib/pet/get-pet-snapshot.ts).
  pet_level_up: {
    event: "pet_level_up",
    intensity: "medium",
    durationMs: 1600,
    scope: "milestone",
    reducedMotionFallback: "fade",
  },
  pet_evolved: {
    event: "pet_evolved",
    intensity: "high",
    durationMs: 1800,
    scope: "milestone",
    reducedMotionFallback: "static",
  },
  // Mascota fase 2 (spec 2026-09-02-mascota-misiones-logros): se ganan en
  // getPetSnapshot. `key` = "<day>:<slot>" para misiones, id del logro para logros.
  pet_mission_done: {
    event: "pet_mission_done",
    intensity: "medium",
    durationMs: 1400,
    scope: "key",
    reducedMotionFallback: "fade",
  },
  pet_achievement: {
    event: "pet_achievement",
    intensity: "high",
    durationMs: 1800,
    scope: "key",
    reducedMotionFallback: "static",
  },
};

// Hitos de racha que se celebran. Fuera de esta lista, ningún día dispara nada.
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 365] as const;

/** El mayor hito que ESTE valor de racha acaba de alcanzar, o null. */
export function reachedMilestone(streak: number): number | null {
  return STREAK_MILESTONES.includes(streak as (typeof STREAK_MILESTONES)[number])
    ? streak
    : null;
}

// Clave de deduplicación: identifica una celebración concreta de forma estable
// entre recargas y dispositivos. Es la que respalda la restricción UNIQUE
// (user_id, event_type, event_key) de la tabla, así que tiene que ser
// determinista y no depender de nada volátil.
//
//   first_activity_of_day:2026-08-05
//   daily_goal_completed:2026-08-05
//   streak_milestone:30
//   first_club_participation
//   pet_mission_done:2026-09-03:1
//   pet_achievement:notes_50
export function getCelebrationKey(payload: CelebrationPayload): string {
  const config = CELEBRATIONS[payload.event];
  switch (config.scope) {
    case "day": {
      if (!payload.date) {
        throw new Error(`${payload.event} necesita 'date' para su clave diaria`);
      }
      return `${payload.event}:${payload.date}`;
    }
    case "milestone": {
      if (payload.milestone == null) {
        throw new Error(`${payload.event} necesita 'milestone' para su clave`);
      }
      return `${payload.event}:${payload.milestone}`;
    }
    case "key": {
      if (!payload.key) {
        throw new Error(`${payload.event} necesita 'key' para su clave`);
      }
      return `${payload.event}:${payload.key}`;
    }
    case "ever":
      return payload.event;
  }
}
