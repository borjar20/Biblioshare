// Capa de identidad inter-idioma (spec 2026-08-26 §6). Inventaire expone las
// entidades de Wikidata con labels multilingües: es la única fuente que sabe
// que «Words of Radiance» y «Palabras Radiantes» son la misma obra. Dependencia
// BLANDA: cualquier fallo degrada a [] y la búsqueda sigue sin colapso.
const API = "https://inventaire.io/api";
// Los QIDs de Wikidata son estables durante meses: una hora de caché evita
// pegarle a Inventaire en cada tecla sin arriesgar datos obsoletos.
const REVALIDATE_SECONDS = 3600;
// Dependencia BLANDA (ver arriba): 4s es margen de sobra para una API externa
// sin bloquear la búsqueda si Inventaire no contesta.
const FETCH_TIMEOUT_MS = 4000;
// Debe igualar MAX_RESULTS de openlibrary/search-normalize.ts: solo las obras
// que estén entre las MAX_ENTITIES entidades de Inventaire pueden anclar un
// colapso (wikidata-collapse.ts), así que con un tope menor que las tarjetas
// que la búsqueda puede mostrar, los duplicados que caigan fuera del tope no
// se funden — sin que nada en pantalla explique por qué unas veces sí y otras
// no. Subirlo no añade llamadas HTTP: `by-uris` acepta la lista entera en una
// sola petición, tanto para las obras como para sus autores (segunda ronda);
// solo engorda el payload de esas dos llamadas, no las multiplica. Medido
// contra la API real (2026-08-27): "Brandon Sanderson" con limit=20 sigue
// devolviendo la entidad de "Palabras radiantes" (en 3ª posición) en la misma
// llamada.
const MAX_ENTITIES = 20;

export type InventaireEntity = {
  uri: string;
  labels: Record<string, string>;
  authorNames: string[];
};

// Solo `wd:Q…` ancla identidad: son entidades de Wikidata, compartidas entre
// idiomas. Las `inv:…` son entidades propias de Inventaire (sin equivalente
// en Wikidata todavía) y no sirven para fusionar duplicados entre ediciones.
export function qidFromUri(uri: string): string | null {
  const m = /^wd:(Q\d+)$/.exec(uri);
  return m ? m[1] : null;
}

type RawEntity = { labels?: Record<string, string>; claims?: Record<string, unknown[]> };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    // No query strings: titles and author searches do not belong in logs.
    console.warn("Inventaire HTTP failure", { status: res.status, path: new URL(url).pathname });
    throw new Error(`Inventaire HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function searchInventaireEntities(query: string): Promise<InventaireEntity[]> {
  return (await lookupEntities(query, false)) ?? [];
}

// Writers must distinguish a completed lookup from an unavailable provider.
// No retries here: a 429 must not turn into more traffic during the block.
export async function searchInventaireEntitiesOrNull(query: string): Promise<InventaireEntity[] | null> {
  return lookupEntities(query, true);
}

async function lookupEntities(query: string, requireComplete: boolean): Promise<InventaireEntity[] | null> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    const search = await getJson<{ results?: Array<{ uri?: string }> }>(
      `${API}/search?types=works&search=${encodeURIComponent(trimmed)}&limit=${MAX_ENTITIES}&lang=es`
    );
    if (!Array.isArray(search?.results)) throw new Error("Invalid Inventaire search response");
    const uris = search.results
      .map((r) => r.uri)
      .filter((u): u is string => typeof u === "string" && qidFromUri(u) !== null)
      .slice(0, MAX_ENTITIES);
    if (uris.length === 0) return [];

    const works = await getJson<{ entities?: Record<string, RawEntity> }>(
      `${API}/entities?action=by-uris&uris=${encodeURIComponent(uris.join("|"))}`
    );
    if (!works?.entities || typeof works.entities !== "object") {
      throw new Error("Invalid Inventaire works response");
    }
    if (requireComplete && !containsRequestedEntities(works.entities, uris)) {
      throw new Error("Incomplete Inventaire works response");
    }

    // SEGUNDA ronda de `by-uris`, aparte, porque la respuesta de la primera
    // (las obras) trae el autor como URI en `wdt:P50` (una referencia, no el
    // nombre): hay que resolver esa URI contra la propia API de entidades para
    // obtener su label. No hay forma de pedir "tráeme la obra con el autor ya
    // resuelto" en una sola llamada.
    const authorUris = new Set<string>();
    for (const entity of Object.values(works.entities)) {
      for (const a of (entity.claims?.["wdt:P50"] ?? []) as string[]) {
        if (typeof a === "string") authorUris.add(a);
      }
    }
    const authors = authorUris.size
      ? await getJson<{ entities?: Record<string, RawEntity> }>(
          `${API}/entities?action=by-uris&uris=${encodeURIComponent([...authorUris].join("|"))}`
        )
      : null;

    if (authorUris.size && (!authors?.entities || typeof authors.entities !== "object")) {
      throw new Error("Invalid Inventaire authors response");
    }
    if (requireComplete && authorUris.size && !containsRequestedEntities(authors?.entities, [...authorUris])) {
      throw new Error("Incomplete Inventaire authors response");
    }
    const authorName = (uri: string): string | null => {
      const labels = authors?.entities?.[uri]?.labels ?? {};
      return labels.es ?? labels.en ?? Object.values(labels)[0] ?? null;
    };

    return uris.flatMap((uri) => {
      const raw = works.entities?.[uri];
      // `labels: {}` es tan inútil como su ausencia: sin ningún label no hay
      // título con el que mostrar la entidad ni fusionar duplicados, así que
      // se descarta igual que si el campo faltara.
      if (!raw?.labels || Object.keys(raw.labels).length === 0) return [];
      const names = ((raw.claims?.["wdt:P50"] ?? []) as string[])
        .map(authorName)
        .filter((n): n is string => Boolean(n));
      return [{ uri, labels: raw.labels, authorNames: names }];
    });
  } catch (error) {
    console.warn("Inventaire lookup incomplete", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}

function containsRequestedEntities(entities: unknown, uris: string[]): boolean {
  if (!entities || typeof entities !== "object" || Array.isArray(entities)) return false;
  return uris.every((uri) => {
    const entity: unknown = Object.hasOwn(entities, uri) ? (entities as Record<string, unknown>)[uri] : null;
    return entity !== null && typeof entity === "object" && !Array.isArray(entity);
  });
}
