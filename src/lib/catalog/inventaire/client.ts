// Capa de identidad inter-idioma (spec 2026-08-26 §6). Inventaire expone las
// entidades de Wikidata con labels multilingües: es la única fuente que sabe
// que «Words of Radiance» y «Palabras Radiantes» son la misma obra. Dependencia
// BLANDA: cualquier fallo degrada a [] y la búsqueda sigue sin colapso.
const API = "https://inventaire.io/api";
const REVALIDATE_SECONDS = 3600;
const FETCH_TIMEOUT_MS = 4000;
const MAX_ENTITIES = 5;

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

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function searchInventaireEntities(query: string): Promise<InventaireEntity[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    const search = await getJson<{ results?: Array<{ uri?: string }> }>(
      `${API}/search?types=works&search=${encodeURIComponent(trimmed)}&limit=${MAX_ENTITIES}&lang=es`
    );
    const uris = (search?.results ?? [])
      .map((r) => r.uri)
      .filter((u): u is string => typeof u === "string" && qidFromUri(u) !== null)
      .slice(0, MAX_ENTITIES);
    if (uris.length === 0) return [];

    const works = await getJson<{ entities?: Record<string, RawEntity> }>(
      `${API}/entities?action=by-uris&uris=${encodeURIComponent(uris.join("|"))}`
    );
    if (!works?.entities) return [];

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

    const authorName = (uri: string): string | null => {
      const labels = authors?.entities?.[uri]?.labels ?? {};
      return labels.es ?? labels.en ?? Object.values(labels)[0] ?? null;
    };

    return uris.flatMap((uri) => {
      const raw = works.entities?.[uri];
      if (!raw?.labels) return [];
      const names = ((raw.claims?.["wdt:P50"] ?? []) as string[])
        .map(authorName)
        .filter((n): n is string => Boolean(n));
      return [{ uri, labels: raw.labels, authorNames: names }];
    });
  } catch {
    return [];
  }
}
