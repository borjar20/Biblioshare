import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { ItemFilter } from "./filter";
import { type StatsPeriod, periodBounds } from "./period";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type Records = {
  // Mes (YYYY-MM) con más obras terminadas.
  mostActiveMonth: { month: string; count: number } | null;
  // Libro terminado más rápido: días entre empezar a leerlo y terminarlo.
  fastestBook: { title: string; days: number } | null;
  // Pases que no son el primero de su obra: relecturas y re-visionados.
  rereads: number;
};

// Récords del muro (frames B/G). Todo sale de `passes`: mes más activo, libro
// más rápido y cuántos re-pases. La mejor racha se pinta aparte (getStreaks, que
// la pestaña ya trae). Ver docs/REQUIREMENTS.md §7.14.
export async function getRecords(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
  itemFilter: ItemFilter = "all",
): Promise<Records> {
  let query = supabase
    .from("passes")
    .select("item_type, item_id, finished_on, created_at, started_on")
    .eq("user_id", userId);

  // Con período, los récords son los de lo TERMINADO en él; sin él se calculan
  // sobre toda la historia, como siempre.
  const bounds = periodBounds(period);
  if (bounds) {
    query = query
      .gte("finished_on", bounds.start)
      .lt("finished_on", bounds.endExclusive);
  }
  if (itemFilter !== "all") query = query.eq("item_type", itemFilter);

  const { data, error } = await query;

  if (error) throw error;

  const rows = (data ?? []) as {
    item_type: ItemType;
    item_id: string;
    finished_on: string | null;
    created_at: string;
    started_on: string | null;
  }[];

  // Mes más activo (por terminados).
  const byMonth = new Map<string, number>();
  // Re-pases: total pases − obras distintas.
  const seenItems = new Set<string>();
  let total = 0;
  // Libro más rápido: menos días entre el inicio de la lectura (started_on) y
  // el fin (finished_on). Fallback a created_at para el historial importado sin
  // started_on (issue #361: started_on solo se rellena de forma fiable a futuro).
  let fastestBookId: string | null = null;
  let fastestDays = Infinity;

  for (const row of rows) {
    total += 1;
    seenItems.add(`${row.item_type}:${row.item_id}`);

    if (row.finished_on) {
      const month = row.finished_on.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + 1);

      if (row.item_type === "book") {
        const start = row.started_on ?? row.created_at.slice(0, 10);
        const days = daysBetween(start, row.finished_on);
        if (days !== null && days < fastestDays) {
          fastestDays = days;
          fastestBookId = row.item_id;
        }
      }
    }
  }

  let mostActiveMonth: Records["mostActiveMonth"] = null;
  for (const [month, count] of byMonth) {
    if (!mostActiveMonth || count > mostActiveMonth.count) {
      mostActiveMonth = { month, count };
    }
  }

  // Título del libro más rápido, best-effort (un solo id).
  let fastestBook: Records["fastestBook"] = null;
  if (fastestBookId && Number.isFinite(fastestDays)) {
    const { data: book } = await supabase
      .from("books")
      .select("title")
      .eq("id", fastestBookId)
      .maybeSingle();
    if (book?.title) fastestBook = { title: book.title, days: fastestDays };
  }

  return {
    mostActiveMonth,
    fastestBook,
    rereads: total - seenItems.size,
  };
}

// Días naturales entre dos fechas YYYY-MM-DD (>= 0), o null si el orden es raro.
function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000);
}
