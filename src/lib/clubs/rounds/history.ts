"use server";

import { createClient } from "@/lib/supabase/server";
import { getInteractionSummary } from "@/lib/social/get-interaction-summary";
import type { RoundHistoryEntry } from "./types";

const DEFAULT_WEEKS = 4;

/** Últimas `weeks` SEMANAS de calendario de un club, sin contar la actual --
 *  no solo las rondas que existen (issue #403): una semana muerta (nadie
 *  propuso, nadie respondió a la casa) sale con `prompt: null` en su sitio
 *  cronológico en vez de faltar sin más. La serie de semanas ISO la genera
 *  `list_club_round_weeks` en SQL -- ver su comentario en la migración
 *  `20260814_club_round_history_weeks` -- por la misma razón por la que el
 *  periodo actual tampoco se calcula en TS. */
export async function listRoundHistory(
  clubId: string,
  currentPeriodKey: string,
  weeks: number = DEFAULT_WEEKS,
): Promise<RoundHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_club_round_weeks", {
    p_club_id: clubId,
    p_weeks: weeks,
  });
  if (error) throw error;

  // La RPC ya excluye la semana de HOY por construcción (su rango es
  // -weeks..-1), pero un `ronda=` histórico (issue #408) puede pedir excluir
  // otra distinta -- la que ya se está pintando arriba de este bloque, para
  // no listarla dos veces.
  const rows = (data ?? []).filter((r) => r.period_key !== currentPeriodKey);

  // getInteractionSummary exige un interaction_target real por id que le
  // pases: una semana "Sin ronda" no tiene fila en club_rounds y por tanto no
  // tiene uno -- se deja fuera del lote en vez de mandarle un id inventado.
  const existingIds = rows.filter((r) => r.round_id).map((r) => r.round_id);
  const summaries = await getInteractionSummary(supabase, "club_round", existingIds);
  return rows.map((r) => ({
    periodKey: r.period_key,
    prompt: r.prompt,
    answerCount: r.round_id ? (summaries.get(r.round_id)?.commentCount ?? 0) : 0,
  }));
}
