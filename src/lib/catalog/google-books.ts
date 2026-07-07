import type { SearchResult } from "./types";

type GoogleBooksResponse = {
  items?: Array<{
    id: string;
    volumeInfo: {
      title?: string;
      authors?: string[];
      imageLinks?: { thumbnail?: string; smallThumbnail?: string };
      publishedDate?: string;
    };
  }>;
};

export async function searchBooks(query: string): Promise<SearchResult[]> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "20");

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];

  const data: GoogleBooksResponse = await res.json();

  return (data.items ?? [])
    .filter((item) => item.volumeInfo.title)
    .map((item) => ({
      itemType: "book" as const,
      externalId: item.id,
      title: item.volumeInfo.title!,
      subtitle: item.volumeInfo.authors?.join(", ") ?? null,
      coverUrl:
        item.volumeInfo.imageLinks?.thumbnail?.replace(
          "http://",
          "https://"
        ) ?? null,
      year: item.volumeInfo.publishedDate
        ? Number(item.volumeInfo.publishedDate.slice(0, 4)) || null
        : null,
    }));
}
