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

export type NormalizedWork = {
  /** "/works/OL5735363W" — el formato que guarda `books.openlibrary_work_key`. */
  workKey: string;
  title: string;
  year: number | null;
  coverUrl: string | null;
};

// Estuches y recopilaciones. Se comparan contra el título en minúsculas y sin
// acentos, y contra TODOS los títulos candidatos de la obra —no solo el
// elegido—, porque el work titulado «Gregor» solo se delata por su edición
// «The Underland Chronicles 5 Volume Set».
//
// `collection` NO está en la lista a propósito: es el único patrón con riesgo
// real de tragarse un libro legítimo. Los siete que quedan son inequívocos, y
// el precio asumido es que un libro que se llame «Omnibus» caería.
const OMNIBUS_PATTERNS = [
  "box set",
  "boxed set",
  "trilogy",
  "trilogia",
  "tetralogia",
  "volume set",
  "complete series",
  "omnibus",
];

// Minúsculas y sin acentos, PERO conservando espacios: los patrones de arriba
// son frases, no palabras pegadas.
function looseTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function isOmnibus(titles: string[]): boolean {
  return titles.some((title) => {
    const loose = looseTitle(title);
    if (OMNIBUS_PATTERNS.some((pattern) => loose.includes(pattern))) return true;
    // «The Hunger Games / Catching Fire / Mockingjay / …»: tres o más obras
    // listadas en el mismo título.
    return title.split(" / ").filter(Boolean).length >= 3;
  });
}

type Merged = {
  doc: OpenLibraryAuthorWorkDoc;
  order: number;
  es: string | null;
  en: string | null;
};

/**
 * Las seis reglas, en el orden en que las aplica el cuerpo de la función:
 * 1. Juntar. 2. Idioma. 3. Omnibus. 4. Título. 5. Desduplicar. 6. Orden.
 * Recibe los `docs` de las dos pasadas de `search.json` (`lang=es` y
 * `lang=en`) y devuelve obras únicas y presentables.
 */
export function normalizeAuthorWorks(
  docsEs: OpenLibraryAuthorWorkDoc[],
  docsEn: OpenLibraryAuthorWorkDoc[]
): NormalizedWork[] {
  // 1. Juntar las dos pasadas por clave de obra. El orden lo marca la pasada
  //    española; las obras que solo aparecen en la inglesa van detrás.
  const merged = new Map<string, Merged>();
  for (const [docs, want] of [
    [docsEs, "spa"],
    [docsEn, "eng"],
  ] as const) {
    for (const doc of docs) {
      if (!doc.key || !doc.title) continue;
      const entry =
        merged.get(doc.key) ?? { doc, order: merged.size, es: null, en: null };
      const edition = doc.editions?.docs?.[0];
      const accepted = acceptEditionTitle(doc.title, edition?.title, edition?.language, want);
      if (accepted) {
        if (want === "spa") entry.es = accepted;
        else entry.en = accepted;
      }
      merged.set(doc.key, entry);
    }
  }

  const candidates: Array<{ work: NormalizedWork; titles: Set<string>; editions: number; order: number }> = [];

  for (const entry of merged.values()) {
    const { doc } = entry;
    const workTitle = doc.title as string;

    // 2. Idioma: fuera lo que no tenga ninguna edición en español ni inglés.
    //    Se lleva los tres «Dena sutan» en euskera y los registros fantasma,
    //    que no traen idiomas porque no tienen ediciones.
    const languages = doc.language ?? [];
    if (!languages.includes("spa") && !languages.includes("eng")) continue;

    const allTitles = [workTitle, entry.es, entry.en].filter(
      (title): title is string => typeof title === "string" && title.length > 0
    );

    // 3. Omnibus.
    if (isOmnibus(allTitles)) continue;

    // 4. Título: español, si no inglés, si no el de la obra.
    const title = entry.es ?? entry.en ?? workTitle;

    // Un título hecho solo de puntuación («!!!», «—», «...») normaliza a la
    // cadena vacía. `acceptEditionTitle` ya blinda su propia salida, pero
    // nada blinda el título de la obra: si la cadena vacía entrase en el
    // conjunto, casaría con la cadena vacía de CUALQUIER OTRA obra en el
    // mismo caso y las fusionaría, borrando una de las dos. Se descarta aquí.
    const titleSet = new Set(
      allTitles.map(normalizeTitleForComparison).filter((t) => t.length > 0)
    );

    candidates.push({
      work: {
        workKey: doc.key as string,
        title,
        year: typeof doc.first_publish_year === "number" ? doc.first_publish_year : null,
        coverUrl: buildCoverUrl(doc.cover_i),
      },
      titles: titleSet,
      editions: typeof doc.edition_count === "number" ? doc.edition_count : 0,
      order: entry.order,
    });
  }

  // 5. Desduplicar. Dos obras son la misma si sus conjuntos de títulos se
  //    cruzan — es lo que une «Fatta Eld» con «Catching Fire» y «Amanecer de la
  //    Cosecha» con «Sunrise on the Reaping», que no comparten idioma pero sí
  //    un título candidato. Sobrevive la de más ediciones.
  //
  //    La fusión exige evidencia DIRECTA contra el conjunto propio del
  //    superviviente — nunca se amplía ese conjunto con los títulos de la
  //    obra fusionada. La versión anterior heredaba, así que una tercera obra
  //    podía casar por un título que el superviviente jamás tuvo: una cadena
  //    transitiva sin límite que llegó a fusionar (y borrar) obras que entre
  //    sí no compartían ningún título. Medido contra los 111 works de los dos
  //    fixtures, la herencia no aportaba ninguna fusión (0 casos) — los
  //    recuentos (Collins 14, Shusterman 68) son idénticos con y sin ella.
  //
  //    Nota: si un candidato cruza con DOS supervivientes distintos, `find`
  //    se queda con el primero y el otro sobrevive como casi-duplicado. Es un
  //    fallo seguro (nunca borra un libro) y determinista, porque los
  //    supervivientes se recorren en orden descendente de ediciones.
  const survivors: typeof candidates = [];
  for (const candidate of [...candidates].sort((a, b) => b.editions - a.editions)) {
    const candidateTitles = [...candidate.titles];
    const twin = survivors.find((s) => candidateTitles.some((t) => s.titles.has(t)));
    if (twin) continue;
    survivors.push(candidate);
  }

  // 6. Orden: el de Open Library (`sort=readinglog`, por popularidad), no el de
  //    la desduplicación ni el alfabético.
  return survivors.sort((a, b) => a.order - b.order).map((s) => s.work);
}
