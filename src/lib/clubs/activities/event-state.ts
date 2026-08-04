import type { Database } from "@/lib/supabase/database.types";

// Lógica pura del evento de club: qué estado tiene, si se puede seguir y cuándo
// tocaría avisar. Módulo aparte de events.ts por la misma razón que
// validate-event-input.ts: events.ts es `"use server"` y de un fichero así solo
// se pueden exportar funciones async — nada de esto lo es. Y así se testea sin
// montar un mock de Supabase.

/** Estado DECLARADO por una persona; vive en la columna `event_state`. */
export type DeclaredEventState = Database["public"]["Enums"]["club_event_state"];

/**
 * Estado que se PINTA. Añade los dos que no se guardan porque se deducen del
 * reloj: un estado guardado es un estado que hay que mantener sincronizado, y
 * nadie escribe en la fila cuando un evento simplemente empieza o termina.
 */
export type EventState = DeclaredEventState | "en_curso" | "finalizado";

export type EventTiming = {
  eventState: DeclaredEventState;
  /** ISO con zona (timestamptz). null solo en eventos previos a la migración. */
  startsAt: string | null;
  endsAt: string | null;
};

/**
 * El estado declarado MANDA sobre el reloj: un evento cancelado sigue cancelado
 * cuando pasa su hora, y un pospuesto sigue pospuesto aunque su fecha antigua
 * quede atrás. Solo un evento `programado` se mira contra el reloj.
 */
export function deriveEventState(timing: EventTiming, now: Date = new Date()): EventState {
  if (timing.eventState !== "programado") return timing.eventState;
  if (!timing.startsAt) return "programado";

  const starts = new Date(timing.startsAt).getTime();
  const instante = now.getTime();
  if (instante < starts) return "programado";

  // Sin hora de fin no se sabe cuánto dura, así que termina al empezar.
  // Inventarle una duración mentiría sobre un dato que nadie dio.
  const ends = timing.endsAt ? new Date(timing.endsAt).getTime() : starts;
  return instante < ends ? "en_curso" : "finalizado";
}

/**
 * Seguir declara interés en algo que va a pasar. Un evento en curso, cancelado o
 * finalizado ya no lo es — y la RPC rechaza esos tres, así que esto solo evita
 * ofrecer un botón que fallaría. La autoridad está en el servidor.
 *
 * Pospuesto SÍ se puede seguir: es justo cuando más interesa enterarse de la
 * fecha nueva.
 */
export function canFollowEvent(state: EventState): boolean {
  return state === "programado" || state === "pospuesto";
}

/**
 * Las seis opciones de recordatorio, en el orden en que se ofrecen. `minutes`
 * tiene que coincidir EXACTAMENTE con lo que valida `private.valid_event_reminder`
 * en SQL: si divergieran, la UI ofrecería una opción que la RPC rechaza con
 * `invalid_reminder`. Hay una prueba que lo fija.
 */
export const REMINDER_OPTIONS = [
  { minutes: null, labelKey: "reminderNone" },
  { minutes: 0, labelKey: "reminderAtStart" },
  { minutes: 15, labelKey: "reminder15m" },
  { minutes: 60, labelKey: "reminder1h" },
  { minutes: 1440, labelKey: "reminder24h" },
  { minutes: 10080, labelKey: "reminder1w" },
] as const satisfies ReadonlyArray<{ minutes: number | null; labelKey: string }>;

/** El predeterminado: 24 horas antes (§9.1). */
export const DEFAULT_REMINDER_MINUTES = 1440;

const VALORES_VALIDOS = new Set(REMINDER_OPTIONS.map((o) => o.minutes));

export function isValidReminder(minutes: number | null): boolean {
  return VALORES_VALIDOS.has(minutes as never);
}

/**
 * Cuándo tocaría avisar. Es aritmética sobre el INSTANTE, no sobre el reloj de
 * pared: «24 horas antes» son 24 horas reales, así que si entre medias cambia el
 * horario de verano el aviso cae a una hora de reloj distinta. Es lo correcto, y
 * hay una prueba que lo fija porque de un vistazo parece un desfase.
 *
 * Ojo: esto es para MOSTRAR («te avisaremos el 11 a las 18:00») y para previsualizar
 * una opción todavía sin guardar. El valor que de verdad se entrega lo calcula
 * `private.club_event_reminder_due` en SQL y vive en `reminder_due_at`; cuando ya
 * existe la fila de seguimiento se LEE de ahí, no se recalcula aquí.
 */
export function reminderMoment(
  startsAt: string | null,
  minutesBefore: number | null,
): Date | null {
  if (startsAt === null || minutesBefore === null) return null;
  return new Date(new Date(startsAt).getTime() - minutesBefore * 60_000);
}

/**
 * ¿Este recordatorio ya venció en el momento de elegirlo? Pasa al seguir un
 * evento que empieza dentro del propio offset («sigo con 24 h de aviso algo que
 * es en 3 horas»). La respuesta de §9.1 es avisar de inmediato, no callar.
 *
 * Un evento ya terminado nunca avisa, ni de inmediato.
 */
export function reminderFiresImmediately(
  startsAt: string | null,
  minutesBefore: number | null,
  now: Date = new Date(),
): boolean {
  const momento = reminderMoment(startsAt, minutesBefore);
  if (!momento || !startsAt) return false;
  if (new Date(startsAt).getTime() <= now.getTime()) return false;
  return momento.getTime() <= now.getTime();
}
