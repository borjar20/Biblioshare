import type { createClient } from "@/lib/supabase/server";
import { toISODate, todayISO } from "./dates";
import type { DayActivity } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const DAYS = 7;

// Last 7 days (oldest → today) with total session minutes per day.
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

  const { data, error } = await supabase
    .from("progress_sessions")
    .select("session_date, duration_minutes")
    .eq("user_id", userId)
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
