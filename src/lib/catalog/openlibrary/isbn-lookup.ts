import type { SearchResult } from "../types";
import { buildCoverUrl } from "./covers";
import { normalizeWorkKey } from "./work-detail";

// Un ISBN no es una búsqueda, es un LOOKUP: identifica una tirada concreta (el
// caso del escáner de código de barras y del importador de Goodreads). Lo que se
// devuelve, sin embargo, es la OBRA — que es lo que la app muestra —, anotando en
// `matchedIsbn` qué edición exacta se escaneó, para poder registrarla al añadir.
type IsbnResponse = {
  title?: string;
  covers?: number[];
  publish_date?: string;
  works?: Array<{ key?: string }>;
};

type WorkTitleResponse = {
  title?: string;
  covers?: number[];
  first_publish_date?: string;
};

const FETCH_TIMEOUT_MS = 5000;

function parseYear(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

async function fetchWorkTitle(workKey: string): Promise<WorkTitleResponse | null> {
  try {
    const key = normalizeWorkKey(workKey);
    const res = await fetch(`https://openlibrary.org/works/${key}.json`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Nunca lanza. Devuelve null si el ISBN no existe en OpenLibrary o si no se le
// conoce obra: sin work key no hay nada que hidratar ni ediciones que pedir, así
// que no vale la pena crear la ficha.
export async function lookupIsbn(isbn: string): Promise<SearchResult | null> {
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const edition: IsbnResponse = await res.json();
    const workKey = edition.works?.[0]?.key;
    if (!workKey) return null;

    // El doc de /isbn/ trae el título de la EDICIÓN; el de la obra es más
    // canónico y su portada suele ser mejor. Si la obra no responde, se cae a
    // los datos de la edición antes que devolver nada.
    const work = await fetchWorkTitle(workKey);

    const title = work?.title ?? edition.title ?? "";
    if (!title) return null;

    return {
      itemType: "book",
      externalId: workKey,
      title,
      // La autoría la pone ensureItemEnriched al abrir la ficha: el doc de /isbn/
      // solo trae claves de autor (/authors/OL...A), no nombres.
      subtitle: null,
      coverUrl:
        buildCoverUrl(work?.covers?.find((id) => id > 0)) ??
        buildCoverUrl(edition.covers?.[0]),
      year: parseYear(work?.first_publish_date ?? edition.publish_date),
      synopsis: null,
      genres: null,
      matchedIsbn: isbn,
    };
  } catch {
    return null;
  }
}
