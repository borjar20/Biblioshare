import { createClient } from "@/lib/supabase/server";
import { searchBooks } from "./google-books";
import { searchMovies, searchSeries } from "./tmdb";
import { MOCK_BOOKS, MOCK_MOVIES, MOCK_SERIES } from "./mock-data";
import { normalizeIsbn } from "./isbn";
import { searchLocalCatalog, findLocalBookByIsbn } from "./local-search";
import { findOrCreateCatalogItem } from "./find-or-create";
import type { ItemType, SearchResult } from "./types";

// See docs/REQUIREMENTS.md §7.32: search checks our own catalog first (free,
// and already has richer data for anything we've seen before), only calls
// the external API for what's missing, and persists newly-seen API results
// right away so the next search for the same item is a local hit.
export async function searchCatalog(
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

  const [localResults, apiResults] = await Promise.all([
    searchLocalCatalog(supabase, itemType, trimmed),
    searchExternal(itemType, trimmed),
  ]);

  const localKeys = new Set<string>();
  for (const r of localResults) for (const key of resultKeys(r)) localKeys.add(key);

  const newApiResults = apiResults.filter(
    (r) => ![...resultKeys(r)].some((key) => localKeys.has(key))
  );

  const persisted = await Promise.all(
    newApiResults.map(async (r) => ({
      ...r,
      catalogId: await findOrCreateCatalogItem(supabase, r),
    }))
  );

  return [...localResults, ...persisted];
}

function resultKeys(result: SearchResult): string[] {
  const keys = [`ext:${result.itemType}:${result.externalId}`];
  if (result.itemType === "book" && result.isbn) keys.push(`isbn:${result.isbn}`);
  return keys;
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
