import type { SearchResult } from "./types";
import { normalizeIsbn } from "./isbn";
import { isSameTitle } from "./title-match";

type OpenLibrarySearchDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  publisher?: string[] | string;
  number_of_pages_median?: number;
  isbn?: string[];
  subject?: string[];
  description?: string | { value?: string };
};

type OpenLibrarySearchResponse = {
  docs?: OpenLibrarySearchDoc[];
};

type OpenLibraryIsbnDoc = {
  key?: string;
  title?: string;
  authors?: Array<{ name?: string }>;
  covers?: number[];
  publish_date?: string;
  publishers?: string[];
  number_of_pages?: number;
  description?: string | { value?: string };
  identifiers?: { isbn_10?: string[]; isbn_13?: string[] };
};

function parseDescription(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value) {
    const maybeValue = value as { value?: unknown };
    if (typeof maybeValue.value === "string") return maybeValue.value;
  }
  return null;
}

function parseYear(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

// Tamaños disponibles en el CDN de portadas de OpenLibrary: S (miniatura),
// M (por defecto, listados de búsqueda), L (ficha/detalle, más resolución).
export function buildCoverUrl(
  coverId?: number | null,
  size: "S" | "M" | "L" = "M"
): string | null {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null;
}

function extractPublisher(value: OpenLibrarySearchDoc["publisher"]): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

function extractIsbn(value: OpenLibrarySearchDoc["isbn"]): string | null {
  if (!value || value.length === 0) return null;
  return value[0] ?? null;
}

function extractIsbnFromIsbnDoc(doc: OpenLibraryIsbnDoc): string | null {
  const isbn13 = doc.identifiers?.isbn_13?.[0];
  if (isbn13) return isbn13;
  const isbn10 = doc.identifiers?.isbn_10?.[0];
  return isbn10 ?? null;
}

function mapSearchDoc(doc: OpenLibrarySearchDoc): SearchResult {
  return {
    itemType: "book",
    externalId: doc.key ?? doc.isbn?.[0] ?? "",
    title: doc.title ?? "",
    subtitle: doc.author_name?.join(", ") ?? null,
    coverUrl: buildCoverUrl(doc.cover_i),
    year: typeof doc.first_publish_year === "number" ? doc.first_publish_year : null,
    synopsis: parseDescription(doc.description),
    genres: doc.subject ?? null,
    publisher: extractPublisher(doc.publisher),
    pageCount: typeof doc.number_of_pages_median === "number" ? doc.number_of_pages_median : null,
    isbn: extractIsbn(doc.isbn),
  };
}

function mapIsbnDoc(doc: OpenLibraryIsbnDoc): SearchResult {
  return {
    itemType: "book",
    externalId: doc.key ?? extractIsbnFromIsbnDoc(doc) ?? "",
    title: doc.title ?? "",
    subtitle: doc.authors?.map((author) => author.name).filter(Boolean).join(", ") ?? null,
    coverUrl: buildCoverUrl(doc.covers?.[0]),
    year: parseYear(doc.publish_date),
    synopsis: parseDescription(doc.description),
    genres: null,
    publisher: doc.publishers?.[0] ?? null,
    pageCount: typeof doc.number_of_pages === "number" ? doc.number_of_pages : null,
    isbn: extractIsbnFromIsbnDoc(doc),
  };
}

async function rawSearchBooks(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const isbn = normalizeIsbn(trimmed);
  if (isbn) {
    try {
      const isbnUrl = new URL(`https://openlibrary.org/isbn/${isbn}.json`);
      const res = await fetch(isbnUrl, { next: { revalidate: 3600 } });
      if (res.ok) {
        const data: OpenLibraryIsbnDoc = await res.json();
        return [mapIsbnDoc(data)].filter((item) => item.title);
      }
    } catch {
      // Fall back to the text search below.
    }
  }

  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", "10");
  url.searchParams.set(
    "fields",
    "key,title,author_name,cover_i,first_publish_year,publisher,number_of_pages_median,isbn,subject,description"
  );

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];

  const data: OpenLibrarySearchResponse = await res.json();
  return (data.docs ?? []).filter((item) => item.title).map(mapSearchDoc);
}

function isIncomplete(result: SearchResult): boolean {
  return !result.coverUrl || !result.synopsis;
}

export async function searchBooks(query: string): Promise<SearchResult[]> {
  const isbn = normalizeIsbn(query);
  const results = await rawSearchBooks(isbn ? isbn : query);

  if (isbn && results.length > 0 && isIncomplete(results[0])) {
    const primary = results[0];
    const fallbackQuery = [primary.title, primary.subtitle].filter(Boolean).join(" ");
    if (fallbackQuery) {
      const fallbackResults = await rawSearchBooks(fallbackQuery);
      const better = fallbackResults.find(
        (result) => isSameTitle(primary.title, result.title) && !isIncomplete(result)
      );
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

// ── Autores como entidad (para las fichas de persona, §7.34) ────────────────
// Google Books/la búsqueda solo dan el nombre del autor como texto; Open Library
// aporta la entidad de autor (bio, foto, fechas) vía /search/authors + /authors.

export type OpenLibraryAuthor = {
  key: string; // p. ej. "OL23919A"
  name: string;
  bio: string | null;
  photoUrl: string | null;
  birthDate: string | null;
  deathDate: string | null;
};

type AuthorSearchResponse = {
  docs?: Array<{ key?: string; name?: string }>;
};

type AuthorDetailResponse = {
  bio?: string | { value?: string };
  photos?: number[];
  birth_date?: string;
  death_date?: string;
};

// Busca el mejor match por nombre y devuelve su ficha enriquecida, o null si no
// hay coincidencia / la API falla (el llamador degrada a ficha ligera). El match
// es difuso: se toma el primer resultado (el más relevante según Open Library).
export async function resolveOpenLibraryAuthor(
  name: string
): Promise<OpenLibraryAuthor | null> {
  const searchUrl = new URL("https://openlibrary.org/search/authors.json");
  searchUrl.searchParams.set("q", name);

  const searchRes = await fetch(searchUrl, { next: { revalidate: 86400 } });
  if (!searchRes.ok) return null;

  const search: AuthorSearchResponse = await searchRes.json();
  const doc = search.docs?.[0];
  if (!doc?.key) return null;

  const key = doc.key.replace("/authors/", "");
  const matchedName = doc.name ?? name;

  const detailRes = await fetch(`https://openlibrary.org/authors/${key}.json`, {
    next: { revalidate: 86400 },
  });
  if (!detailRes.ok) {
    return { key, name: matchedName, bio: null, photoUrl: null, birthDate: null, deathDate: null };
  }

  const detail: AuthorDetailResponse = await detailRes.json();
  const bio =
    typeof detail.bio === "string" ? detail.bio : detail.bio?.value ?? null;
  const photoId = detail.photos?.find((id) => id > 0);

  return {
    key,
    name: matchedName,
    bio: bio?.trim() || null,
    photoUrl: photoId
      ? `https://covers.openlibrary.org/a/id/${photoId}-M.jpg`
      : null,
    birthDate: detail.birth_date ?? null,
    deathDate: detail.death_date ?? null,
  };
}
