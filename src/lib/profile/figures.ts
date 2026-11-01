import type { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const RATING_MIN_COUNT = 3;

// Media de las notas de sus pases TERMINADOS (cada relectura cuenta: el pase es
// el dueño de la nota). Con menos de 3 notas una media dice poco, así que se
// pinta «—» (spec §4).
export function summarizeRatings(ratings: number[]): { average: number | null; count: number } {
  const count = ratings.length;
  if (count < RATING_MIN_COUNT) return { average: null, count };
  return { average: ratings.reduce((a, b) => a + b, 0) / count, count };
}

/** La nota va de 1 a 10 y los dots pintan 5: la cifra se enseña en su escala. */
export function formatAverage(average: number): string {
  return (average / 2).toLocaleString("es", { maximumFractionDigits: 1 });
}

export async function getProfileRating(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<{ average: number | null; count: number }> {
  const rows = await readAllRows((from, to) =>
    supabase
      .from("passes")
      .select("rating")
      .eq("user_id", userId)
      .eq("status", "completed")
      .not("rating", "is", null)
      .order("id")
      .range(from, to),
  );
  return summarizeRatings((rows ?? []).map((r) => r.rating as number));
}
