"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCriteriaChallengeProgress } from "./criteria-challenge";
import type { ClubActivity } from "./core";

// Progreso de las tarjetas de la pestaña Actividades (spec 2026-08-12).
//
// NADA de esto lleva `use cache`, ni puede llevarlo: `viewer` depende de
// auth.uid(), así que una entrada compartida serviría el progreso de un miembro
// a otro (regla #437). No se ve con una sola cuenta abierta en desarrollo.
export type ActivityProgress = {
  /** null cuando no hay denominador: sin él NO se pinta barra. */
  collective: { done: number; total: number } | null;
  /** null si quien mira no participa. */
  viewer: { done: number; total: number } | null;
  participants: number;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

function ratio(done: number, total: number): { done: number; total: number } | null {
  return total > 0 ? { done, total } : null;
}

export async function getActivitiesProgress(
  activities: Pick<ClubActivity, "id" | "kind">[],
): Promise<Map<string, ActivityProgress>> {
  const result = new Map<string, ActivityProgress>();
  if (activities.length === 0) return result;

  const { supabase, userId } = await requireUser();

  const porRpc = activities.filter((a) => a.kind !== "criteria_challenge" && a.kind !== "evento");
  const porMotor = activities.filter((a) => a.kind === "criteria_challenge");

  if (porRpc.length > 0) {
    const { data, error } = await supabase.rpc("get_activities_progress", {
      p_activity_ids: porRpc.map((a) => a.id),
    });
    if (error) throw error;
    for (const row of data ?? []) {
      result.set(row.activity_id, {
        collective: ratio(row.collective_done, row.collective_total),
        viewer: ratio(row.viewer_done, row.viewer_total),
        participants: row.participants,
      });
    }
  }

  // criteria_challenge no pasa por la RPC -- la migración 20260853 la excluye en
  // el propio SQL (WHERE kind not in ('evento','criteria_challenge')), así que
  // ni siquiera hace falta el filtro de arriba para estar a salvo, aunque se deja
  // porque es lo que decide qué actividades van por cada camino. Su conteo
  // depende del criterio (género, saga) sobre el catálogo y vive en
  // countForChallenge. Duplicarlo en SQL sería un segundo motor de conteo. Se
  // paga una llamada por actividad, acotado porque esto solo se pide para el
  // grupo "En curso".
  const criteria = await Promise.all(
    porMotor.map(async (a) => [a.id, await getCriteriaChallengeProgress(a.id)] as const),
  );
  for (const [id, view] of criteria) {
    if (!view) continue; // sin criterio configurado todavía -- sin denominador, sin tarjeta de progreso
    const meta = view.config.targetCount;
    const mio = view.participants.find((p) => p.userId === userId);

    // El agregado colectivo que conjeturaba el brief -- ratio(clubTotal, meta *
    // participantes) -- no corresponde a ningún dato real: "meta * participantes"
    // no es un denominador que exista en ningún sitio de este feature, y
    // clubTotal (Σ rawCompleted de todos) no se compara nunca contra él. El ÚNICO
    // agregado colectivo que ya existe en producción es el de
    // criteria-challenge-board.tsx (H4): en modo cooperativo el club comparte UNA
    // meta (`targetCount`, sin multiplicar) y clubTotal progresa hacia ella
    // (board.tsx: `Math.min(clubTotal, config.targetCount) / config.targetCount`).
    // En modo competitivo no hay barra colectiva en ningún sitio -- cada
    // participante corre contra su propia meta y lo único que se enseña es el
    // ranking -- así que aquí collective es null, mismo criterio que "sin
    // denominador, sin barra". Se usa la semántica que YA existe, no una nueva.
    const collective =
      view.config.mode === "cooperative" ? ratio(Math.min(view.clubTotal, meta), meta) : null;

    result.set(id, {
      collective,
      // `completed`, no `rawCompleted`: completed viene YA capado a targetCount,
      // que es lo que un ratio done/total necesita para una barra -- rawCompleted
      // puede superar la meta y daría porcentajes por encima del 100%.
      viewer: mio ? ratio(mio.completed, meta) : null,
      participants: view.participants.length,
    });
  }

  return result;
}
