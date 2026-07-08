import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { daysInMonth, shiftMonth } from "./dates";
import type { CalendarDay, MonthCalendar } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type SessionRow = {
  session_date: string;
  created_at: string;
  library_entries:
    | { item_type: ItemType; item_id: string }
    | { item_type: ItemType; item_id: string }[]
    | null;
};

function normalizeEntry(row: SessionRow) {
  const e = row.library_entries;
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

  const { data, error } = await supabase
    .from("progress_sessions")
    .select("session_date, created_at, library_entries!inner(item_type, item_id)")
    .eq("user_id", userId)
    .gte("session_date", monthStart)
    .lte("session_date", monthEnd)
    .order("session_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  // Latest session per day (rows are ascending, so the last one wins).
  const latestByDay = new Map<string, { itemType: ItemType; itemId: string }>();
  const idsByType: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const row of (data ?? []) as SessionRow[]) {
    const entry = normalizeEntry(row);
    if (!entry) continue;
    latestByDay.set(row.session_date, {
      itemType: entry.item_type,
      itemId: entry.item_id,
    });
    idsByType[entry.item_type].add(entry.item_id);
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
