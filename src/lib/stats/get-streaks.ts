import type { createClient } from "@/lib/supabase/server";
import { todayISO, addDaysISO } from "./dates";
import type { Streaks } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Current and best run of consecutive days with at least one activity.
//
// "Activity" is deliberately broader than the weekly strip's reading minutes
// (§7.14): a day counts if you logged a session of ANY type, or finished an
// item. Otherwise a movie night — which records a diary entry and no session —
// would break a streak. Fetches only the date columns (cheap), computes in JS.
export async function getStreaks(
  supabase: SupabaseServerClient,
  userId: string
): Promise<Streaks> {
  const [sessions, finished] = await Promise.all([
    supabase.from("progress_sessions").select("session_date").eq("user_id", userId),
    // Un pase abierto todavía no ha terminado nada ese día: no cuenta para
    // la racha.
    supabase
      .from("diary_entries")
      .select("finished_on")
      .eq("user_id", userId)
      .not("finished_on", "is", null),
  ]);

  if (sessions.error) throw sessions.error;
  if (finished.error) throw finished.error;

  const activeDays = new Set([
    ...(sessions.data ?? []).map((row) => row.session_date),
    // El filtro anterior garantiza finished_on no nulo; se narrowa aquí
    // porque Supabase no infiere el tipo a partir de la query.
    ...(finished.data ?? [])
      .filter((row): row is { finished_on: string } => row.finished_on !== null)
      .map((row) => row.finished_on),
  ]);
  if (activeDays.size === 0) return { current: 0, best: 0 };

  // Sorted unique days, ascending.
  const days = [...activeDays].sort();

  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === addDaysISO(days[i - 1], 1)) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
  }

  // Current streak: count back from today (or yesterday, so a gap-free run
  // that hasn't logged yet *today* still counts as ongoing).
  const today = todayISO();
  let cursor = activeDays.has(today) ? today : addDaysISO(today, -1);
  let current = 0;
  while (activeDays.has(cursor)) {
    current += 1;
    cursor = addDaysISO(cursor, -1);
  }

  return { current, best };
}
