import { searchBooks } from "./google-books";
import { searchMovies, searchSeries } from "./tmdb";
import type { ItemType, SearchResult } from "./types";

export async function searchCatalog(
  itemType: ItemType,
  query: string
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  switch (itemType) {
    case "book":
      return searchBooks(query);
    case "movie":
      return searchMovies(query);
    case "series":
      return searchSeries(query);
  }
}
