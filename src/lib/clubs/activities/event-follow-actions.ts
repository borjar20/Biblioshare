"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateClubPages } from "@/lib/reactivity/revalidate";
import { deliverDueEventReminders, notifyEventFollowers } from "./event-reminders";
import { isValidReminder, DEFAULT_REMINDER_MINUTES } from "./event-state";
import type { DeclaredEventState } from "./event-state";

// Acciones de seguimiento de un evento.
//
// TODAS devuelven un resultado discriminado y NINGUNA lanza. No es estilo: Next.js
// BORRA el mensaje de un Error lanzado desde una server action al compilar
// producción (llega un digest opaco), así que un `catch` que mire `error.message`
// funciona en dev y falla en silencio en prod. Con un resultado discriminado el
// código de error viaja como dato y la UI lo traduce.

/** Códigos que devuelven las RPC. La UI los traduce; no se pintan crudos. */
export type EventFollowError =
  | "not_found"
  | "not_an_event"
  | "event_not_active"
  | "not_a_member"
  | "event_cancelled"
  | "event_finished"
  | "not_following"
  | "invalid_reminder"
  | "forbidden"
  | "unknown";

export type EventFollowResult =
  | { ok: true }
  | { ok: false; code: EventFollowError };

const CODIGOS: ReadonlySet<string> = new Set<EventFollowError>([
  "not_found",
  "not_an_event",
  "event_not_active",
  "not_a_member",
  "event_cancelled",
  "event_finished",
  "not_following",
  "invalid_reminder",
  "forbidden",
]);

// Las RPC levantan el código con `raise exception 'not_a_member'`, que llega en
// `error.message`. Cualquier otra cosa (caída de red, timeout, un 23514 que se nos
// escapó) se normaliza a "unknown" y se registra: no se pinta un mensaje de
// Postgres crudo, pero tampoco se traga el fallo.
function mapError(error: { message?: string } | null, where: string): EventFollowResult {
  const raw = error?.message?.trim() ?? "";
  if (CODIGOS.has(raw)) return { ok: false, code: raw as EventFollowError };
  console.error(`${where} failed`, error);
  return { ok: false, code: "unknown" };
}

export async function followClubEvent(
  activityId: string,
  remindMinutesBefore: number | null = DEFAULT_REMINDER_MINUTES,
): Promise<EventFollowResult> {
  // Se valida también aquí, antes del viaje: el mismo motivo que
  // validate-event-input.ts (#133). La autoridad sigue siendo el SQL.
  if (!isValidReminder(remindMinutesBefore)) {
    return { ok: false, code: "invalid_reminder" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("follow_club_event", {
    p_activity_id: activityId,
    // El tipo generado del RPC exige `number | undefined` (sin `null`): artefacto
    // de codegen ajeno al title nullable de #674 -- la función SQL sí acepta NULL
    // (`valid_event_reminder` lo trata como "sin recordatorio"). Cast sin cambiar
    // el comportamiento en runtime.
    p_remind_minutes_before: remindMinutesBefore as number | undefined,
  });
  if (error) return mapError(error, "followClubEvent");

  revalidateClubPages();

  // Si el momento del recordatorio ya pasó (se sigue algo que empieza dentro del
  // propio offset), §9.1 pide avisar de inmediato en vez de esperar hasta 5
  // minutos al barrido. Se reclama SOLO este evento, así que el trabajo está
  // acotado. Best-effort: el seguimiento ya está guardado y no se deshace porque
  // el aviso falle.
  try {
    await deliverDueEventReminders(50, activityId);
  } catch (deliveryError) {
    console.error("followClubEvent: entrega inmediata fallida", deliveryError);
  }

  return { ok: true };
}

export async function unfollowClubEvent(activityId: string): Promise<EventFollowResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unfollow_club_event", {
    p_activity_id: activityId,
  });
  if (error) return mapError(error, "unfollowClubEvent");

  // Los recordatorios futuros se van con la fila: el recordatorio ES un campo del
  // seguimiento, así que no hay nada que cancelar aparte.
  revalidateClubPages();
  return { ok: true };
}

export async function setClubEventReminder(
  activityId: string,
  remindMinutesBefore: number | null,
): Promise<EventFollowResult> {
  if (!isValidReminder(remindMinutesBefore)) {
    return { ok: false, code: "invalid_reminder" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_club_event_reminder", {
    p_activity_id: activityId,
    // Mismo artefacto de codegen que en followClubEvent: la función SQL acepta
    // NULL. Cast sin cambiar el comportamiento en runtime.
    p_remind_minutes_before: remindMinutesBefore as number,
  });
  if (error) return mapError(error, "setClubEventReminder");

  revalidateClubPages();

  // Igual que al seguir: elegir «24 horas antes» en algo que es esta tarde tiene
  // que avisar ya, no callar.
  try {
    await deliverDueEventReminders(50, activityId);
  } catch (deliveryError) {
    console.error("setClubEventReminder: entrega inmediata fallida", deliveryError);
  }

  return { ok: true };
}

/**
 * Cancelar, posponer o reprogramar (moderador+). Los recordatorios los apaga y los
 * vuelve a armar el trigger de la BD; aquí solo se declara el estado y se avisa a
 * quienes lo siguen, que es lo que el trigger no puede hacer.
 */
export async function setClubEventState(
  activityId: string,
  state: DeclaredEventState,
): Promise<EventFollowResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "forbidden" };

  const { error } = await supabase.rpc("set_club_event_state", {
    p_activity_id: activityId,
    p_state: state,
  });
  if (error) return mapError(error, "setClubEventState");

  // Cancelar y posponer SÍ se avisan: obligan a cambiar de planes. Volver a
  // «programado» no, porque una reprogramación llega con fecha nueva y de eso
  // avisa updateClubEvent -- avisar dos veces del mismo cambio sería ruido.
  if (state === "cancelado" || state === "pospuesto") {
    await notifyEventFollowers(supabase, {
      activityId,
      actorId: user.id,
      type: state === "cancelado" ? "club_event_cancelled" : "club_event_updated",
    });
  }

  revalidateClubPages();
  return { ok: true };
}
