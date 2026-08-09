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
import type { EventType, EventConfig, LanzamientoConfig, FechaDestacadaConfig } from "./event-types";

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


export type EventFormError =
  // Del validador de cliente y de las RPC (snake_case):
  | "title_required" | "title_too_long" | "starts_on_required" | "description_too_long"
  | "starts_time_required"
  | "invalid_timezone" | "location_too_long" | "online_url_too_long"
  | "invalid_online_url" | "online_event_has_location" | "ends_before_starts"
  | "not_found" | "not_an_event" | "event_not_active" | "forbidden"
  // De la validación de config en esta capa:
  | "item_required" | "release_type_required" | "relation_not_in_club"
  | "unknown";

export type EventFormResult = { ok: true; activityId: string } | { ok: false; code: EventFormError };

/**
 * Campos del evento que llegan del formulario. La hora va aparte de la fecha y
 * como texto "HH:MM": el instante lo construye SQL con la zona del evento
 * (`create_club_event`), nunca el cliente. Así el horario de verano lo resuelve la
 * base de datos de zonas y no aritmética nuestra.
 */
export type ClubEventFields = {
  eventType: EventType;
  title: string;
  description?: string;
  startsOn: string;
  startsTime?: string;
  endsTime?: string;
  timezone?: string;
  location?: string;
  modality?: Database["public"]["Enums"]["event_modality"];
  onlineUrl?: string;
  /** Solo para lanzamiento/fecha_destacada. Encuentro no lo manda. */
  config?: EventConfig;
};

const RPC_CODES: ReadonlySet<string> = new Set<EventFormError>([
  "title_required", "title_too_long", "starts_on_required", "description_too_long",
  "starts_time_required", "invalid_timezone", "location_too_long", "online_url_too_long",
  "invalid_online_url", "online_event_has_location", "ends_before_starts",
  "not_found", "not_an_event", "event_not_active", "forbidden",
]);

function mapRpcError(error: { message?: string } | null, where: string): EventFormResult {
  const raw = error?.message?.trim() ?? "";
  if (RPC_CODES.has(raw)) return { ok: false, code: raw as EventFormError };
  console.error(`${where} failed`, error);
  return { ok: false, code: "unknown" };
}

/** Validación de cliente (título/fechas) + de config, devolviendo código. No lanza. */
function validateFields(input: ClubEventFields): EventFormError | null {
  try {
    validateEventInput(input); // title/starts_on/description; lanza el código
  } catch (e) {
    return (e as Error).message as EventFormError;
  }
  if (input.eventType === "lanzamiento") {
    const cfg = input.config as LanzamientoConfig | undefined;
    if (!cfg?.item) return "item_required";
    if (!cfg.releaseType) return "release_type_required";
  }
  return null;
}

/** Las relaciones de tipo `activity` de una fecha destacada deben ser del MISMO club. */
async function relationsInClub(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  config: EventConfig | undefined,
): Promise<boolean> {
  const relations = (config as FechaDestacadaConfig | undefined)?.relations ?? [];
  const activityIds = relations.filter((r) => r.kind === "activity").map((r) => r.activityId);
  if (activityIds.length === 0) return true;
  const { data } = await supabase
    .from("club_activities")
    .select("id")
    .eq("club_id", clubId)
    .in("id", activityIds);
  return (data?.length ?? 0) === activityIds.length;
}

export async function createClubEvent(
  input: { clubId: string } & ClubEventFields,
): Promise<EventFormResult> {
  const { supabase, userId } = await requireUser();

  const invalid = validateFields(input);
  if (invalid) return { ok: false, code: invalid };
  if (input.eventType === "fecha_destacada" && !(await relationsInClub(supabase, input.clubId, input.config))) {
    return { ok: false, code: "relation_not_in_club" };
  }

  const { data: eventId, error } = await supabase.rpc("create_club_event", {
    p_club_id: input.clubId,
    p_title: input.title.trim(),
    p_description: input.description,
    p_starts_on: input.startsOn,
    p_starts_time: input.startsTime,
    p_ends_time: input.endsTime,
    p_timezone: input.timezone,
    p_location: input.location,
    p_modality: input.modality,
    p_online_url: input.onlineUrl,
    p_event_type: input.eventType,
    p_config: (input.config ?? {}) as never,
  });
  if (error) return mapRpcError(error, "createClubEvent");

  await notifyClub(supabase, input.clubId, userId, "club_event_created", eventId as string);
  revalidateClubPages();
  return { ok: true, activityId: eventId as string };
}

export async function updateClubEvent(
  input: { activityId: string } & ClubEventFields,
): Promise<EventFormResult> {
  const { supabase, userId } = await requireUser();

  const invalid = validateFields(input);
  if (invalid) return { ok: false, code: invalid };

  // club_id + fecha ANTERIOR en una lectura: club_id para validar relaciones,
  // starts_at para decidir si se avisa a los seguidores (solo si cambia el instante).
  const { data: antes } = await supabase
    .from("club_activities")
    .select("club_id, starts_at")
    .eq("id", input.activityId)
    .maybeSingle();

  if (
    input.eventType === "fecha_destacada" &&
    antes?.club_id &&
    !(await relationsInClub(supabase, antes.club_id, input.config))
  ) {
    return { ok: false, code: "relation_not_in_club" };
  }

  const { error } = await supabase.rpc("update_club_event", {
    p_activity_id: input.activityId,
    p_title: input.title.trim(),
    p_description: input.description,
    p_starts_on: input.startsOn,
    p_starts_time: input.startsTime,
    p_ends_time: input.endsTime,
    p_timezone: input.timezone,
    p_location: input.location,
    p_modality: input.modality,
    p_online_url: input.onlineUrl,
    p_config: (input.config ?? {}) as never,
  });
  if (error) return mapRpcError(error, "updateClubEvent");

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
  return { ok: true, activityId: input.activityId };
}
