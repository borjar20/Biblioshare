"use server";

import { createClient } from "@/lib/supabase/server";
import { getInteractionSummary } from "@/lib/social/interactions";
import type { RoundHistoryEntry } from "./types";

const DEFAULT_WEEKS = 4;

/** Últimas `weeks` rondas ya escritas de un club, sin contar la actual.
 *  Lista las rondas que EXISTEN, no la serie completa de semanas ISO hacia
 *  atrás -- ver el comentario de `RoundHistoryEntry`. */
export async function listRoundHistory(
  clubId: string,
  currentPeriodKey: string,
  weeks: number = DEFAULT_WEEKS,
): Promise<RoundHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("club_rounds")
    .select("id, period_key, prompt")
    .eq("club_id", clubId)
    .neq("period_key", currentPeriodKey)
    .order("period_key", { ascending: false })
    .limit(weeks);
  if (error) throw error;

  const rows = data ?? [];
  const summaries = await getInteractionSummary(
    supabase,
    "club_round",
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    periodKey: r.period_key,
    prompt: r.prompt,
    answerCount: summaries.get(r.id)?.commentCount ?? 0,
  }));
}
