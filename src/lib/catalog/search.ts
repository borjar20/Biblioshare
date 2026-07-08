import { searchBooks } from "./google-books";
import { searchMovies, searchSeries } from "./tmdb";
import { MOCK_BOOKS, MOCK_MOVIES, MOCK_SERIES } from "./mock-data";
import type { ItemType, SearchResult } from "./types";

export async function searchCatalog(
  itemType: ItemType,
  query: string
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  if (process.env.MOCK_EXTERNAL_APIS === "true") {
    return searchMockData(itemType, query);
  }

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

  const needle = query.trim().toLowerCase();
  return pool.filter(
    (item) =>
      item.title.toLowerCase().includes(needle) ||
      item.subtitle?.toLowerCase().includes(needle)
  );
}
