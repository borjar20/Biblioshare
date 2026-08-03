import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getItemTitles, keyFor } from "./get-item-titles";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TbrSnapshot = {
  pending: number;
  byType: Record<ItemType, number>;
  oldest: { title: string; type: ItemType; monthsWaiting: number } | null;
};

type Row = { item_type: ItemType; item_id: string; created_at: string };

// Meses naturales completos entre dos instantes (>= 0).
function monthsBetween(from: Date, to: Date): number {
  const m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(0, m);
}

// Lógica pura: cuenta pendientes por tipo y localiza el más antiguo (por
// created_at). No hidrata el título — eso lo hace el getter.
export function computeTbrSnapshot(rows: Row[], now: Date) {
  const byType: Record<ItemType, number> = { book: 0, movie: 0, series: 0 };
  let oldest: { type: ItemType; id: string; created: string } | null = null;

  for (const row of rows) {
    byType[row.item_type] += 1;
    if (!oldest || row.created_at < oldest.created) {
      oldest = { type: row.item_type, id: row.item_id, created: row.created_at };
    }
  }

  const pending = byType.book + byType.movie + byType.series;
  const oldestId = oldest
    ? {
        type: oldest.type,
        id: oldest.id,
        monthsWaiting: monthsBetween(new Date(oldest.created), now),
      }
    : null;

  return { byType, pending, oldestId };
}

// "La pila" (docs/REQUIREMENTS.md §7.14): foto del momento — pendientes ahora,
// desglose por tipo y la obra que lleva más tiempo esperando. Todo desde
// `passes` activos en estado 'planned'. Sustituye al antiguo flujo mensual, que
// contaba como "añadido" cualquier pase creado (bug: el historial importado
// inflaba el crecimiento). Ver spec 2026-08-03.
export async function getTbrSnapshot(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<TbrSnapshot> {
  const { data, error } = await supabase
    .from("passes")
    .select("item_type, item_id, created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("status", "planned");

  if (error) throw error;

  const { byType, pending, oldestId } = computeTbrSnapshot(
    (data ?? []) as Row[],
    new Date(),
  );

  let oldest: TbrSnapshot["oldest"] = null;
  if (oldestId) {
    const ids: Record<ItemType, Set<string>> = {
      book: new Set(),
      movie: new Set(),
      series: new Set(),
    };
    ids[oldestId.type].add(oldestId.id);
    const titles = await getItemTitles(supabase, ids);
    const title = titles.get(keyFor(oldestId.type, oldestId.id));
    if (title) {
      oldest = { title, type: oldestId.type, monthsWaiting: oldestId.monthsWaiting };
    }
  }

  return { pending, byType, oldest };
}
