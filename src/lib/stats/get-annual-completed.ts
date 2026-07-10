import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { AnnualCompleted, MonthlyCompleted } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type Row = {
  finished_on: string;
  library_entries: { item_type: ItemType };
};

// Items completed per month of `year`, counted from diary_entries.finished_on
// (all item types, including movies — a movie has no session but a finish).
// The !inner join to library_entries carries the item type, so the same read
// feeds both the combined bar chart and the per-type annual goals (§7.14).
export async function getAnnualCompleted(
  supabase: SupabaseServerClient,
  userId: string,
  year: number
): Promise<AnnualCompleted> {
  const months: MonthlyCompleted[] = [];
  for (let m = 1; m <= 12; m++) {
    months.push({ month: `${year}-${String(m).padStart(2, "0")}`, count: 0 });
  }

  const { data, error } = await supabase
    .from("diary_entries")
    .select("finished_on, library_entries!inner(item_type)")
    .eq("user_id", userId)
    .gte("finished_on", `${year}-01-01`)
    .lte("finished_on", `${year}-12-31`);

  if (error) throw error;

  const byMonth = new Map(months.map((m) => [m.month, m]));
  const byType: Record<ItemType, number> = { book: 0, movie: 0, series: 0 };
  let total = 0;
  for (const row of (data ?? []) as unknown as Row[]) {
    const bucket = byMonth.get(row.finished_on.slice(0, 7));
    if (bucket) {
      bucket.count += 1;
      byType[row.library_entries.item_type] += 1;
      total += 1;
    }
  }

  return { year, months, total, byType };
}
