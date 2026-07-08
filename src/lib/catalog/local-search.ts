import type { createClient } from "@/lib/supabase/server";
import { normalizeIsbn } from "./isbn";
import type { ItemType, SearchResult } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type BookRow = {
  id: string;
  google_books_id: string | null;
  title: string;
  author: string | null;
  cover_url: string | null;
  published_year: number | null;
  publisher: string | null;
  total_pages: number | null;
  isbn: string | null;
  synopsis: string | null;
  genres: string[] | null;
};

type ScreenRow = {
  id: string;
  tmdb_id: number | null;
  title: string;
  cover_url: string | null;
  release_year: number | null;
  synopsis: string | null;
  genres: string[] | null;
};

function mapBookRow(row: BookRow): SearchResult {
  return {
    itemType: "book",
    externalId: row.google_books_id ?? row.id,
    catalogId: row.id,
    title: row.title,
    subtitle: row.author,
    coverUrl: row.cover_url,
    year: row.published_year,
    synopsis: row.synopsis,
    genres: row.genres,
    publisher: row.publisher,
    pageCount: row.total_pages,
    isbn: row.isbn,
  };
}

function mapScreenRow(itemType: "movie" | "series", row: ScreenRow): SearchResult {
  return {
    itemType,
    externalId: row.tmdb_id !== null ? String(row.tmdb_id) : row.id,
    catalogId: row.id,
    title: row.title,
    subtitle: null,
    coverUrl: row.cover_url,
    year: row.release_year,
    synopsis: row.synopsis,
    genres: row.genres,
    publisher: null,
    pageCount: null,
    isbn: null,
  };
}

// Look up a book by exact ISBN in our own catalog — used to skip the
// Google Books call entirely for a barcode scan / ISBN search we've already
// cached. See docs/REQUIREMENTS.md §7.32.
export async function findLocalBookByIsbn(
  supabase: SupabaseServerClient,
  isbn: string
): Promise<SearchResult | null> {
  const { data } = await supabase
    .from("books")
    .select(
      "id, google_books_id, title, author, cover_url, published_year, publisher, total_pages, isbn, synopsis, genres"
    )
    .eq("isbn", isbn)
    .maybeSingle();

  return data ? mapBookRow(data) : null;
}

// Fuzzy title search over our own catalog, run alongside the external API
// search so already-cached items don't need re-fetching/re-inserting.
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
      .select(
        "id, google_books_id, title, author, cover_url, published_year, publisher, total_pages, isbn, synopsis, genres"
      )
      .ilike("title", `%${query}%`)
      .limit(20);
    return (data ?? []).map(mapBookRow);
  }

  const table = itemType === "movie" ? "movies" : "series";
  const { data } = await supabase
    .from(table)
    .select("id, tmdb_id, title, cover_url, release_year, synopsis, genres")
    .ilike("title", `%${query}%`)
    .limit(20);
  return (data ?? []).map((row) => mapScreenRow(itemType as "movie" | "series", row));
}
