export type ItemType = "book" | "movie" | "series";

export type SearchResult = {
  itemType: ItemType;
  externalId: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  year: number | null;
  // Book-only metadata (null for movies/series). See docs/REQUIREMENTS.md §7.1.
  publisher: string | null;
  pageCount: number | null;
};
