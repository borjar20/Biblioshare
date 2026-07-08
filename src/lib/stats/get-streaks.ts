import type { createClient } from "@/lib/supabase/server";
import { todayISO, addDaysISO } from "./dates";
import type { Streaks } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Current and best run of consecutive days with at least one session.
// Fetches only the date column (cheap) and computes in JS.
export async function getStreaks(
  supabase: SupabaseServerClient,
  userId: string
): Promise<Streaks> {
  const { data, error } = await supabase
    .from("progress_sessions")
    .select("session_date")
    .eq("user_id", userId);

  if (error) throw error;

  const activeDays = new Set((data ?? []).map((row) => row.session_date));
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
