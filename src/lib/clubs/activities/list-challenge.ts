"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { itemKey } from "./list-challenge-types";
import type {
  ListChallengeParticipantProgress,
  ListChallengeProgressView,
} from "./list-challenge-types";

// Progreso de un reto por lista (EPIC-05, Bloque H3). Hermano de checkpoints.ts
// (H1) -- misma forma "use server" plana, sin chequeos de rol en la app.
//
// Módulo de SOLO LECTURA, sin mutaciones: no hay nada que escribir. Es la
// consecuencia más profunda de la decisión de diseño -- el progreso está 100%
// derivado de los pases de diario (diary_entries) dentro de la ventana del
// reto, así que "completar un ítem del reto" es simplemente llevar tu diario
// como siempre. No existe un botón de "marcar como hecho" ni una tabla de
// progreso que mantener.
//
// La autorización vive entera en la RPC get_list_challenge_progress
// (SECURITY DEFINER): es ella la política de lectura del tablero, porque un
// participante con perfil privado sería invisible para sus compañeros si esto
// se consultara con el cliente normal (la RLS de diary_entries/library_entries
// pasa por can_view_profile). Ver el comentario de la migración.

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

export async function getListChallengeProgress(
  activityId: string,
): Promise<ListChallengeProgressView | null> {
  const { supabase, userId } = await requireUser();

  const [windowResult, progressResult, participantResult] = await Promise.all([
    supabase.rpc("activity_window", { p_activity_id: activityId }),
    supabase.rpc("get_list_challenge_progress", { p_activity_id: activityId }),
    supabase.from("club_activity_participants").select("user_id").eq("activity_id", activityId),
  ]);

  if (windowResult.error) throw windowResult.error;
  if (progressResult.error) throw progressResult.error;
  if (participantResult.error) throw participantResult.error;

  const windowRow = windowResult.data?.[0];
  if (!windowRow) return null;

  const participantIds = (participantResult.data ?? []).map((p) => p.user_id);
  if (participantIds.length === 0) {
    return { windowStart: windowRow.window_start, windowEnd: windowRow.window_end, participants: [] };
  }

  const { data: identities } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", participantIds);

  const identityById = new Map(
    (identities ?? [])
      .filter((i): i is typeof i & { user_id: string; username: string } =>
        i.user_id != null && i.username != null,
      )
      .map((i) => [i.user_id, i]),
  );

  // Las filas de la RPC son SPARSE (solo celdas completadas) -- se pliegan por
  // usuario, y el roster de arriba garantiza una entrada por participante
  // aunque no haya completado nada.
  const completedByUser = new Map<string, { keys: string[]; onByKey: Record<string, string> }>();
  for (const row of progressResult.data ?? []) {
    const entry = completedByUser.get(row.user_id) ?? { keys: [], onByKey: {} };
    const key = itemKey(row.item_type, row.item_id);
    entry.keys.push(key);
    if (row.completed_on) entry.onByKey[key] = row.completed_on;
    completedByUser.set(row.user_id, entry);
  }

  const participants: ListChallengeParticipantProgress[] = participantIds
    .map((id): ListChallengeParticipantProgress | null => {
      const identity = identityById.get(id);
      if (!identity) return null;
      const completed = completedByUser.get(id) ?? { keys: [], onByKey: {} };
      return {
        userId: id,
        username: identity.username,
        displayName: identity.display_name,
        avatarUrl: identity.avatar_url,
        isViewer: id === userId,
        completedKeys: completed.keys,
        completedOnByKey: completed.onByKey,
      };
    })
    .filter((p): p is ListChallengeParticipantProgress => p !== null)
    // Viewer primero (su columna es la que más mira), luego quien más lleva.
    .sort((a, b) => {
      if (a.isViewer !== b.isViewer) return a.isViewer ? -1 : 1;
      if (a.completedKeys.length !== b.completedKeys.length) {
        return b.completedKeys.length - a.completedKeys.length;
      }
      return a.username.localeCompare(b.username);
    });

  return {
    windowStart: windowRow.window_start,
    windowEnd: windowRow.window_end,
    participants,
  };
}
