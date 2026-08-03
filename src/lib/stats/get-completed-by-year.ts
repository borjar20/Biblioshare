import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type YearCompleted = {
  year: number;
  book: number;
  movie: number;
  series: number;
  total: number;
};

type Row = { finished_on: string; item_type: ItemType };

// Lógica pura: obras terminadas por año y tipo, del primer año con datos al
// actual, rellenando los años intermedios sin datos con ceros (para que el eje
// no tenga huecos). Sin filas → lista vacía.
export function computeCompletedByYear(rows: Row[], currentYear: number): YearCompleted[] {
  if (rows.length === 0) return [];

  const byYear = new Map<number, YearCompleted>();
  let minYear = currentYear;
  for (const row of rows) {
    const year = Number(row.finished_on.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    minYear = Math.min(minYear, year);
    const bucket =
      byYear.get(year) ?? { year, book: 0, movie: 0, series: 0, total: 0 };
    bucket[row.item_type] += 1;
    bucket.total += 1;
    byYear.set(year, bucket);
  }

  const out: YearCompleted[] = [];
  for (let y = minYear; y <= currentYear; y++) {
    out.push(byYear.get(y) ?? { year: y, book: 0, movie: 0, series: 0, total: 0 });
  }
  return out;
}

// Completadas por año (spec 2026-08-03): el dato más rico de un historial largo.
// Todo desde `passes` con `finished_on`, sin período (siempre toda la historia).
export async function getCompletedByYear(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<YearCompleted[]> {
  const { data, error } = await supabase
    .from("passes")
    .select("finished_on, item_type")
    .eq("user_id", userId)
    .not("finished_on", "is", null);

  if (error) throw error;

  return computeCompletedByYear(
    (data ?? []) as Row[],
    new Date().getFullYear(),
  );
}
