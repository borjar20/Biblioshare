import type { SearchResult } from "../types";
import { normalizeTitleForComparison } from "./normalize";
import { mapWorkDoc, type OpenLibrarySearchDoc } from "./search-normalize";

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
type WorkSearchResponse = {
  docs?: OpenLibrarySearchDoc[];
};

const SEARCH_FIELDS = "key,title,author_name,author_key,cover_i,first_publish_year,edition_count";
const REVALIDATE_SECONDS = 3600;
const SEARCH_LIMIT = 20;
const FETCH_TIMEOUT_MS = 5000;

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
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const data: WorkSearchResponse = await res.json();
    return (data.docs ?? []).filter((doc) => doc.title && doc.key).map(mapWorkDoc);
  } catch {
    return [];
  }
}


// Resolución de la OBRA para un libro que no guardó su work key (alta manual,
// import de CSV, ISBN que no resolvió). Se pide título y autor por separado
// —no concatenados en `q`— porque los campos dedicados de OL puntúan mucho
// mejor que la cadena libre, y de ahí sale además `author_key`: la identidad
// del autor, gratis y sin una segunda llamada.
//
// `titleMatches` existe porque el primer resultado de una búsqueda fuzzy NO
// es identidad — el mismo problema de origen que este cambio entero vino a
// cerrar, solo que ahora en el título en vez del nombre del autor. El
// llamador decide con esto si el work key es fiable para persistir.
export type ResolvedWork = { workKey: string; authorKeys: string[]; titleMatches: boolean };

export async function resolveWorkByTitleAuthor(
  title: string,
  author: string | null
): Promise<ResolvedWork | null> {
  const trimmedTitle = title?.trim();
  if (!trimmedTitle) return null;

  try {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("title", trimmedTitle);
    if (author?.trim()) url.searchParams.set("author", author.trim());
    url.searchParams.set("limit", "1");
    url.searchParams.set("fields", "key,title,author_name,author_key");

    const res = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data: WorkSearchResponse = await res.json();
    const doc = (data.docs ?? []).find((d) => d.key);
    if (!doc?.key) return null;

    const titleMatches =
      typeof doc.title === "string" &&
      normalizeTitleForComparison(doc.title) === normalizeTitleForComparison(trimmedTitle);

    return {
      workKey: doc.key,
      authorKeys: (doc.author_key ?? []).filter((k) => typeof k === "string" && k.length > 0),
      titleMatches,
    };
  } catch {
    return null;
  }
}
