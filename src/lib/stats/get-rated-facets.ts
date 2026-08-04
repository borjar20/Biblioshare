// §5 del esquema, la parte que no es el histograma: qué géneros, autores y
// directores valoras mejor, y si la duración de una obra tiene algo que ver con
// la nota que le pones.
//
// La trampa de estos rankings es el tamaño de muestra. Un autor del que has
// leído UN libro y le has puesto 5★ encabeza la lista por encima de aquel del
// que has leído nueve con una media de 4,6 — y esa lista no dice nada sobre tus
// gustos, dice que hiciste una prueba con suerte. Por eso hay mínimo de dos
// obras y el recuento viaja SIEMPRE junto a la media.

import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { ItemFilter } from "./filter";
import { type StatsPeriod, periodBounds } from "./period";
import { toStar } from "./rating";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Media en escala /5 y sobre cuántas obras se calculó. */
export type RatedGroup = { name: string; average: number; works: number };

export type RatedFacets = {
  genres: RatedGroup[];
  authors: RatedGroup[];
  directors: RatedGroup[];
  /**
   * Duración (páginas en libros, minutos en pantalla) contra nota. Sirve para
   * la nube de puntos de «¿te gustan más las largas?». Se devuelven separadas
   * por tipo porque páginas y minutos no comparten eje.
   */
  lengthVsRating: { type: ItemType; title: string; length: number; star: number }[];
};

/** Mínimo de obras para que un nombre entre en un ranking de nota. */
export const MIN_WORKS = 2;

const EMPTY: RatedFacets = { genres: [], authors: [], directors: [], lengthVsRating: [] };

type PassRow = {
  item_type: ItemType;
  item_id: string;
  rating: number;
  finished_on: string | null;
};

export async function getRatedFacets(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
  itemFilter: ItemFilter = "all",
): Promise<RatedFacets> {
  let query = supabase
    .from("passes")
    .select("item_type, item_id, rating, finished_on")
    .eq("user_id", userId)
    .not("rating", "is", null);

  const bounds = periodBounds(period);
  if (bounds) {
    query = query
      .gte("finished_on", bounds.start)
      .lt("finished_on", bounds.endExclusive);
  }
  if (itemFilter !== "all") query = query.eq("item_type", itemFilter);

  const { data, error } = await query;
  if (error) throw error;

  // Una nota por OBRA: la más alta de sus pases, igual que en «mejor
  // valoradas». Releer y puntuar dos veces no da doble voto.
  const best = new Map<string, PassRow>();
  for (const row of (data ?? []) as PassRow[]) {
    const key = `${row.item_type}:${row.item_id}`;
    const seen = best.get(key);
    if (!seen || row.rating > seen.rating) best.set(key, row);
  }
  if (best.size === 0) return EMPTY;

  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const row of best.values()) idsByType[row.item_type].push(row.item_id);

  const [books, movies, series] = await Promise.all([
    idsByType.book.length
      ? supabase
          .from("books")
          .select("id, title, author, genres, total_pages")
          .in("id", idsByType.book)
      : Promise.resolve({ data: [] }),
    idsByType.movie.length
      ? supabase
          .from("movies")
          .select("id, title, director, genres, duration_minutes")
          .in("id", idsByType.movie)
      : Promise.resolve({ data: [] }),
    idsByType.series.length
      ? supabase.from("series").select("id, title, genres").in("id", idsByType.series)
      : Promise.resolve({ data: [] }),
  ]);

  type CatalogRow = {
    id: string;
    title: string;
    author?: string | null;
    director?: string | null;
    genres: string[] | null;
    total_pages?: number | null;
    duration_minutes?: number | null;
  };
  const byKey = new Map<string, CatalogRow>();
  for (const b of (books.data ?? []) as CatalogRow[]) byKey.set(`book:${b.id}`, b);
  for (const m of (movies.data ?? []) as CatalogRow[]) byKey.set(`movie:${m.id}`, m);
  for (const s of (series.data ?? []) as CatalogRow[]) byKey.set(`series:${s.id}`, s);

  const genres = new Accumulator();
  const authors = new Accumulator();
  const directors = new Accumulator();
  const lengthVsRating: RatedFacets["lengthVsRating"] = [];

  for (const [key, pass] of best) {
    const item = byKey.get(key);
    if (!item) continue;
    // La media se lleva en la escala INTERNA (1–10) y se convierte al final:
    // promediar estrellas ya redondeadas pierde medio punto por obra.
    for (const g of item.genres ?? []) {
      const name = g?.trim();
      if (name) genres.add(name, pass.rating);
    }
    const author = item.author?.trim();
    if (author) authors.add(author, pass.rating);
    const director = item.director?.trim();
    if (director) directors.add(director, pass.rating);

    const length =
      pass.item_type === "book" ? item.total_pages : item.duration_minutes ?? null;
    if (length && length > 0) {
      lengthVsRating.push({
        type: pass.item_type,
        title: item.title,
        length,
        star: toStar(pass.rating),
      });
    }
  }

  return {
    genres: genres.rank(),
    authors: authors.rank(),
    directors: directors.rank(),
    lengthVsRating,
  };
}

/** Suma y cuenta por nombre; ordena por media con mínimo de muestra. */
class Accumulator {
  private sums = new Map<string, { sum: number; works: number }>();

  add(name: string, rating: number) {
    const cell = this.sums.get(name) ?? { sum: 0, works: 0 };
    cell.sum += rating;
    cell.works += 1;
    this.sums.set(name, cell);
  }

  rank(): RatedGroup[] {
    return [...this.sums.entries()]
      .filter(([, c]) => c.works >= MIN_WORKS)
      .map(([name, c]) => ({ name, average: c.sum / c.works / 2, works: c.works }))
      .sort((a, b) => b.average - a.average || b.works - a.works);
  }
}
