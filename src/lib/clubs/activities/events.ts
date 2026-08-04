"use server";

import { redirect } from "next/navigation";
import { notifyClub } from "./notify-club";
import { createClient } from "@/lib/supabase/server";
import { revalidateClubPages } from "@/lib/reactivity/revalidate";
// Validación previa al roundtrip (#133). Sus hermanas de core.ts y propose.ts ya
// validaban el título ANTES de llamar a la BD; estas dos no, así que un título
// vacío pagaba el viaje entero hasta la RPC para volver con el mismo "no".
import { validateEventInput } from "./validate-event-input";
import { notifyEventFollowers } from "./event-reminders";
import type { Database } from "@/lib/supabase/database.types";

// Eventos de club (spec 2026-07-22). Módulo aparte de core.ts porque un evento
// no comparte NADA de su ciclo de vida: no se propone, no se activa, no se une
// nadie. Meterlo en core.ts habría sido mezclar dos modelos en un fichero ya
// largo.
//
// Ambas acciones van por RPC, no por insert/update de cliente:
//   - crear: la política de INSERT fuerza status='proposed', y un evento nace activo.
//   - editar: club_activities no tiene política UPDATE (SD-8), a propósito.

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}


/**
 * Campos del evento que llegan del formulario. La hora va aparte de la fecha y
 * como texto "HH:MM": el instante lo construye SQL con la zona del evento
 * (`create_club_event`), nunca el cliente. Así el horario de verano lo resuelve la
 * base de datos de zonas y no aritmética nuestra.
 */
export type ClubEventFields = {
  title: string;
  description?: string;
  startsOn: string;
  startsTime?: string;
  endsTime?: string;
  timezone?: string;
  location?: string;
  modality?: Database["public"]["Enums"]["event_modality"];
  onlineUrl?: string;
};

export async function createClubEvent(
  input: { clubId: string } & ClubEventFields,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const title = validateEventInput(input);

  const { data: eventId, error } = await supabase.rpc("create_club_event", {
    p_club_id: input.clubId,
    p_title: title,
    // Sin cast: desde la migración 20260810 `p_description` tiene `default null`,
    // así que el tipo generado lo marca opcional y `undefined` significa lo que
    // parece. Antes hacía falta un `as string` sobre un null para colarlo.
    p_description: input.description,
    p_starts_on: input.startsOn,
    p_starts_time: input.startsTime,
    p_ends_time: input.endsTime,
    p_timezone: input.timezone,
    p_location: input.location,
    p_modality: input.modality,
    p_online_url: input.onlineUrl,
  });
  if (error) throw error;

  await notifyClub(
    supabase,
    input.clubId,
    userId,
    "club_event_created",
    eventId as string,
  );
  revalidateClubPages();
}

export async function updateClubEvent(
  input: { activityId: string } & ClubEventFields,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const title = validateEventInput(input);

  // La fecha/hora ANTERIOR, leída antes de escribir: es lo único que distingue
  // «corregir una errata» de «mover el evento», y solo lo segundo se avisa. Sin
  // esta lectura habría que avisar de toda edición (ruido) o de ninguna (dejar a
  // los seguidores con una fecha vieja en la cabeza).
  const { data: antes } = await supabase
    .from("club_activities")
    .select("starts_at")
    .eq("id", input.activityId)
    .maybeSingle();

  // La RPC valida moderador+ (has_min_club_role(club_id, 'moderator'); no hay
  // rama de creador), kind='evento' y status='active' (un evento archivado ya
  // no es editable); lanza 'not_found' | 'not_an_event' | 'forbidden' |
  // 'title_required' | 'title_too_long' | 'starts_on_required' |
  // 'description_too_long' | 'event_not_active'. Todos en snake_case desde la
  // migración 20260810 (#133): antes eran frases con espacios y no casaban con
  // la convención del cliente, así que cualquier intento de mapearlos a una
  // clave i18n fallaba en silencio justo para estos.
  //
  // Se relanza tal cual -- el llamante (UI) es quien traduce/pinta el error,
  // mismo patrón que el resto de este módulo y de core.ts.
  const { error } = await supabase.rpc("update_club_event", {
    p_activity_id: input.activityId,
    p_title: title,
    p_description: input.description,
    p_starts_on: input.startsOn,
    p_starts_time: input.startsTime,
    p_ends_time: input.endsTime,
    p_timezone: input.timezone,
    p_location: input.location,
    p_modality: input.modality,
    p_online_url: input.onlineUrl,
  });
  if (error) throw error;

  // Al club entero se le sigue sin avisar de una edición: ya se enteró de la fecha
  // al crearse, y avisar de cada corrección de errata sería ruido (decisión de la
  // spec 2026-07-22, intacta).
  //
  // Lo que sí se avisa, y solo a QUIENES LO SIGUEN, es que cambie la fecha o la
  // hora: han apuntado ese día en su calendario mental y sus recordatorios acaban
  // de reprogramarse solos. Se compara el instante antes/después, no «se editó»:
  // cambiar la ubicación no mueve a nadie de sitio en su agenda.
  const { data: despues } = await supabase
    .from("club_activities")
    .select("starts_at")
    .eq("id", input.activityId)
    .maybeSingle();

  if (antes?.starts_at && despues?.starts_at && antes.starts_at !== despues.starts_at) {
    await notifyEventFollowers(supabase, {
      activityId: input.activityId,
      actorId: userId,
      type: "club_event_updated",
    });
  }

  revalidateClubPages();
}
