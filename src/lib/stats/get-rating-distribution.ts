import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type RatingDistribution = {
  // Media en escala /5 (la nota interna es 1–10, se muestra con 5 puntos).
  average: number | null;
  count: number;
  // De 5★ a 1★, en ese orden (como el histograma del muro).
  buckets: { star: number; count: number }[];
};

// Nota interna 1–10 → estrella 1–5 (cada estrella = 2 puntos): 1-2→1 … 9-10→5.
function toStar(rating: number): number {
  return Math.min(5, Math.max(1, Math.ceil(rating / 2)));
}

// Valoración media + histograma, desde las notas de los pases terminados
// (passes.rating, escala 1–10). Un pase sin nota no cuenta. Ver frame B/G del
// mockup Perfil v2 y docs/REQUIREMENTS.md §7.14.
export async function getRatingDistribution(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<RatingDistribution> {
  const { data, error } = await supabase
    .from("passes")
    .select("rating")
    .eq("user_id", userId)
    .not("rating", "is", null);

  if (error) throw error;

  const rows = (data ?? []) as { rating: number }[];
  const byStar = new Map<number, number>([
    [5, 0],
    [4, 0],
    [3, 0],
    [2, 0],
    [1, 0],
  ]);
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
    buckets: [5, 4, 3, 2, 1].map((star) => ({ star, count: byStar.get(star) ?? 0 })),
  };
}
