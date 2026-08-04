import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { toISODate, todayISO } from "./dates";
import type { DayActivity } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const DAYS = 7;

// Last 7 days (oldest → today) with total *reading* minutes per day.
// A day counts as "active" when finished an item of ANY type (not just reading).
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
    days.push({
      date: toISODate(d),
      minutes: 0,
      active: false,
      works: 0,
      byType: { book: 0, movie: 0, series: 0 },
    });
  }
  const rangeStart = days[0].date;

  // Minutos de lectura (solo libros) para el objetivo diario, y finales de
  // cualquier tipo para "día activo" (una peli no tiene sesión pero sí final).
  const [reading, finished] = await Promise.all([
    supabase
      .from("progress_sessions")
      .select("session_date, duration_minutes, passes!inner(item_type)")
      .eq("user_id", userId)
      .eq("passes.item_type", "book")
      .gte("session_date", rangeStart)
      .lte("session_date", todayISO()),
    supabase
      .from("passes")
      .select("finished_on, item_type")
      .eq("user_id", userId)
      .not("finished_on", "is", null)
      .gte("finished_on", rangeStart)
      .lte("finished_on", todayISO()),
  ]);

  if (reading.error) throw reading.error;
  if (finished.error) throw finished.error;

  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const row of reading.data ?? []) {
    const bucket = byDate.get(row.session_date);
    if (!bucket) continue;
    bucket.active = true;
    bucket.minutes += row.duration_minutes ?? 0;
  }
  for (const row of finished.data ?? []) {
    const bucket = byDate.get(row.finished_on as string);
    if (!bucket) continue;
    bucket.active = true;
    bucket.works += 1;
    bucket.byType[row.item_type as ItemType] += 1;
  }

  return days;
}
