import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { type StatsPeriod, yearBounds } from "./period";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TypeDistribution = {
  book: number;
  movie: number;
  series: number;
  total: number;
};

// Distribución por tipo de las obras TERMINADAS en el período (frame J, donuts).
// Cuenta pases con `finished_on`, no la biblioteca actual: es "qué consumiste",
// no "qué tienes". Ver docs/REQUIREMENTS.md §7.14.
export async function getTypeDistribution(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
): Promise<TypeDistribution> {
  let query = supabase
    .from("passes")
    .select("item_type")
    .eq("user_id", userId)
    .not("finished_on", "is", null);

  if (period !== "all") {
    const { start, endExclusive } = yearBounds(period);
    query = query.gte("finished_on", start).lt("finished_on", endExclusive);
  }

  const { data, error } = await query;
  if (error) throw error;

  const counts = { book: 0, movie: 0, series: 0 };
  for (const row of (data ?? []) as { item_type: ItemType }[]) {
    counts[row.item_type]++;
  }
  return { ...counts, total: counts.book + counts.movie + counts.series };
}
