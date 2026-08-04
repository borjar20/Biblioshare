import type { createClient } from "@/lib/supabase/server";
import type { ItemFilter } from "./filter";
import { type StatsPeriod, periodBounds } from "./period";
import { toStar } from "./rating";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type RatingDistribution = {
  // Media en escala /5 (la nota interna es 1–10, se muestra con 5 puntos).
  average: number | null;
  count: number;
  /**
   * De 5★ a 0,5★ en pasos de MEDIA estrella: diez cubos, uno por cada valor de
   * la nota interna. No cinco. Agrupar de dos en dos metía cada nota impar en
   * la columna de la estrella siguiente, y entonces la moda y la mediana salían
   * medio punto por encima de la media de la misma tarjeta.
   */
  buckets: { star: number; count: number }[];
};

// Valoración media + histograma, desde las notas de los pases terminados
// (passes.rating, escala 1–10). Un pase sin nota no cuenta. Ver frame B/G del
// mockup Perfil v2 y docs/REQUIREMENTS.md §7.14.
export async function getRatingDistribution(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
  itemFilter: ItemFilter = "all",
): Promise<RatingDistribution> {
  let query = supabase
    .from("passes")
    .select("rating")
    .eq("user_id", userId)
    .not("rating", "is", null);

  // Acotar por período cuenta las notas de lo TERMINADO en él; sin período
  // cuenta todas las notas, terminadas o no, como siempre.
  const bounds = periodBounds(period);
  if (bounds) {
    query = query
      .gte("finished_on", bounds.start)
      .lt("finished_on", bounds.endExclusive);
  }
  if (itemFilter !== "all") query = query.eq("item_type", itemFilter);

  const { data, error } = await query;

  if (error) throw error;

  const rows = (data ?? []) as { rating: number }[];
  // Los diez cubos, de 5★ a 0,5★. El orden de inserción es el que sale.
  const byStar = new Map<number, number>();
  for (let internal = 10; internal >= 1; internal--) byStar.set(internal / 2, 0);
  let sum = 0;
  for (const { rating } of rows) {
    sum += rating;
    const star = toStar(rating);
    byStar.set(star, (byStar.get(star) ?? 0) + 1);
  }

  const count = rows.length;
  return {
    // La media también en /5: la interna /10 dividida entre 2.
    average: count > 0 ? sum / count / 2 : null,
    count,
    buckets: [...byStar].map(([star, bucketCount]) => ({ star, count: bucketCount })),
  };
}
