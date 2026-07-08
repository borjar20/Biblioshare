import type { SearchResult } from "./types";
import { normalizeIsbn } from "./isbn";

type GoogleBooksResponse = {
  items?: Array<{
    id: string;
    volumeInfo: {
      title?: string;
      authors?: string[];
      imageLinks?: { thumbnail?: string; smallThumbnail?: string };
      publishedDate?: string;
      publisher?: string;
      pageCount?: number;
      industryIdentifiers?: Array<{ type: string; identifier: string }>;
    };
  }>;
};

function extractIsbn(
  identifiers?: Array<{ type: string; identifier: string }>
): string | null {
  if (!identifiers) return null;
  const isbn13 = identifiers.find((i) => i.type === "ISBN_13");
  if (isbn13) return isbn13.identifier;
  return identifiers.find((i) => i.type === "ISBN_10")?.identifier ?? null;
}

export async function searchBooks(query: string): Promise<SearchResult[]> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  const isbn = normalizeIsbn(query);
  url.searchParams.set("q", isbn ? `isbn:${isbn}` : query);
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
      publisher: item.volumeInfo.publisher ?? null,
      pageCount: item.volumeInfo.pageCount ?? null,
      isbn: extractIsbn(item.volumeInfo.industryIdentifiers),
    }));
}
