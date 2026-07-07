export type ItemType = "book" | "movie" | "series";

export type SearchResult = {
  itemType: ItemType;
  externalId: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  year: number | null;
};
