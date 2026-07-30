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
// Tope de seguridad por tabla: sin `.order`/`.range` en la query, un género
// patológicamente popular podría traer toda la tabla. SAFETY_LIMIT acota el
// fetch; el total mostrado sigue siendo exacto (viene de `count`), solo el
// material paginable se recorta. Con el catálogo actual ningún género se
// acerca a esta cifra, pero si algún día la supera, un ítem podría quedar
// fuera de todas las páginas otra vez (mismo síntoma, umbral más alto) —
// haría falta paginación keyset de verdad. Seguimiento: issue #305.
const SAFETY_LIMIT = 500;

// Obras del CATÁLOGO (no solo del usuario) con un género, mezclando los tres
// tipos. `genres @> ARRAY[label]` vía .contains, apoyado en el índice GIN
// (20260815_genres_gin_indexes.sql). Solo se consultan las tablas cuyo tipo está
// en appliesTo del género — buscar "Ensayo" en movies no tiene sentido.
// Orden y paginación se hacen ENTERAMENTE en JS (localeCompare "es") sobre el
// conjunto completo de matches por tabla (hasta SAFETY_LIMIT filas): el orden
// por defecto de Postgres (`.order`) diverge del orden de locale español,
// sobre todo con diacríticos (á/é/í/ó/ú/ñ), así que paginar en la query con
// `.range` podía dejar un ítem fuera de TODAS las páginas. Sin `.order` ni
// `.range` per-page aquí a propósito.
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
          .limit(SAFETY_LIMIT)
      : empty,
    wantMovie
      ? supabase
          .from("movies")
          .select("id, title, cover_url, release_year", { count: "exact" })
          .contains("genres", [label])
          .limit(SAFETY_LIMIT)
      : empty,
    wantSeries
      ? supabase
          .from("series")
          .select("id, title, cover_url, release_year", { count: "exact" })
          .contains("genres", [label])
          .limit(SAFETY_LIMIT)
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
