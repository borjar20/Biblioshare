import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { ItemFilter } from "./filter";
import { type StatsPeriod, inPeriod, periodBounds } from "./period";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Un nombre y cuántas obras distintas suyas hay en el período. */
export type NamedCount = { name: string; works: number };

/** Recuento de una faceta + cuántos de sus nombres son nuevos. */
export type Facet = {
  top: NamedCount[];
  /** Nombres del período que no aparecían antes. Sin «antes», todos son nuevos. */
  discovered: number;
  /** Nombres distintos del período. */
  total: number;
};

const EMPTY_FACET: Facet = { top: [], discovered: 0, total: 0 };

export type CatalogBreakdown = {
  // Géneros más frecuentes entre las obras terminadas del período (todos los
  // tipos), de mayor a menor.
  genres: { name: string; count: number }[];
  // Autores (de libro) más leídos, por número de obras distintas.
  authors: NamedCount[];
  // Directores (de película) más vistos.
  directors: NamedCount[];
  // Editoriales de los libros terminados.
  publishers: NamedCount[];
  // Décadas de publicación, de más reciente a más antigua.
  decades: { decade: number; count: number }[];
  // Descubrimiento por faceta: cuántos autores/directores son nuevos.
  authorFacet: Facet;
  directorFacet: Facet;
  // Compat con los paneles que ya leían estos dos nombres.
  newAuthors: number;
  totalAuthors: number;
};

const EMPTY: CatalogBreakdown = {
  genres: [],
  authors: [],
  directors: [],
  publishers: [],
  decades: [],
  authorFacet: EMPTY_FACET,
  directorFacet: EMPTY_FACET,
  newAuthors: 0,
  totalAuthors: 0,
};

type BookRow = {
  id: string;
  author: string | null;
  publisher: string | null;
  genres: string[] | null;
  published_year: number | null;
};
type ScreenRow = {
  id: string;
  director?: string | null;
  genres: string[] | null;
  release_year: number | null;
};

/**
 * Desglose de catálogo: géneros, autores, directores, editoriales y décadas de
 * lo terminado en el período, más cuántos autores y directores son nuevos.
 * Cruza los pases terminados con books/movies/series.
 *
 * Cuenta obras DISTINTAS: una relectura no infla los géneros ni las décadas —
 * si no, quien relee su libro favorito cada año se vería un gusto que no tiene.
 */
