import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getItemTitles, keyFor } from "./get-item-titles";
import { type StatsPeriod, yearBounds } from "./period";
import { toStar } from "./rating";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TopRatedItem = { title: string; type: ItemType; rating: number };
export type RatedRow = { item_type: ItemType; item_id: string; rating: number };

// Lógica pura: mejores notas primero, cortadas a `limit`. Ordenación estable
// suficiente para la tarjeta (empates por nota se dejan en el orden de entrada).
export function pickTopRated(rows: RatedRow[], limit: number): RatedRow[] {
  return [...rows].sort((a, b) => b.rating - a.rating).slice(0, limit);
}

// Mejor valoradas del período (spec 2026-08-03): obras terminadas con nota, de
// mayor a menor, hidratando el título por tipo. Contar el pase con más nota de
// cada obra no hace falta afinar: una relectura mejor valorada solo sube.
export async function getTopRated(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
  limit = 6,
): Promise<TopRatedItem[]> {
  let query = supabase
    .from("passes")
    .select("item_type, item_id, rating, finished_on")
    .eq("user_id", userId)
    .not("rating", "is", null);

  if (period !== "all") {
    const { start, endExclusive } = yearBounds(period);
    query = query.gte("finished_on", start).lt("finished_on", endExclusive);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = ((data ?? []) as (RatedRow & { finished_on: string | null })[]).map(
    ({ item_type, item_id, rating }) => ({ item_type, item_id, rating }),
  );
  const top = pickTopRated(rows, limit);
  if (top.length === 0) return [];

  const ids: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const r of top) ids[r.item_type].add(r.item_id);
  const titles = await getItemTitles(supabase, ids);

  const out: TopRatedItem[] = [];
  for (const r of top) {
    const title = titles.get(keyFor(r.item_type, r.item_id));
    if (title) out.push({ title, type: r.item_type, rating: toStar(r.rating) });
  }
  return out;
}
