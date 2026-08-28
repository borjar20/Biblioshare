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
  synopsis: string | null;
  genres: string[] | null;
  wikidata_id: string | null;
};

// Solo para desempatar duplicados en `findLocalBookByIsbn` (ver su cabecera).
// No forma parte de `BOOK_COLUMNS`: nunca sale en un `SearchResult`.
type BookRowWithCreatedAt = BookRow & { created_at: string };

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

// Sin `publisher`, `total_pages` NI `isbn`: son datos de la tirada, viven en
// `book_editions` y una tarjeta de búsqueda no los muestra. El ISBN de la
// tirada encontrada llega aparte, como `matchedIsbn`, solo en el camino de
// `findLocalBookByIsbn` — ver su cabecera.
const BOOK_COLUMNS =
  "id, openlibrary_work_key, title, author, cover_url, published_year, synopsis, genres, wikidata_id";

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
    // Un QID ya persistido ancla la identidad sin depender de que el título
    // case con un label de Inventaire hoy (ver wikidata-collapse.ts).
    ...(row.wikidata_id ? { wikidataId: row.wikidata_id } : {}),
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
//
// El ISBN vive en `book_editions` (spec §1 del plan obra/edición/representación):
// `books.isbn` era el espejo de la «edición primaria», un concepto que ese plan
// elimina, y esa columna cae en la fase destructiva (Task 16) — aquí ya se deja
// de leerla. Inner join a propósito: una edición huérfana (su `book_id` fue
// borrado, o el borrado en cascada aún no corrió) no es un resultado de
// búsqueda válido.
//
// El índice único de `book_editions` es `(book_id, isbn)`, NO `isbn` global: el
// mismo ISBN puede estar atado a dos `book_id` distintos cuando hay libros
// duplicados sin fusionar (issue #899, hermana de #898 — aquí en dev hay 13
// ISBN así, p. ej. "Dune" existe dos veces). Por eso NO se puede pedir un solo
// resultado sin más: se traen todas las ediciones con ese ISBN y, si hay más de
// un libro, se desempata quedándose con el más antiguo (`created_at` de
// `books`, ya viene en el mismo join, no complica la query) — es la mejor
// aproximación barata a "el libro que la gente ya tiene en su biblioteca",
// hasta que alguien pase `merge_book_into` sobre el duplicado.
export async function findLocalBookByIsbn(
  supabase: SupabaseServerClient,
  isbn: string
): Promise<SearchResult | null> {
  const { data } = await supabase
    .from("book_editions")
    .select(`isbn, book:books!inner(${BOOK_COLUMNS}, created_at)`)
    .eq("isbn", isbn);
  if (!data || data.length === 0) return null;

  // postgrest-js tipa el join como array cuando no puede probar la
  // cardinalidad, igual que en event-detail.ts y calendar.ts.
  const books = data
    .map((row) => (Array.isArray(row.book) ? row.book[0] : row.book))
    .filter((book): book is BookRowWithCreatedAt => Boolean(book));
  if (books.length === 0) return null;

  const oldest = books.reduce((a, b) =>
    new Date(a.created_at).getTime() <= new Date(b.created_at).getTime() ? a : b
  );

  return { ...mapBookRow(oldest), matchedIsbn: isbn };
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
