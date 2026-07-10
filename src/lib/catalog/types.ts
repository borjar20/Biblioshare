export type ItemType = "book" | "movie" | "series";

export type SearchResult = {
  itemType: ItemType;
  externalId: string;
  // Set when this result already has a row in books/movies/series — either
  // found locally or just persisted after an API search. See
  // docs/REQUIREMENTS.md §7.32 (DB-first search / cache-as-you-go).
  catalogId?: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  year: number | null;
  synopsis: string | null;
  genres: string[] | null;
  // Book-only metadata (null for movies/series). See docs/REQUIREMENTS.md §7.1.
  publisher: string | null;
  pageCount: number | null;
  // Book-only. See docs/REQUIREMENTS.md §7.2.
  isbn: string | null;
  // Book-only: nº de ediciones agrupadas bajo este resultado representativo
  // (>1 solo cuando la búsqueda encontró varias ediciones de la misma obra).
  // Ver docs/REQUIREMENTS.md §7.2 (agrupado de ediciones).
  editionCount?: number;
};
