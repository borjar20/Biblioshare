import { buildCoverUrl } from "./covers";

// PELDAÑO 2: el detalle de la OBRA. Aquí vive la sinopsis de verdad — el
// endpoint de búsqueda no la devuelve por mucho que se pida en `fields`, y de
// ahí venía el "sin sinopsis" crónico de las fichas.
export type WorkDetail = {
  description: string | null;
  subjects: string[];
  coverUrl: string | null;
};

type WorkResponse = {
  description?: string | { value?: string };
  subjects?: string[];
  covers?: number[];
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

    return {
      description: parseDescription(data.description),
      subjects: Array.isArray(data.subjects) ? data.subjects : [],
      coverUrl: buildCoverUrl(
        data.covers?.find((id) => id > 0),
        "L"
      ),
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
