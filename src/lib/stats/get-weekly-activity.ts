import type { createClient } from "@/lib/supabase/server";
import { toISODate, todayISO } from "./dates";
import type { DayActivity } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const DAYS = 7;

// Last 7 days (oldest → today) with total *reading* minutes per day.
//
// Only book sessions carry minutes (§7.14): movies never had sessions, and
// series sessions no longer record a duration. The !inner join on item_type —
// the same one getBookPace uses — also keeps pre-change series rows, which
// still hold a duration_minutes, out of the total.
export async function getWeeklyActivity(
  supabase: SupabaseServerClient,
  userId: string
): Promise<DayActivity[]> {
  const now = new Date();
  const days: DayActivity[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ date: toISODate(d), minutes: 0, active: false });
  }
  const rangeStart = days[0].date;

  // Las sesiones cuelgan del pase (pass_id, §Tarea 9, hub); item_type ya no
  // se resuelve vía library_entries sino uniendo con el propio pase — si no,
  // las sesiones de pases nuevos (library_entry_id null) desaparecerían de
  // esta tira.
  const { data, error } = await supabase
    .from("progress_sessions")
    .select("session_date, duration_minutes, diary_entries!inner(item_type)")
    .eq("user_id", userId)
    .eq("diary_entries.item_type", "book")
    .gte("session_date", rangeStart)
    .lte("session_date", todayISO());

  if (error) throw error;

  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const row of data ?? []) {
    const bucket = byDate.get(row.session_date);
    if (!bucket) continue;
    bucket.active = true;
    bucket.minutes += row.duration_minutes ?? 0;
  }

  return days;
}
