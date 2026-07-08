import type { SearchResult } from "./types";
import { normalizeIsbn } from "./isbn";

type GoogleBooksVolume = {
  id: string;
  volumeInfo: {
    title?: string;
    authors?: string[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    publishedDate?: string;
    publisher?: string;
    pageCount?: number;
    description?: string;
    categories?: string[];
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
  };
};

type GoogleBooksResponse = {
  items?: GoogleBooksVolume[];
};

function extractIsbn(
  identifiers?: Array<{ type: string; identifier: string }>
): string | null {
  if (!identifiers) return null;
  const isbn13 = identifiers.find((i) => i.type === "ISBN_13");
  if (isbn13) return isbn13.identifier;
  return identifiers.find((i) => i.type === "ISBN_10")?.identifier ?? null;
}

function mapVolume(item: GoogleBooksVolume): SearchResult {
  return {
    itemType: "book",
    externalId: item.id,
    title: item.volumeInfo.title!,
    subtitle: item.volumeInfo.authors?.join(", ") ?? null,
    coverUrl:
      item.volumeInfo.imageLinks?.thumbnail?.replace("http://", "https://") ??
      null,
    year: item.volumeInfo.publishedDate
      ? Number(item.volumeInfo.publishedDate.slice(0, 4)) || null
      : null,
    synopsis: item.volumeInfo.description ?? null,
    genres: item.volumeInfo.categories ?? null,
    publisher: item.volumeInfo.publisher ?? null,
    pageCount: item.volumeInfo.pageCount ?? null,
    isbn: extractIsbn(item.volumeInfo.industryIdentifiers),
  };
}

async function rawSearchBooks(q: string): Promise<SearchResult[]> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "20");

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];

  const data: GoogleBooksResponse = await res.json();
  return (data.items ?? []).filter((item) => item.volumeInfo.title).map(mapVolume);
}

// A direct ISBN hit sometimes comes back missing a cover or description —
// Google Books' per-edition records are often thinner than the "main"
// record for the same work. Fall back to a title+author search to backfill
// whatever's missing. See docs/REQUIREMENTS.md §7.2 (ISBN search notes).
function isIncomplete(result: SearchResult): boolean {
  return !result.coverUrl || !result.synopsis;
}

export async function searchBooks(query: string): Promise<SearchResult[]> {
  const isbn = normalizeIsbn(query);
  const results = await rawSearchBooks(isbn ? `isbn:${isbn}` : query);

  if (isbn && results.length > 0 && isIncomplete(results[0])) {
    const primary = results[0];
    const fallbackQuery = [primary.title, primary.subtitle].filter(Boolean).join(" ");
    if (fallbackQuery) {
      const fallbackResults = await rawSearchBooks(fallbackQuery);
      const better = fallbackResults.find((r) => !isIncomplete(r));
      if (better) {
        results[0] = {
          ...primary,
          coverUrl: primary.coverUrl ?? better.coverUrl,
          synopsis: primary.synopsis ?? better.synopsis,
          publisher: primary.publisher ?? better.publisher,
          pageCount: primary.pageCount ?? better.pageCount,
          genres: primary.genres ?? better.genres,
        };
      }
    }
  }

  return results;
}
