import type { createClient } from "@/lib/supabase/server";
import { UNTITLED_FALLBACK } from "./untitled";
import { normalizeIsbn } from "./isbn";
import type { ItemType, SearchResult } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type BookRow = {
  id: string;
  openlibrary_work_key: string | null;
  title: string | null;
  author: string | null;
  cover_url: string | null;
  published_year: number | null;
  isbn: string | null;
  synopsis: string | null;
  genres: string[] | null;
};

type ScreenRow = {
  id: string;
  tmdb_id: number | null;
  title: string | null;
  original_title: string | null;
  cover_url: string | null;
  release_year: number | null;
  synopsis: string | null;
  genres: string[] | null;
};

// `title` (es-ES) + `original_title` (idioma de rodaje). Se seleccionan ambos
// para que el matcher de importación case por cualquiera. Ver decisiones.md.
const SCREEN_COLUMNS =
  "id, tmdb_id, title, original_title, cover_url, release_year, synopsis, genres";

// Sin `publisher` ni `total_pages`: son datos de la tirada, viven en
// `book_editions` y una tarjeta de búsqueda no los muestra.
const BOOK_COLUMNS =
  "id, openlibrary_work_key, title, author, cover_url, published_year, isbn, synopsis, genres";

function mapBookRow(row: BookRow): SearchResult {
  return {
    itemType: "book",
    // La work key es la clave de fusión con los resultados de la API
    // (merge-results.ts). Un libro sin ella (alta manual, import antiguo) se
    // queda con string vacío: no fusiona con nada, pero tampoco se pierde.
    externalId: row.openlibrary_work_key ?? "",
    catalogId: row.id,
    title: row.title ?? UNTITLED_FALLBACK,
    subtitle: row.author,
    coverUrl: row.cover_url,
    year: row.published_year,
    synopsis: row.synopsis,
    genres: row.genres,
    // `books.isbn` es el espejo de la edición primaria. Se conserva aquí para que
    // el lookup por ISBN de un libro ya cacheado siga sabiendo qué tirada es.
    ...(row.isbn ? { matchedIsbn: row.isbn } : {}),
  };
}

function mapScreenRow(itemType: "movie" | "series", row: ScreenRow): SearchResult {
  return {
    itemType,
    externalId: row.tmdb_id !== null ? String(row.tmdb_id) : "",
    catalogId: row.id,
    title: row.title ?? UNTITLED_FALLBACK,
    originalTitle: row.original_title,
    subtitle: null,
    coverUrl: row.cover_url,
    year: row.release_year,
    synopsis: row.synopsis,
    genres: row.genres,
  };
}

// Busca un libro por ISBN exacto en nuestro propio catálogo. Es el ÚNICO atajo
// que salta la llamada a OpenLibrary: un ISBN identifica una tirada concreta (el
// escáner de código de barras), así que si ya la tenemos, no hay nada que
// preguntar. Ver docs/REQUIREMENTS.md §7.32.
export async function findLocalBookByIsbn(
  supabase: SupabaseServerClient,
  isbn: string
): Promise<SearchResult | null> {
  const { data } = await supabase
    .from("books")
    .select(BOOK_COLUMNS)
    .eq("isbn", isbn)
    .maybeSingle();

  return data ? mapBookRow(data) : null;
}

// Búsqueda difusa por título en nuestro catálogo. Ya no SUSTITUYE a la de la API:
// corre en paralelo con ella y se fusionan por externalId (ver search.ts).
export async function searchLocalCatalog(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  query: string
): Promise<SearchResult[]> {
  if (itemType === "book") {
    const isbn = normalizeIsbn(query);
    if (isbn) {
      const match = await findLocalBookByIsbn(supabase, isbn);
      return match ? [match] : [];
    }

    const { data } = await supabase
      .from("books")
      .select(BOOK_COLUMNS)
      .ilike("title", `%${query}%`)
      .limit(20);
    return (data ?? []).map(mapBookRow);
  }

  const table = itemType === "movie" ? "movies" : "series";
  // Se busca en `title` (es-ES) Y `original_title`: un CSV de Letterboxd trae el
  // título original, que puede no coincidir con el `title` traducido cacheado.
  // Las comas/paréntesis separan condiciones en el filtro `or` de PostgREST, así
  // que se sustituyen por espacios (el ilike ya es difuso por contención).
  const safe = query.replace(/[,()]/g, " ").trim();
  const like = `%${safe}%`;
  const { data } = await supabase
    .from(table)
    .select(SCREEN_COLUMNS)
    .or(`title.ilike.${like},original_title.ilike.${like}`)
    .limit(20);
  return (data ?? []).map((row) => mapScreenRow(itemType as "movie" | "series", row));
}
