import type { SearchResult } from "../types";
import { buildCoverUrl } from "./covers";
import { acceptEditionTitle, isOmnibus, normalizeTitleForComparison } from "./normalize";

// Normalización de los RESULTADOS DE BÚSQUEDA de Open Library.
//
// Hermano de `normalize.ts` (bibliografías), no una rama suya. Las reglas se
// llaman igual pero el mecanismo no es el mismo, y la causa es una sola:
// `editions.docs[0]` de search.json NO es «la mejor edición de la obra», es la
// edición que mejor casa con la CONSULTA. Con `author_key` la consulta es el
// autor y cada obra saca su propia edición; con `q=` la consulta es un título
// y contamina la elección — toda la serie recibe la edición que se llama como
// lo que escribiste. Medido: `q="hunger games"` le pone a Mockingjay
// (OL14908941W) y a Fatta Eld (OL36410330W) la edición «The Hunger Games», y
// la desduplicación de la bibliografía las borraría a las dos.
//
// Ver docs/superpowers/specs/2026-08-14-normalizar-busqueda-openlibrary-design.md
// Este módulo es PURO: no toca red ni base de datos.

/** Un doc de `search.json` pedido con `language` y `editions.title`. */
export type OpenLibrarySearchDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  /**
   * Claves de autor, alineadas con `author_name`. Es identidad, no texto: la
   * usa la resolución de autores para no tener que adivinar quién es quién.
   */
  author_key?: string[];
  cover_i?: number;
  first_publish_year?: number;
  edition_count?: number;
  /** Idiomas de TODAS las ediciones de la obra. Es el filtro de inclusión. */
  language?: string[];
  /** Solo la mejor edición según el `lang` pedido — y según la CONSULTA. */
  editions?: { docs?: Array<{ title?: string; language?: string[] }> };
};

