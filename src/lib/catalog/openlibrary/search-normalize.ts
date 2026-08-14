import type { SearchResult } from "../types";
import { buildCoverUrl } from "./covers";

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
