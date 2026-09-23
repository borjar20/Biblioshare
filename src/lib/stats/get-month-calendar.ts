import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { daysInMonth, shiftMonth } from "./dates";
import type { CalendarDay, MonthCalendar } from "./types";
import { getSeriesDays } from "./series-days";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type SessionRow = {
  session_date: string;
  created_at: string;
  passes:
    | { item_type: ItemType; item_id: string }
    | { item_type: ItemType; item_id: string }[]
    | null;
};

function normalizeEntry(row: SessionRow) {
  const e = row.passes;
  return Array.isArray(e) ? e[0] : e;
}

// Days of `month` ("YYYY-MM") with session activity, each carrying the cover
// of that day's most recent session's item. Covers are resolved in one
// batched pass per catalog table (same pattern as get-library-items).
export async function getMonthCalendar(
  supabase: SupabaseServerClient,
  userId: string,
  month: string
): Promise<MonthCalendar> {
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;

  // Las sesiones cuelgan del pase (pass_id, §Tarea 9, hub); item_type/item_id
  // ya no se resuelven vía library_entries sino uniendo con el propio pase.
  //
  // Series (fase 4, D3): su actividad son los episodios vistos, no sesiones.
  // Las sesiones de serie antiguas se excluyen: sus episodios ya están en
  // episode_watches y saldrían dos veces.
  const [{ data, error }, seriesDays] = await Promise.all([
    supabase
      .from("progress_sessions")
      .select("session_date, created_at, passes!inner(item_type, item_id)")
      .eq("user_id", userId)
      .neq("passes.item_type", "series")
      .gte("session_date", monthStart)
      .lte("session_date", monthEnd),
    getSeriesDays(supabase, userId, {
      start: monthStart,
      endExclusive: `${shiftMonth(month, 1)}-01`,
    }),
  ]);

  if (error) throw error;

  // Lo último de cada día, venga de una sesión o de un episodio: se ordena por
  // (día, momento de registro) y el último gana.
  const activity: { day: string; at: string; itemType: ItemType; itemId: string }[] = [];
  for (const row of (data ?? []) as SessionRow[]) {
    const entry = normalizeEntry(row);
    if (!entry) continue;
    activity.push({
      day: row.session_date,
      at: row.created_at,
      itemType: entry.item_type,
      itemId: entry.item_id,
    });
  }
  for (const d of seriesDays)
    activity.push({ day: d.day, at: d.lastAt, itemType: "series", itemId: d.seriesId });
  activity.sort((a, b) => (a.day === b.day ? a.at.localeCompare(b.at) : a.day.localeCompare(b.day)));

  const latestByDay = new Map<string, { itemType: ItemType; itemId: string }>();
  const idsByType: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const a of activity) {
    latestByDay.set(a.day, { itemType: a.itemType, itemId: a.itemId });
    idsByType[a.itemType].add(a.itemId);
  }

  const coverByKey = new Map<string, string | null>();
  const [books, series] = await Promise.all([
    idsByType.book.size
      ? supabase.from("books").select("id, cover_url").in("id", [...idsByType.book])
      : Promise.resolve({ data: [] }),
    idsByType.series.size
      ? supabase.from("series").select("id, cover_url").in("id", [...idsByType.series])
      : Promise.resolve({ data: [] }),
  ]);
  for (const row of books.data ?? []) coverByKey.set(`book:${row.id}`, row.cover_url);
  for (const row of series.data ?? []) coverByKey.set(`series:${row.id}`, row.cover_url);

  const total = daysInMonth(month);
  const days: CalendarDay[] = [];
  for (let day = 1; day <= total; day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const item = latestByDay.get(date);
    days.push({
      date,
      active: item !== undefined,
      coverUrl: item ? coverByKey.get(`${item.itemType}:${item.itemId}`) ?? null : null,
    });
  }

  return {
    month,
    days,
    prevMonth: shiftMonth(month, -1),
    nextMonth: shiftMonth(month, 1),
  };
}
