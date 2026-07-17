import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { type StatsPeriod, inPeriod, yearBounds } from "./period";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CatalogBreakdown = {
  // Géneros más frecuentes entre las obras terminadas del período (todos los
  // tipos), de mayor a menor.
  genres: { name: string; count: number }[];
  // Autores (de libro) más leídos, por número de obras distintas.
  authors: { name: string; works: number }[];
  // Décadas de publicación, de más reciente a más antigua.
  decades: { decade: number; count: number }[];
  // Autores del período que no se habían leído antes / autores distintos del
  // período. En "Todo" no hay "antes", así que todos son nuevos.
  newAuthors: number;
  totalAuthors: number;
};

const EMPTY: CatalogBreakdown = {
  genres: [],
  authors: [],
  decades: [],
  newAuthors: 0,
  totalAuthors: 0,
};

// Desglose de catálogo del muro (frame J): géneros, autores y décadas de lo
// terminado en el período, más cuántos autores son nuevos. Cruza los pases
// terminados con books/movies/series. Cuenta obras DISTINTAS: una relectura no
// infla los géneros ni las décadas. Ver docs/REQUIREMENTS.md §7.14.
export async function getCatalogBreakdown(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
): Promise<CatalogBreakdown> {
  const { data, error } = await supabase
    .from("passes")
    .select("item_type, item_id, finished_on")
    .eq("user_id", userId)
    .not("finished_on", "is", null);

  if (error) throw error;

  const rows = (data ?? []) as {
    item_type: ItemType;
    item_id: string;
    finished_on: string;
  }[];

  // Obras distintas terminadas EN el período, y los libros terminados ANTES del
  // período (para saber qué autores ya se habían leído).
  const start = period === "all" ? null : yearBounds(period).start;
  const inPeriodItems = new Map<string, ItemType>(); // `${type}:${id}` → type
  const beforeBookIds = new Set<string>();
  for (const row of rows) {
    const key = `${row.item_type}:${row.item_id}`;
    if (inPeriod(row.finished_on, period)) {
      inPeriodItems.set(key, row.item_type);
    } else if (row.item_type === "book" && start && row.finished_on < start) {
      beforeBookIds.add(row.item_id);
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
  // Los libros de "antes" también se hidratan, solo por su autor.
  const bookIds = new Set([...idsByType.book, ...beforeBookIds]);

  const [books, movies, series] = await Promise.all([
    bookIds.size
      ? supabase
          .from("books")
          .select("id, author, genres, published_year")
          .in("id", [...bookIds])
      : Promise.resolve({ data: [] }),
    idsByType.movie.size
      ? supabase
          .from("movies")
          .select("id, genres, release_year")
          .in("id", [...idsByType.movie])
      : Promise.resolve({ data: [] }),
    idsByType.series.size
      ? supabase
          .from("series")
          .select("id, genres, release_year")
          .in("id", [...idsByType.series])
      : Promise.resolve({ data: [] }),
  ]);

  const bookById = new Map(
    ((books.data ?? []) as {
      id: string;
      author: string | null;
      genres: string[] | null;
      published_year: number | null;
    }[]).map((b) => [b.id, b]),
  );

  const genreCounts = new Map<string, number>();
  const decadeCounts = new Map<number, number>();
  const authorWorks = new Map<string, number>();

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

  for (const [key, type] of inPeriodItems) {
    const id = key.slice(type.length + 1);
    if (type === "book") {
      const b = bookById.get(id);
      if (!b) continue;
      addGenres(b.genres);
      addYear(b.published_year);
      const author = b.author?.trim();
      if (author) authorWorks.set(author, (authorWorks.get(author) ?? 0) + 1);
    } else {
      const source = (type === "movie" ? movies.data : series.data) ?? [];
      const row = (source as { id: string; genres: string[] | null; release_year: number | null }[]).find(
        (r) => r.id === id,
      );
      if (!row) continue;
      addGenres(row.genres);
      addYear(row.release_year);
    }
  }

  // Autores nuevos: los del período sin ningún libro terminado antes.
  const beforeAuthors = new Set<string>();
  for (const id of beforeBookIds) {
    const author = bookById.get(id)?.author?.trim();
    if (author) beforeAuthors.add(author);
  }
  const totalAuthors = authorWorks.size;
  let newAuthors = 0;
  for (const author of authorWorks.keys()) {
    if (!beforeAuthors.has(author)) newAuthors++;
  }

  return {
    genres: [...genreCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    authors: [...authorWorks.entries()]
      .map(([name, works]) => ({ name, works }))
      .sort((a, b) => b.works - a.works),
    decades: [...decadeCounts.entries()]
      .map(([decade, count]) => ({ decade, count }))
      .sort((a, b) => b.decade - a.decade),
    newAuthors,
    totalAuthors,
  };
}
