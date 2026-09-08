import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { ItemFilter } from "./filter";
import { getItemTitles, keyFor } from "./get-item-titles";
import { toStar } from "./rating";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Un pase cerrado con su nota. **`rating` viene YA en estrellas**: la conversión
 * desde la nota interna 1–10 la hace el getter con `toStar`, para que el cálculo
 * puro no tenga que saber en qué escala está guardado el dato.
 */
export type RereadRow = {
  item_type: ItemType;
  item_id: string;
  rating: number | null;
  finished_on: string | null;
};

export type RereadWork = {
  type: ItemType;
  itemId: string;
  /** Lo rellena el getter. El cálculo puro no sabe de títulos. */
  title?: string;
  /** Nota del PRIMER pase cerrado, en estrellas. */
  first: number;
  /** Nota del ÚLTIMO, en estrellas. */
  latest: number;
  /** `latest - first`. Cero es una respuesta, no una ausencia. */
  change: number;
  /** Cuántos pases cerrados tiene la obra. Siempre ≥ 2. */
  passes: number;
};

export type Rereads = {
  /** Obras releídas y valoradas en los dos extremos, de más cambio a menos. */
  works: RereadWork[];
  /** Media de los cambios, en estrellas. `null` si no hay ninguna medible. */
  averageChange: number | null;
  /**
   * Relecturas que NO entran en `works` por faltar la nota en alguno de los dos
   * extremos. Es el denominador honesto: sin él, «has releído 3 obras y todas te
   * gustaron más» esconde las otras siete que no llegaste a valorar dos veces.
   */
  unratedRereads: number;
  /** Obras con dos pases cerrados o más, tengan nota o no. */
  totalRereadWorks: number;
};

/**
 * Cómo cambia tu nota al releer.
 *
 * El esquema lleva esto desde el principio y nadie lo miraba: **el pase es dueño
 * de la nota**, así que cada relectura puede tener la suya. Hasta aquí, lo único
 * que se sacaba de ahí era un contador (`records.rereads`).
 *
 * Compara el PRIMER pase con el ÚLTIMO, nunca con el del medio: la pregunta es
 * «¿qué te parece ahora frente a la primera vez?», no el recorrido.
 *
 * La clave de agrupación es el PAR `item_type` + `item_id`. La referencia a la
 * obra es polimórfica y **no hay clave ajena**, así que un libro y una película
 * pueden compartir `item_id` sin ser la misma obra; agrupar solo por `item_id`
 * fundiría dos obras distintas en una relectura inventada.
 */
export function computeRereads(rows: RereadRow[]): Rereads {
  const byWork = new Map<string, RereadRow[]>();
  for (const row of rows) {
    const key = keyFor(row.item_type, row.item_id);
    const list = byWork.get(key) ?? [];
    list.push(row);
    byWork.set(key, list);
  }

  const works: RereadWork[] = [];
  let unratedRereads = 0;
  let totalRereadWorks = 0;

  for (const passes of byWork.values()) {
    if (passes.length < 2) continue;
    totalRereadWorks += 1;
    // Por fecha, no por el orden en que llegan las filas: Postgres no promete
    // ninguno sin `order by`, y aquí el orden ES el dato.
    if (passes.some((p) => p.finished_on === null)) {
      // Count the repeat, but do not claim a chronological rating delta.
      unratedRereads += 1;
      continue;
    }
    passes.sort((a, b) => (a.finished_on ?? "").localeCompare(b.finished_on ?? ""));
    const first = passes[0];
    const latest = passes[passes.length - 1];
    if (first.rating === null || latest.rating === null) {
      unratedRereads += 1;
      continue;
    }
    works.push({
      type: first.item_type,
      itemId: first.item_id,
      first: first.rating,
      latest: latest.rating,
      // Se redondea a un decimal porque las estrellas van de media en media y
      // la resta de dos flotantes deja colas de coma que no significan nada.
      change: Math.round((latest.rating - first.rating) * 10) / 10,
      passes: passes.length,
    });
  }

  // De más cambio a menos, en valor absoluto: lo que este panel enseña es
  // CUÁNTO te movió releer, y bajar tres estrellas es tan hallazgo como subirlas.
  works.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  const averageChange =
    works.length === 0
      ? null
      : Math.round((works.reduce((sum, w) => sum + w.change, 0) / works.length) * 10) / 10;

  return { works, averageChange, unratedRereads, totalRereadWorks };
}

/**
 * Los pases CERRADOS con fecha de fin, de todo el histórico.
 *
 * Sin periodo a propósito: una relectura son dos pases separados por años, y
 * recortarlos a la ventana elegida dejaría fuera justo el primero, que es la
 * mitad de la comparación. El panel lo declara en su alcance.
 *
 * **Sin `use cache`**: depende de `auth.uid()` por RLS (regla #437).
 */
export async function getRereads(
  supabase: SupabaseServerClient,
  userId: string,
  itemFilter: ItemFilter = "all",
): Promise<Rereads> {
  let query = supabase
    .from("passes")
    .select("item_type, item_id, rating, finished_on")
    .eq("user_id", userId)
    .eq("status", "completed");
  if (itemFilter !== "all") query = query.eq("item_type", itemFilter);

  const { data, error } = await query;
  if (error) throw error;

  const rows: RereadRow[] = ((data ?? []) as RereadRow[]).map((r) => ({
    ...r,
    // La escala interna es 1–10 y la visible tiene diez peldaños de media
    // estrella. Se convierte AQUÍ para que el cálculo puro no dependa de ella.
    rating: r.rating === null ? null : toStar(r.rating),
  }));

  const result = computeRereads(rows);
  if (result.works.length === 0) return result;

  const ids: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const w of result.works) ids[w.type].add(w.itemId);
  const titles = await getItemTitles(supabase, ids);

  // Las obras que ya no están en catálogo se caen aquí, y es lo correcto: la
  // cuenta que importa es la de pases CON obra en catálogo (issue #272). El
  // trigger `forbid_delete_with_passes` lo cierra desde 2026-08-04, pero las
  // filas anteriores pueden seguir colgando.
  const withTitle = result.works.flatMap((w) => {
    const title = titles.get(keyFor(w.type, w.itemId));
    return title ? [{ ...w, title }] : [];
  });

  return { ...result, works: withTitle };
}
