import type { SearchResult } from "../types";
import { buildCoverUrl } from "./covers";

// PELDAÑO 1 de la escalera de hidratación (ver el spec de 2026-07-14): una
// tarjeta de resultado muestra portada, título, autor y año — y eso es
// EXACTAMENTE lo que se pide aquí.
//
// Los campos que antes se pedían de más (`description`, `subject`, `publisher`,
// `number_of_pages_median`, `isbn`) no los muestra la tarjeta y llegaban sucios
// o vacíos: la sinopsis este endpoint NO la devuelve (vive en /works/<key>.json,
// de ahí el "sin sinopsis" crónico) y las páginas eran la MEDIANA de todas las
// ediciones, un número que no es el de ningún libro real.
//
// Un doc de search.json ES una obra (`key` = /works/OL...W). No hay que
// reagruparlo a mano: OpenLibrary ya lo entrega agrupado, y `edition_count` dice
// cuántas tiradas cubre.
export type OpenLibraryWorkDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  edition_count?: number;
};

type WorkSearchResponse = {
  docs?: OpenLibraryWorkDoc[];
};

const SEARCH_FIELDS = "key,title,author_name,cover_i,first_publish_year,edition_count";
const SEARCH_LIMIT = 20;
const FETCH_TIMEOUT_MS = 5000;

export function mapWorkDoc(doc: OpenLibraryWorkDoc): SearchResult {
  return {
    itemType: "book",
    externalId: doc.key ?? "",
    title: doc.title ?? "",
    subtitle: doc.author_name?.join(", ") ?? null,
    coverUrl: buildCoverUrl(doc.cover_i),
    year: typeof doc.first_publish_year === "number" ? doc.first_publish_year : null,
    // La obra se hidrata al abrir su ficha (ensureBookHydrated), no aquí.
    synopsis: null,
    genres: null,
    editionCount: typeof doc.edition_count === "number" ? doc.edition_count : 1,
  };
}

// Nunca lanza: si OpenLibrary falla o tarda, la búsqueda se degrada a lo que
// haya en el catálogo local (ver search.ts).
export async function searchWorks(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("q", trimmed);
    url.searchParams.set("limit", String(SEARCH_LIMIT));
    url.searchParams.set("fields", SEARCH_FIELDS);

    const res = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const data: WorkSearchResponse = await res.json();
    return (data.docs ?? []).filter((doc) => doc.title && doc.key).map(mapWorkDoc);
  } catch {
    return [];
  }
}
