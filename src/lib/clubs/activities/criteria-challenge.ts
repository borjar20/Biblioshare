"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { countForChallenge, type CompletedItem } from "@/lib/challenges/match";
import type { Challenge } from "@/lib/challenges/types";
import { loadGenres, loadSagaIds, type ItemRef } from "@/lib/challenges/load-catalog-facets";
import { parseCriteriaConfig } from "./criteria-challenge-types";
import type {
  CriteriaChallengeView,
  CriteriaParticipantProgress,
} from "./criteria-challenge-types";

// Progreso de un reto por criterio (EPIC-05, Bloque H4). Hermano de checkpoints.ts (H1) y
// list-challenge.ts (H3): "use server" plano, SOLO LECTURA -- no hay nada que escribir,
// porque el progreso es 100% derivado de los pases de diario. No existe botón de "marcar".
//
// Un criteria_challenge ES, literalmente, un reto personal (§7.10) evaluado sobre varias
// personas. Por eso el conteo NO se reimplementa aquí: se construye un Challenge sintético
// desde config + la ventana de la actividad y se llama a countForChallenge
// (src/lib/challenges/match.ts) -- un solo motor de conteo, ya testeado.
//
// La RPC get_activity_diary_passes (SECURITY DEFINER) hace solo de LECTOR que salta la
// privacidad: sin ella, un participante con perfil privado sería invisible para sus
// compañeros y saldría en 0 (falso negativo silencioso). No cuenta nada -- ver la migración.

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

export async function getCriteriaChallengeProgress(
  activityId: string,
): Promise<CriteriaChallengeView | null> {
  const { supabase, userId } = await requireUser();

  const { data: activityRow, error: activityError } = await supabase
    .from("club_activities")
    .select("config")
    .eq("id", activityId)
    .maybeSingle();
  if (activityError) throw activityError;

  const config = parseCriteriaConfig(activityRow?.config ?? null);
  if (!config) return null; // sin criterio todavía -- la UI lo dice en vez de romperse

  const [windowResult, passesResult, participantResult] = await Promise.all([
    supabase.rpc("activity_window", { p_activity_id: activityId }),
    supabase.rpc("get_activity_diary_passes", { p_activity_id: activityId }),
    supabase.from("club_activity_participants").select("user_id").eq("activity_id", activityId),
  ]);
  if (windowResult.error) throw windowResult.error;
  if (passesResult.error) throw passesResult.error;
  if (participantResult.error) throw participantResult.error;

  const windowRow = windowResult.data?.[0];
  if (!windowRow) return null;

  const participantIds = (participantResult.data ?? []).map((p) => p.user_id);
  if (participantIds.length === 0) {
    return {
      config,
      windowStart: windowRow.window_start,
      windowEnd: windowRow.window_end,
      participants: [],
      clubTotal: 0,
    };
  }

  const passes = passesResult.data ?? [];

  // Enriquecer con géneros/sagas SOLO si el criterio los necesita -- un reto de "N ítems de
  // cualquier tipo" no paga ninguna query de catálogo. Misma optimización que
  // get-challenge-progress.ts (§7.10).
  const refs: ItemRef[] = passes.map((p) => ({ itemType: p.item_type, itemId: p.item_id }));
  const [genresByKey, sagasByKey] = await Promise.all([
    config.genre ? loadGenres(supabase, refs) : Promise.resolve(new Map<string, string[]>()),
    config.sagaId ? loadSagaIds(supabase, refs) : Promise.resolve(new Map<string, string[]>()),
  ]);

  // El Challenge sintético: config + la ventana de la actividad. Los campos que
  // countForChallenge no mira (id, name, archivedAt) van con valores inertes.
  const challenge: Challenge = {
    id: activityId,
    name: "",
    itemType: config.itemType,
    targetCount: config.targetCount,
    criteria: { genre: config.genre, sagaId: config.sagaId },
    startDate: windowRow.window_start,
    endDate: windowRow.window_end,
    archivedAt: null,
  };

  const itemsByUser = new Map<string, CompletedItem[]>();
  for (const p of passes) {
    const key = `${p.item_type}:${p.item_id}`;
    const list = itemsByUser.get(p.user_id) ?? [];
    list.push({
      itemType: p.item_type,
      itemId: p.item_id,
      finishedOn: p.finished_on,
      genres: genresByKey.get(key) ?? [],
      sagaIds: sagasByKey.get(key) ?? [],
    });
    itemsByUser.set(p.user_id, list);
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

  const participants: CriteriaParticipantProgress[] = participantIds
    .map((id): CriteriaParticipantProgress | null => {
      const identity = identityById.get(id);
      if (!identity) return null;
      const rawCompleted = countForChallenge(itemsByUser.get(id) ?? [], challenge);
      return {
        userId: id,
        username: identity.username,
        displayName: identity.display_name,
        avatarUrl: identity.avatar_url,
        isViewer: id === userId,
        rawCompleted,
        completed: Math.min(rawCompleted, config.targetCount),
      };
    })
    .filter((p): p is CriteriaParticipantProgress => p !== null)
    // Clasificación: quien más lleva, primero; desempate estable por username. En modo
    // cooperativo el orden no significa ranking, pero mantenerlo hace la lista predecible.
    .sort((a, b) => {
      if (a.rawCompleted !== b.rawCompleted) return b.rawCompleted - a.rawCompleted;
      return a.username.localeCompare(b.username);
    });

  const clubTotal = participants.reduce((sum, p) => sum + p.rawCompleted, 0);

  return {
    config,
    windowStart: windowRow.window_start,
    windowEnd: windowRow.window_end,
    participants,
    clubTotal,
  };
}
