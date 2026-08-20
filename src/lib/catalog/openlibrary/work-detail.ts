import { buildCoverUrl, mapWorkCovers } from "./covers";

// PELDAÑO 2: el detalle de la OBRA. Aquí vive la sinopsis de verdad — el
// endpoint de búsqueda no la devuelve por mucho que se pida en `fields`, y de
// ahí venía el "sin sinopsis" crónico de las fichas.
export type WorkDetail = {
  /** El título canónico de la obra. Desde #674 la fila de catálogo nace vacía y
   *  este es el único sitio de donde puede salir: la búsqueda ya no lo escribe. */
  title: string | null;
  description: string | null;
  subjects: string[];
  coverUrl: string | null;
  /** Claves cortas ("OL22161A") de los autores, tal como las lista el work. Van
   *  aquí porque vienen en ESTA misma respuesta: pedirlas aparte sería una
   *  segunda llamada al mismo JSON. */
  authorKeys: string[];
  /** Año de primera publicación, si se puede sacar de `first_publish_date` —
   *  que OpenLibrary devuelve en texto libre ("1932", "November 1932"). */
  firstPublishYear: number | null;
};

type WorkResponse = {
  title?: string;
  description?: string | { value?: string };
  subjects?: string[];
  covers?: number[];
  authors?: Array<{ author?: { key?: string } }>;
  first_publish_date?: string;
};

type EditionsResponse = {
  entries?: Array<{ description?: string | { value?: string } }>;
};

const FETCH_TIMEOUT_MS = 5000;

// OpenLibrary devuelve `description` a veces como string y a veces como
// { type, value }. Las dos formas son válidas y hay que tragar ambas.
function parseDescription(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && "value" in value) {
    const inner = (value as { value?: unknown }).value;
    if (typeof inner === "string") return inner.trim() || null;
  }
  return null;
}

// `first_publish_date` es texto libre: "1932", "November 1932", "1932-11-01".
// Solo interesa el año, y solo si es plausible — el rango es el mismo que ya
// impone el CHECK de book_editions.published_year.
export function parseFirstPublishYear(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/\b(1[4-9]\d{2}|2[01]\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1400 && year <= 2200 ? year : null;
}

// Normaliza "/works/OL893415W", "works/OL893415W" y "OL893415W" a "OL893415W".
export function normalizeWorkKey(workKey: string): string {
  return workKey.replace(/^\/?works\//, "").replace(/^\//, "");
}

// Nunca lanza: null significa "no se pudo hidratar ahora", y el llamador deja
// `hydrated_at` a null para reintentar en la siguiente visita.
export async function fetchWork(workKey: string): Promise<WorkDetail | null> {
  try {
    const key = normalizeWorkKey(workKey);
    if (!key) return null;

    const res = await fetch(`https://openlibrary.org/works/${key}.json`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data: WorkResponse = await res.json();

    const authorKeys: string[] = [];
    for (const entry of data.authors ?? []) {
      const raw = entry?.author?.key;
      if (!raw) continue;
      const authorKey = raw.trim().replace(/^\/?authors\//, "");
      if (authorKey && !authorKeys.includes(authorKey)) authorKeys.push(authorKey);
    }

    return {
      title: data.title?.trim() || null,
      description: parseDescription(data.description),
      subjects: Array.isArray(data.subjects) ? data.subjects : [],
      coverUrl: buildCoverUrl(
        data.covers?.find((id) => id > 0),
        "L"
      ),
      authorKeys,
      firstPublishYear: parseFirstPublishYear(data.first_publish_date),
    };
  } catch {
    return null;
  }
}

// Fallback de sinopsis: hay obras sin `description` en las que alguna de sus
// ediciones sí la trae. Se llama SOLO cuando la obra no tiene ninguna, y como
// mucho una vez por libro (lo protege el guard `books.hydrated_at`).
export async function fetchFirstEditionDescription(
  workKey: string
): Promise<string | null> {
  try {
    const key = normalizeWorkKey(workKey);
    if (!key) return null;

    const res = await fetch(
      `https://openlibrary.org/works/${key}/editions.json?limit=20`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (!res.ok) return null;

    const data: EditionsResponse = await res.json();
    for (const entry of data.entries ?? []) {
      const description = parseDescription(entry.description);
      if (description) return description;
    }
    return null;
  } catch {
    return null;
  }
}

// Portadas oficiales de la obra para el editor de ficha. Mismo endpoint que
// fetchWork; aquí solo interesa el array `covers`. Nunca lanza: fuente caída o
// clave vacía -> [].
export async function fetchWorkCovers(workKey: string): Promise<string[]> {
  try {
    const key = normalizeWorkKey(workKey);
    if (!key) return [];

    const res = await fetch(`https://openlibrary.org/works/${key}.json`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const data: WorkResponse = await res.json();
    return mapWorkCovers(data.covers);
  } catch {
    return [];
  }
}
