import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { hydrateItems } from "@/lib/library/get-library-items";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { madridToday } from "@/lib/wrap-ups/windows";
import { toProfileCover, type ProfileCover } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type YearRow = { item_type: ItemType; item_id: string; finished_on: string; rating: number | null };
export type YearSummary = {
  year: number;
  total: number;
  /** 12 posiciones, enero = 0. */
  byMonth: number[];
  bestMonth: number | null;
  topRatedKey: string | null;
};
export type ProfileYear = Omit<YearSummary, "topRatedKey"> & { topRated: ProfileCover | null };

export function madridYear(now: Date): number {
  return Number(madridToday(now).slice(0, 4));
}

// `finished_on` es `date`: «2026-07-01» se parte a mano. Con `new Date()` se
// leería como medianoche UTC y en Madrid podría caer en el día (y el mes) de antes.
export function summarizeYear(rows: YearRow[], year: number): YearSummary | null {
  const prefix = `${year}-`;
  const inYear = rows.filter((r) => r.finished_on?.startsWith(prefix));
  if (inYear.length === 0) return null;
  const byMonth = Array.from({ length: 12 }, () => 0);
  for (const r of inYear) byMonth[Number(r.finished_on.slice(5, 7)) - 1] += 1;
  const max = Math.max(...byMonth);
  const bestMonth = byMonth.indexOf(max);
  const rated = inYear
    .filter((r) => r.rating !== null)
    .sort((a, b) => (b.rating! - a.rating!) || b.finished_on.localeCompare(a.finished_on));
  return {
    year,
    total: inYear.length,
    byMonth,
    bestMonth,
    topRatedKey: rated[0] ? `${rated[0].item_type}:${rated[0].item_id}` : null,
  };
}

export async function getProfileYear(
  supabase: SupabaseServerClient,
  userId: string,
  now: Date = new Date(),
): Promise<ProfileYear | null> {
  const year = madridYear(now);
  const rows = await readAllRows((from, to) =>
    supabase
      .from("passes")
      .select("item_type, item_id, finished_on, rating")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("finished_on", `${year}-01-01`)
      .lte("finished_on", `${year}-12-31`)
      .order("id")
      .range(from, to),
  );
  const summary = summarizeYear((rows ?? []) as YearRow[], year);
  if (!summary) return null;
  const { topRatedKey, ...rest } = summary;
  let topRated: ProfileCover | null = null;
  if (topRatedKey) {
    const [item_type, item_id] = topRatedKey.split(":") as [ItemType, string];
    const [hydrated] = await hydrateItems(supabase, userId, [{ item_type, item_id }]);
    topRated = hydrated ? toProfileCover(hydrated) : null;
  }
  return { ...rest, topRated };
}