export function mapWorkDoc(doc: OpenLibrarySearchDoc): SearchResult {
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

const MAX_RESULTS = 20;

type Merged = {
  doc: OpenLibrarySearchDoc;
  order: number;
  es: string | null;
  en: string | null;
};

/**
 * Las siete reglas, en el orden en que las aplica el cuerpo de la función:
 * 1. Juntar. 2. Guarda de colisión. 3. Idioma. 4. Omnibus. 5. Título.
 * 6. Desduplicar por título de obra y autoría. 7. Recortar.
 *
 * Recibe los `docs` de las dos pasadas de `search.json` (`lang=es` y `lang=en`)
 * sobre la MISMA consulta.
 */
export function normalizeSearchWorks(
  docsEs: OpenLibrarySearchDoc[],
  docsEn: OpenLibrarySearchDoc[]
): SearchResult[] {
  // 1. Juntar las dos pasadas por clave de obra. El orden lo marca la pasada
  //    española; las obras que solo aparecen en la inglesa van detrás. En
  //    búsqueda ese orden es RELEVANCIA (no se pide `sort`), y es el que se
  //    devuelve al final.
  const merged = new Map<string, Merged>();
  for (const [docs, want] of [
    [docsEs, "spa"],
    [docsEn, "eng"],
  ] as const) {
    for (const doc of docs) {
      if (!doc.key || !doc.title) continue;
      const entry = merged.get(doc.key) ?? { doc, order: merged.size, es: null, en: null };
      const edition = doc.editions?.docs?.[0];
      const accepted = acceptEditionTitle(doc.title, edition?.title, edition?.language, want);
      if (accepted) {
        if (want === "spa") entry.es = accepted;
        else entry.en = accepted;
      }
      merged.set(doc.key, entry);
    }
  }

  // 2. Guarda de colisión. Un título de edición que reclaman DOS obras
  //    distintas no es el título de ninguna: es la edición que casa con la
  //    consulta. Se anula para todas. Sin esto, `q="hunger games"` le pone
  //    «The Hunger Games» a Mockingjay y a Fatta Eld, y el paso 6 —o peor, la
  //    regla de la bibliografía— las borra.
  const owners = new Map<string, Set<string>>();
  for (const [key, entry] of merged) {
    for (const title of [entry.es, entry.en]) {
      if (!title) continue;
      const normalized = normalizeTitleForComparison(title);
      if (!normalized) continue;
      const set = owners.get(normalized) ?? new Set<string>();
      set.add(key);
      owners.set(normalized, set);
    }
  }
  for (const entry of merged.values()) {
    if (entry.es && (owners.get(normalizeTitleForComparison(entry.es))?.size ?? 0) > 1) {
      entry.es = null;
    }
    if (entry.en && (owners.get(normalizeTitleForComparison(entry.en))?.size ?? 0) > 1) {
      entry.en = null;
    }
  }

  const candidates: Array<{
    result: SearchResult;
    dedupKey: string;
    editions: number;
    order: number;
  }> = [];

  for (const entry of merged.values()) {
    const { doc } = entry;
    const workTitle = doc.title as string;

    // 3. Idioma: fuera lo que no tenga ninguna edición en español ni inglés, y
    //    fuera también lo que no traiga `language` en absoluto (Open Library lo
    //    omite en 1 de cada 4 docs de búsqueda —9/40 en q="hunger games", 11/40
    //    en q="en llamas", medido sobre los fixtures commiteados; la cifra de
    //    ~1 de cada 10 de `normalize.ts` es de los fixtures de BIBLIOGRAFÍA, no
    //    de estos—, y admitirlos readmite las traducciones sueltas que este
    //    filtro existe para quitar). Límite sin recortar: issue #652.
    const languages = doc.language ?? [];
    if (!languages.includes("spa") && !languages.includes("eng")) continue;

    // Los títulos candidatos, sin los envenenados: el paso 4 mira estos, no los
    // originales. Un estuche que casa con la consulta no puede tumbar una obra.
    const allTitles = [workTitle, entry.es, entry.en].filter(
      (title): title is string => typeof title === "string" && title.length > 0
    );

    // 4. Omnibus.
    if (isOmnibus(allTitles)) continue;

    // 5. Título: español, si no inglés, si no el de la obra.
    const title = entry.es ?? entry.en ?? workTitle;

    // La clave de fusión del paso 6: título de obra Y autoría. Solo con el
    // título, «México en llamas» de Anabel Hernández y «Mexico en llamas» de
    // Basañez Loyola —dos novelas sin ninguna relación— se fundían, y la de
    // menos ediciones desaparecía de la búsqueda sin que nada dijera que
    // existe. Medido sobre el fixture de `q="en llamas"`.
    //
    // Sin clave no se desduplica, y hay DOS motivos para no tenerla. Un título
    // que normaliza a la cadena vacía («!!!», «—») casaría con el de cualquier
    // otra obra en el mismo caso. Y una obra sin `author_name` —2 de 40 works
    // en el fixture de q="hunger games" y 3 de 40 en el de q="en llamas"—
    // casaría con cualquier otra anónima del mismo título, que son dos libros
    // distintos. En ambos casos se prefiere enseñar un duplicado a borrar un
    // libro.
    const normalizedWorkTitle = normalizeTitleForComparison(workTitle);
    const normalizedAuthors = normalizeTitleForComparison((doc.author_name ?? []).join(", "));
    const dedupKey =
      normalizedWorkTitle && normalizedAuthors
        ? `${normalizedWorkTitle}|${normalizedAuthors}`
        : "";

    candidates.push({
      result: { ...mapWorkDoc(doc), title, altTitles: allTitles },
      dedupKey,
      editions: typeof doc.edition_count === "number" ? doc.edition_count : 0,
      order: entry.order,
    });
  }

  // 6. Desduplicar por título de OBRA y autoría. Los títulos de edición NO
  //    cruzan: son los que la consulta contamina. Esto funde los registros
  //    repetidos de la misma obra y deja en paz a sus hermanos de saga y a sus
  //    homónimos de otros autores. Sobrevive la de más ediciones.
  const survivors: typeof candidates = [];
  const seen = new Map<string, (typeof candidates)[number]>();
  for (const candidate of [...candidates].sort((a, b) => b.editions - a.editions)) {
    const twin = candidate.dedupKey ? seen.get(candidate.dedupKey) : undefined;
    if (twin) {
      // Fusionar no puede hundir una obra en la lista: el grupo se queda con la
      // mejor posición de sus miembros. Con el corte en 20, heredar la posición
      // del superviviente puede tirar fuera una obra que iba la primera.
      twin.order = Math.min(twin.order, candidate.order);
      continue;
    }
    if (candidate.dedupKey) seen.set(candidate.dedupKey, candidate);
    survivors.push(candidate);
  }

  // 7. Recortar, en el orden de relevancia del paso 1.
  return survivors
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_RESULTS)
    .map((candidate) => candidate.result);
}
