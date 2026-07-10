import { createClient } from "@/lib/supabase/server";
import { searchBooks } from "./open-library";
import { searchMovies, searchSeries } from "./tmdb";
import { MOCK_BOOKS, MOCK_MOVIES, MOCK_SERIES } from "./mock-data";
import { normalizeIsbn } from "./isbn";
import { searchLocalCatalog, findLocalBookByIsbn } from "./local-search";
import { findOrCreateCatalogItem } from "./find-or-create";
import { groupBookEditions } from "./group-editions";
import type { ItemType, SearchResult } from "./types";

// See docs/REQUIREMENTS.md §7.32: search checks our own catalog first (free,
// and already has richer data for anything we've seen before), only calls
// the external API for what's missing, and persists newly-seen API results
// right away so the next search for the same item is a local hit.
// Book results are additionally collapsed by work (§7.2) so a shelf of
// near-identical editions shows as one card.
export async function searchCatalog(
  itemType: ItemType,
  query: string
): Promise<SearchResult[]> {
  const results = await searchCatalogRaw(itemType, query);
  return itemType === "book" ? groupBookEditions(results) : results;
}

async function searchCatalogRaw(
  itemType: ItemType,
  query: string
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (process.env.MOCK_EXTERNAL_APIS === "true") {
    return searchMockData(itemType, trimmed);
  }

  const supabase = await createClient();

  // Exact ISBN match: skip Google Books entirely if we already have this
  // edition cached — the clearest "avoid a repeat API call" case, and what
  // the barcode scanner (§7.3) hits on every re-scan of the same book.
  if (itemType === "book") {
    const isbn = normalizeIsbn(trimmed);
    if (isbn) {
      const cached = await findLocalBookByIsbn(supabase, isbn);
      if (cached) return [cached];
    }
  }

  // Local catalog wins outright if it has anything for this title — running
  // local and API in parallel would still call the API on every single
  // search regardless of what's cached, which defeats the point. The
  // trade-off (accepted): once a title has any local match, a repeat search
  // won't discover further/newer API results for it — `/buscar/manual` or a
  // more specific query (e.g. ISBN) remain the way to find something else.
  const localResults = await searchLocalCatalog(supabase, itemType, trimmed);
  if (localResults.length > 0) return localResults;

  const apiResults = await searchExternal(itemType, trimmed);
  return Promise.all(
    apiResults.map(async (r) => {
      // La persistencia es cache oportunista: si el insert falla (p. ej. un
      // visitante anónimo, cuya sesión no puede escribir en el catálogo por
      // RLS), se devuelve el resultado igualmente, solo que sin catalogId.
      try {
        return { ...r, catalogId: await findOrCreateCatalogItem(supabase, r) };
      } catch {
        return r;
      }
    })
  );
}

function searchExternal(itemType: ItemType, query: string): Promise<SearchResult[]> {
  switch (itemType) {
    case "book":
      return searchBooks(query);
    case "movie":
      return searchMovies(query);
    case "series":
      return searchSeries(query);
  }
}

function searchMockData(itemType: ItemType, query: string): SearchResult[] {
  const pool =
    itemType === "book"
      ? MOCK_BOOKS
      : itemType === "movie"
        ? MOCK_MOVIES
        : MOCK_SERIES;

  if (itemType === "book") {
    const isbn = normalizeIsbn(query);
    if (isbn) return pool.filter((item) => item.isbn === isbn);
  }

  const needle = query.toLowerCase();
  return pool.filter(
    (item) =>
      item.title.toLowerCase().includes(needle) ||
      item.subtitle?.toLowerCase().includes(needle)
  );
}
