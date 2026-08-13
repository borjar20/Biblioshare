import { buildCoverUrl } from "./covers";

// Normalización de las LISTAS de obras de un autor.
//
// Por qué existe: la bibliografía salía de /authors/<key>/works.json, un
// volcado en crudo sin orden, sin edition_count y con fecha de publicación en
// menos de la mitad de las entradas. De ahí salían 84 «libros» de Neal
// Shusterman con 83 sin año, tres registros del mismo `Dread locks`, estuches y
// obras fantasma sin ninguna edición.
//
// La misma fuente, pedida por search.json, trae año, portada, idiomas y
// conteo de ediciones — y con `editions.title` + `lang=es`, el título ya
// traducido, sin llamadas extra. Este módulo es PURO: recibe los `docs` de las
// dos pasadas y no toca red ni base de datos.

/** Un doc de `search.json` pedido con `editions.title` y `editions.language`. */
export type OpenLibraryAuthorWorkDoc = {
  key?: string;
  title?: string;
  cover_i?: number;
  first_publish_year?: number;
  edition_count?: number;
  /** Idiomas de TODAS las ediciones de la obra. Es el filtro de inclusión. */
  language?: string[];
  /** Solo la mejor edición según el `lang` pedido. */
  editions?: { docs?: Array<{ title?: string; language?: string[] }> };
};

// Normaliza un título para COMPARAR, nunca para mostrar: minúsculas, sin
// marcas diacríticas y solo letras/dígitos. Deja «Duckling ugly» y «Duckling
// Ugly» iguales, y «It's O.K. to say no» igual que «It's Ok to Say No», que es
// justo la tolerancia que hace falta para reconocer dos registros del mismo
// libro. No iguala «Fundación» con «Fundación e Imperio».
export function normalizeTitleForComparison(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Decide si el título de una edición sirve para mostrarse en vez del de la obra.
 *
 * Dos razones para decir que no, y las dos vienen de casos reales:
 * 1. El idioma. `lang=es` devuelve la mejor edición DISPONIBLE, no una en
 *    español: sin comprobarlo se cuela «Gregor Und Der Fluch DES Unterlandes».
 * 2. La pérdida de información. El work «Gregor and the Code of Claw» tiene una
 *    edición titulada «Gregor» a secas; quedarse con ella empeora la ficha.
 */
export function acceptEditionTitle(
  workTitle: string,
  editionTitle: string | undefined,
  editionLanguages: string[] | undefined,
  want: "spa" | "eng"
): string | null {
  if (!editionTitle) return null;
  if (!(editionLanguages ?? []).includes(want)) return null;

  const work = normalizeTitleForComparison(workTitle);
  const edition = normalizeTitleForComparison(editionTitle);
  if (!edition) return null;
  if (edition.length < work.length && work.includes(edition)) return null;

  return editionTitle;
}
