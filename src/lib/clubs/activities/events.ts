"use server";

import { redirect } from "next/navigation";
import { notifyClub } from "./notify-club";
import { createClient } from "@/lib/supabase/server";
import { revalidateClubPages } from "@/lib/reactivity/revalidate";

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

export async function createClubEvent(input: {
  clubId: string;
  title: string;
  description?: string;
  startsOn: string;
}): Promise<void> {
  const { supabase, userId } = await requireUser();

  const { data: eventId, error } = await supabase.rpc("create_club_event", {
    p_club_id: input.clubId,
    p_title: input.title,
    // El generador de tipos marca p_description como no-nulo (la función no
    // tiene DEFAULT), pero sí acepta NULL a propósito -- mismo caso que
    // spawnLinkedActivity en core.ts.
    p_description: (input.description ?? null) as string,
    p_starts_on: input.startsOn,
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

export async function updateClubEvent(input: {
  activityId: string;
  title: string;
  description?: string;
  startsOn: string;
}): Promise<void> {
  const { supabase } = await requireUser();

  // La RPC valida creador/moderador+, kind='evento' y status='active' (un
  // evento archivado ya no es editable); lanza 'not found' | 'not an event' |
  // 'forbidden' | 'title required' | 'starts_on required' | 'event not active'.
  // Se relanza tal cual -- el llamante (UI) es quien traduce/pinta el error,
  // mismo patrón que el resto de este módulo y de core.ts.
  const { error } = await supabase.rpc("update_club_event", {
    p_activity_id: input.activityId,
    p_title: input.title,
    p_description: (input.description ?? null) as string,
    p_starts_on: input.startsOn,
  });
  if (error) throw error;

  // Editar no notifica: el club ya se enteró de la fecha al crearse, y avisar de
  // cada corrección de errata sería ruido.
  revalidateClubPages();
}
