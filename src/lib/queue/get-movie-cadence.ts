import type { createClient } from "@/lib/supabase/server";
import { addDaysISO, todayISO } from "@/lib/stats/dates";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const WINDOW_DAYS = 90;
const MIN_MOVIE_SAMPLES = 2;

export type MoviePace = { moviesPerWeek: number; sampleCount: number } | null;

// Movies aren't session-tracked (§7.14 scope), so their completion cadence
// comes from diary_entries instead — a coarser, frequency-based estimate
// ("~1.2 películas/semana"), deliberately kept separate from the
// minutes-based pace used for books/series. See docs/REQUIREMENTS.md §7.22.
export async function getMoviePace(
  supabase: SupabaseServerClient,
  userId: string
): Promise<MoviePace> {
  const windowStart = addDaysISO(todayISO(), -WINDOW_DAYS);

  const { count, error } = await supabase
    .from("diary_entries")
    .select("id, library_entries!inner(item_type)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("library_entries.item_type", "movie")
    .gte("finished_on", windowStart);

  if (error) throw error;
  const sampleCount = count ?? 0;
  if (sampleCount < MIN_MOVIE_SAMPLES) return null;

  return { moviesPerWeek: sampleCount / (WINDOW_DAYS / 7), sampleCount };
}
