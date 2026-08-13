import { buildCoverUrl } from "./covers";

// La bibliografía de un autor en UNA llamada: /authors/{key}/works.json.
// Es la simétrica de getPersonCombinedCredits (TMDB) para el lado de los libros.
//
// LÍMITE ASUMIDO: `limit=1000` es el tope de la API en una sola página y NO se
// pagina. Un segundo viaje HTTP dentro de un render por un autor con más de mil
// obras no compensa. Ver la issue de deuda del spec de 2026-08-12.
//
// RUIDO CONOCIDO: /works de un autor mezcla la obra original con traducciones,
// recopilaciones y ediciones registradas como obra. NO se desduplica por título
// a propósito: produce falsos positivos («Fundación» y «Fundación e Imperio» no
// son la misma obra). Se descarta solo lo que no tenga title o key, y los
// workKey repetidos.

const WORKS_LIMIT = 1000;
const REVALIDATE_SECONDS = 86400;

export type AuthorWork = {
  /** "/works/OL123W" — el mismo formato que `books.openlibrary_work_key`. */
  workKey: string;
  title: string;
  coverUrl: string | null;
};

type AuthorWorksResponse = {
  entries?: Array<{
    key?: string;
    title?: string;
    covers?: number[];
  }>;
};

// Acepta "OL1A" y "/authors/OL1A": `people.openlibrary_key` guarda la forma
// corta (findOrCreateBookAuthor hace `.replace("/authors/", "")`), pero no
// cuesta nada tolerar la larga.
function normalizeAuthorKey(key: string): string {
  return key.trim().replace(/^\/?authors\//, "");
}

export async function getAuthorWorks(authorKey: string): Promise<AuthorWork[]> {
  const key = normalizeAuthorKey(authorKey ?? "");
  if (!key) return [];

  try {
    const res = await fetch(
      `https://openlibrary.org/authors/${key}/works.json?limit=${WORKS_LIMIT}`,
      { next: { revalidate: REVALIDATE_SECONDS } }
    );
    if (!res.ok) return [];

    const data: AuthorWorksResponse = await res.json();
    const out: AuthorWork[] = [];
    const seen = new Set<string>();

    for (const entry of data.entries ?? []) {
      const workKey = entry.key?.trim();
      const title = entry.title?.trim();
      if (!workKey || !title) continue;
      if (seen.has(workKey)) continue;
      seen.add(workKey);

      // OL marca "sin portada" con -1 (y a veces 0); buildCoverUrl ya devuelve
      // null sin id, pero el filtro de los <= 0 tiene que ir aquí.
      const coverId = entry.covers?.find((id) => id > 0);
      out.push({ workKey, title, coverUrl: buildCoverUrl(coverId, "L") });
    }

    return out;
  } catch (error) {
    console.error("getAuthorWorks failed", { authorKey, error });
    return [];
  }
}
