import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getItemTitles, keyFor } from "./get-item-titles";
import { type StatsPeriod, periodBounds } from "./period";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type NoteKind = "note" | "quote";

export type NoteRow = {
  item_type: ItemType;
  item_id: string;
  kind: NoteKind;
  /** Páginas de la ficha. `null` = no se sabe, o no es un libro. */
  totalPages: number | null;
};

export type AnnotatedWork = {
  type: ItemType;
  itemId: string;
  /** Lo rellena el getter. El cálculo puro no sabe de títulos. */
  title?: string;
  /** Notas + citas de esa obra. */
  count: number;
  quotes: number;
  totalPages: number;
  /** Anotaciones por cada cien páginas, con un decimal. */
  per100: number;
};

export type NotesPerWork = {
  /** Obras normalizables, de más anotada a menos. */
  works: AnnotatedWork[];
  /** Citas en total, se puedan normalizar o no. */
  quotes: number;
  /** Notas en total. */
  notes: number;
  /**
   * Anotaciones que no se pueden normalizar: sin páginas en ficha, o de una
   * obra que no es un libro. Se cuentan porque son la mitad del denominador.
   */
  unmeasurable: number;
};

/**
 * Las obras que más te hacen escribir.
 *
 * **Normaliza por cada cien páginas, y no por obra**, que es toda la diferencia:
 * sin normalizar, este panel sería un ranking de libros largos. Doce notas en un
 * tocho de mil páginas es menos escritura que cuatro en uno de cien.
 *
 * Cita y nota se cuentan aparte: son dos gestos distintos —copiar lo que dice el
 * libro y decir lo tuyo— y mezclarlos hace que un lector de citas y otro de
 * comentarios se vean iguales.
 *
 * La clave de agrupación es el PAR `item_type` + `item_id`: la referencia a la
 * obra es polimórfica y no hay clave ajena que impida que un libro y una
 * película compartan `item_id`.
 */
export function computeNotesPerWork(rows: NoteRow[]): NotesPerWork {
  const byWork = new Map<string, NoteRow[]>();
  let quotes = 0;
  let notes = 0;
  for (const row of rows) {
    if (row.kind === "quote") quotes += 1;
    else notes += 1;
    const key = keyFor(row.item_type, row.item_id);
    const list = byWork.get(key) ?? [];
    list.push(row);
    byWork.set(key, list);
  }

  const works: AnnotatedWork[] = [];
  let unmeasurable = 0;

  for (const group of byWork.values()) {
    const totalPages = group[0].totalPages;
    if (!totalPages || totalPages <= 0) {
      unmeasurable += group.length;
      continue;
    }
    works.push({
      type: group[0].item_type,
      itemId: group[0].item_id,
      count: group.length,
      quotes: group.filter((r) => r.kind === "quote").length,
      totalPages,
      per100: Math.round((group.length / totalPages) * 100 * 10) / 10,
    });
  }

  works.sort((a, b) => b.per100 - a.per100);
  return { works, quotes, notes, unmeasurable };
}

/**
 * Las notas y citas del DUEÑO. `is_public` no entra en la consulta: es una
 * estadística del usuario sobre sí mismo, y la tabla `notes` es privada de todas
 * formas (su RLS es `auth.uid() = user_id`).
 *
 * **Sin `use cache`**: depende de `auth.uid()` (regla #437).
 */
export async function getNotesPerWork(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
): Promise<NotesPerWork> {
  let query = supabase
    .from("notes")
    .select("item_type, item_id, kind, created_at")
    .eq("user_id", userId);

  const bounds = periodBounds(period);
  if (bounds) {
    query = query
      .gte("created_at", bounds.start)
      .lt("created_at", bounds.endExclusive);
  }

  const { data, error } = await query;
  if (error) throw error;

  const raw = (data ?? []) as { item_type: ItemType; item_id: string; kind: NoteKind }[];
  if (raw.length === 0) {
    return { works: [], quotes: 0, notes: 0, unmeasurable: 0 };
  }

  // Solo los libros tienen una talla contra la que normalizar. Las notas de
  // película y serie se cuentan igual, pero caen en `unmeasurable`.
  const bookIds = [...new Set(raw.filter((r) => r.item_type === "book").map((r) => r.item_id))];
  let pages = new Map<string, number | null>();
  if (bookIds.length > 0) {
    const { data: books, error: bookError } = await supabase
      .from("books")
      .select("id, total_pages")
      .in("id", bookIds);
    if (bookError) throw bookError;
    pages = new Map(
      ((books ?? []) as { id: string; total_pages: number | null }[]).map((b) => [
        b.id,
        b.total_pages,
      ]),
    );
  }

  const result = computeNotesPerWork(
    raw.map((r) => ({
      ...r,
      totalPages: r.item_type === "book" ? (pages.get(r.item_id) ?? null) : null,
    })),
  );
  if (result.works.length === 0) return result;

  const ids: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const w of result.works) ids[w.type].add(w.itemId);
  const titles = await getItemTitles(supabase, ids);

  // Las obras que ya no están en catálogo se caen aquí (issue #272).
  const withTitle = result.works.flatMap((w) => {
    const title = titles.get(keyFor(w.type, w.itemId));
    return title ? [{ ...w, title }] : [];
  });

  return { ...result, works: withTitle };
}
