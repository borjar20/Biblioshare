import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { genreDefForSlug, labelForSlug } from "./genre-vocab";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CatalogCard = {
  itemType: ItemType;
  itemId: string;
  title: string;
  coverUrl: string | null;
  year: number | null;
};

const PAGE_SIZE = 24;

// Obras del CATÁLOGO (no solo del usuario) con un género, mezclando los tres
// tipos. `genres @> ARRAY[label]` vía .contains, apoyado en el índice GIN
// (20260730_genres_gin_indexes.sql). Solo se consultan las tablas cuyo tipo está
// en appliesTo del género — buscar "Ensayo" en movies no tiene sentido. Orden
// alfabético por título (estable, sin depender de agregados); popularidad → issue.
export async function getCatalogByGenre(
  supabase: SupabaseServerClient,
  slug: string,
  { page }: { page: number },
): Promise<{ items: CatalogCard[]; total: number }> {
  const def = genreDefForSlug(slug);
  const label = labelForSlug(slug);
  if (!def || !label) return { items: [], total: 0 };

  const wantBook = def.appliesTo.includes("book");
  const wantMovie = def.appliesTo.includes("movie");
  const wantSeries = def.appliesTo.includes("series");
  const empty = Promise.resolve({ data: [], count: 0, error: null });

  const [books, movies, series] = await Promise.all([
    wantBook
      ? supabase
          .from("books")
          .select("id, title, cover_url, published_year", { count: "exact" })
          .contains("genres", [label])
          .order("title", { ascending: true })
          .range(0, PAGE_SIZE * page - 1)
      : empty,
    wantMovie
      ? supabase
          .from("movies")
          .select("id, title, cover_url, release_year", { count: "exact" })
          .contains("genres", [label])
          .order("title", { ascending: true })
          .range(0, PAGE_SIZE * page - 1)
      : empty,
    wantSeries
      ? supabase
          .from("series")
          .select("id, title, cover_url, release_year", { count: "exact" })
          .contains("genres", [label])
          .order("title", { ascending: true })
          .range(0, PAGE_SIZE * page - 1)
      : empty,
  ]);

  const cards: CatalogCard[] = [];
  for (const r of (books.data ?? []) as any[])
    cards.push({ itemType: "book", itemId: r.id, title: r.title, coverUrl: r.cover_url, year: r.published_year });
  for (const r of (movies.data ?? []) as any[])
    cards.push({ itemType: "movie", itemId: r.id, title: r.title, coverUrl: r.cover_url, year: r.release_year });
  for (const r of (series.data ?? []) as any[])
    cards.push({ itemType: "series", itemId: r.id, title: r.title, coverUrl: r.cover_url, year: r.release_year });

  cards.sort((a, b) => a.title.localeCompare(b.title, "es"));

  const total = (books.count ?? 0) + (movies.count ?? 0) + (series.count ?? 0);
  const from = (page - 1) * PAGE_SIZE;
  return { items: cards.slice(from, from + PAGE_SIZE), total };
}