export async function getCatalogBreakdown(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
  itemFilter: ItemFilter = "all",
): Promise<CatalogBreakdown> {
  let query = supabase
    .from("passes")
    .select("item_type, item_id, finished_on")
    .eq("user_id", userId)
    .in("status", ["completed", "dropped"]);
  if (itemFilter !== "all") query = query.eq("item_type", itemFilter);

  const { data, error } = await query;

  if (error) throw error;

  const rows = (data ?? []) as {
    item_type: ItemType;
    item_id: string;
    finished_on: string | null;
  }[];

  // Obras distintas terminadas EN el período, y las terminadas ANTES (para
  // saber qué autores y directores ya se conocían).
  const start = periodBounds(period)?.start ?? null;
  const inPeriodItems = new Map<string, ItemType>(); // `${type}:${id}` → type
  const beforeIds: Record<"book" | "movie", Set<string>> = {
    book: new Set(),
    movie: new Set(),
  };
  for (const row of rows) {
    const key = `${row.item_type}:${row.item_id}`;
    if (inPeriod(row.finished_on, period)) {
      inPeriodItems.set(key, row.item_type);
    } else if (start && row.finished_on && row.finished_on < start && row.item_type !== "series") {
      beforeIds[row.item_type].add(row.item_id);
    }
  }

  if (inPeriodItems.size === 0) return EMPTY;

  const idsByType: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const [key, type] of inPeriodItems) {
    idsByType[type].add(key.slice(type.length + 1));
  }
  // Los de "antes" también se hidratan, solo por su autor o su director.
  const bookIds = new Set([...idsByType.book, ...beforeIds.book]);
  const movieIds = new Set([...idsByType.movie, ...beforeIds.movie]);

  const [books, movies, series] = await Promise.all([
    bookIds.size
      ? supabase
          .from("books")
          .select("id, author, publisher, genres, published_year")
          .in("id", [...bookIds])
      : Promise.resolve({ data: [] }),
    movieIds.size
      ? supabase
          .from("movies")
          .select("id, director, genres, release_year")
          .in("id", [...movieIds])
      : Promise.resolve({ data: [] }),
    idsByType.series.size
      ? supabase
          .from("series")
          .select("id, genres, release_year")
          .in("id", [...idsByType.series])
      : Promise.resolve({ data: [] }),
  ]);

  const bookById = new Map(((books.data ?? []) as BookRow[]).map((b) => [b.id, b]));
  const movieById = new Map(((movies.data ?? []) as ScreenRow[]).map((m) => [m.id, m]));
  const seriesById = new Map(((series.data ?? []) as ScreenRow[]).map((s) => [s.id, s]));

  const genreCounts = new Map<string, number>();
  const decadeCounts = new Map<number, number>();
  const authorWorks = new Map<string, number>();
  const directorWorks = new Map<string, number>();
  const publisherWorks = new Map<string, number>();

  function addGenres(genres: string[] | null) {
    for (const g of genres ?? []) {
      const name = g?.trim();
      if (name) genreCounts.set(name, (genreCounts.get(name) ?? 0) + 1);
    }
  }
  function addYear(year: number | null) {
    if (year && year > 0) {
      const decade = Math.floor(year / 10) * 10;
      decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
    }
  }
  function bump(map: Map<string, number>, raw: string | null | undefined) {
    const name = raw?.trim();
    if (name) map.set(name, (map.get(name) ?? 0) + 1);
  }

  for (const [key, type] of inPeriodItems) {
    const id = key.slice(type.length + 1);
    if (type === "book") {
      const b = bookById.get(id);
      if (!b) continue;
      addGenres(b.genres);
      addYear(b.published_year);
      bump(authorWorks, b.author);
      bump(publisherWorks, b.publisher);
    } else {
      const row = type === "movie" ? movieById.get(id) : seriesById.get(id);
      if (!row) continue;
      addGenres(row.genres);
      addYear(row.release_year);
      if (type === "movie") bump(directorWorks, row.director);
    }
  }

  // Nombres ya conocidos ANTES del período, por faceta.
  const knownAuthors = new Set<string>();
  for (const id of beforeIds.book) {
    const name = bookById.get(id)?.author?.trim();
    if (name) knownAuthors.add(name);
  }
  const knownDirectors = new Set<string>();
  for (const id of beforeIds.movie) {
    const name = movieById.get(id)?.director?.trim();
    if (name) knownDirectors.add(name);
  }

  const authorFacet = toFacet(authorWorks, knownAuthors);
  const directorFacet = toFacet(directorWorks, knownDirectors);

  return {
    genres: [...genreCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    authors: authorFacet.top,
    directors: directorFacet.top,
    publishers: rank(publisherWorks),
    decades: [...decadeCounts.entries()]
      .map(([decade, count]) => ({ decade, count }))
      .sort((a, b) => b.decade - a.decade),
    authorFacet,
    directorFacet,
    newAuthors: authorFacet.discovered,
    totalAuthors: authorFacet.total,
  };
}

function rank(counts: Map<string, number>): NamedCount[] {
  return [...counts.entries()]
    .map(([name, works]) => ({ name, works }))
    .sort((a, b) => b.works - a.works);
}

function toFacet(counts: Map<string, number>, known: Set<string>): Facet {
  let discovered = 0;
  for (const name of counts.keys()) if (!known.has(name)) discovered++;
  return { top: rank(counts), discovered, total: counts.size };
}
