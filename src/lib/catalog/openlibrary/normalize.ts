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
// conteo de ediciones y un candidato de título traducido. Este módulo es PURO:
// recibe ambas pasadas y la evidencia adicional obtenida por work-identity.

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
  // Una única edición inglesa no corrobora un renombre de la obra (#638).
  // Conservamos solo variantes de puntuación/mayúsculas; las traducciones
  // españolas siguen siendo presentación, nunca evidencia para fusionar.
  if (want === "eng" && edition !== work) return null;

  return editionTitle;
}

export type NormalizedWork = {
  /** "/works/OL5735363W" — el formato que guarda `books.openlibrary_work_key`. */
  workKey: string;
  title: string;
  /**
   * De dónde salió `title`: de una edición española, de una inglesa, o del
   * título de la OBRA (`other`, porque el de la obra puede estar en cualquier
   * idioma — «Fatta Eld» es sueco). Viaja con el título porque la hidratación
   * en lote lo escribe en `repr_meta`, y ese rango de idioma es lo que
   * permite que una visita posterior a la ficha lo MEJORE en vez de quedarse
   * congelado. Ver spec 2026-08-26 §2.
   */
  titleLang: "es" | "en" | "other";
  year: number | null;
  coverUrl: string | null;
};

// Estos patrones detectan candidatos a recopilación. El título de UNA edición
// solo solicita corroboración; nunca basta para descartar su obra (#638).
//
// `collection` NO está en la lista a propósito: es el único patrón con riesgo
// real de tragarse un libro legítimo. Los ocho que quedan son inequívocos, y
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

export function isOmnibus(titles: string[]): boolean {
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

export type WorkIdentityEvidence = ReadonlyMap<string, { canonicalKey: string; collection: boolean }>;

/**
 * Las seis reglas, en el orden en que las aplica el cuerpo de la función:
 * 1. Juntar. 2. Idioma. 3. Omnibus. 4. Título. 5. Desduplicar. 6. Orden.
 * Recibe los `docs` de las dos pasadas de `search.json` (`lang=es` y
 * `lang=en`) y devuelve obras únicas y presentables.
 */
export function normalizeAuthorWorks(
  docsEs: OpenLibraryAuthorWorkDoc[],
  docsEn: OpenLibraryAuthorWorkDoc[],
  evidence: WorkIdentityEvidence = new Map()
): NormalizedWork[] {
  const canonical = (key: string) => evidence.get(key)?.canonicalKey ?? key;
  const workTitles = [...docsEs, ...docsEn].filter((doc) => doc.key && doc.title);
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
      let accepted = acceptEditionTitle(doc.title, edition?.title, edition?.language, want);
      // A translation may label this work, but must not borrow another work's
      // identity or the title of a collection edition.
      if (accepted && (isOmnibus([accepted]) || workTitles.some((other) =>
        canonical(other.key!) !== canonical(doc.key!) &&
        normalizeTitleForComparison(other.title!) !== normalizeTitleForComparison(doc.title!) &&
        normalizeTitleForComparison(other.title!) === normalizeTitleForComparison(accepted!)
      ))) accepted = null;
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

    // 2. Idioma: fuera lo que no tenga ninguna edición en español ni inglés —
    //    y fuera también lo que no traiga el campo `language` en absoluto.
    //    Esto último no es un caso raro ni exclusivo de registros fantasma sin
    //    ediciones: Open Library omite `language` en aproximadamente uno de
    //    cada diez docs (5/25 en Collins, 5/86 en Shusterman), a veces en
    //    obras con ediciones reales — así se pierde «Courage to Dream» de
    //    Shusterman (`edition_count: 2`), que solo sobrevive en la lista
    //    final porque un SEGUNDO registro más débil de la misma obra sí trae
    //    `language`. Se acepta el precio porque la alternativa es peor:
    //    admitir los `language` ausentes readmitiría dos de los tres «Dena
    //    sutan» en euskera, que es justo el caso para el que existe este
    //    filtro.
    const languages = doc.language ?? [];
    if (!languages.includes("spa") && !languages.includes("eng")) continue;

    // 3. Omnibus.
    // Una edición puede ser un estuche de una novela legítima. Solo el
    // registro de obra decide si descartamos la obra completa (#638).
    if (isOmnibus([workTitle]) || evidence.get(doc.key!)?.collection) continue;

    // 4. Título: español, si no inglés, si no el de la obra. El IDIOMA elegido
    //    viaja con él: la hidratación en lote lo necesita para etiquetar
    //    `repr_meta` y que una visita posterior a la ficha pueda mejorarlo
    //    (spec 2026-08-26 §2). Sin esta etiqueta, un título inglés escrito por
    //    el lote sería indistinguible de uno curado y quedaría congelado —
    //    el modo de fallo de #730.
    const title = entry.es ?? entry.en ?? workTitle;
    const titleLang: "es" | "en" | "other" = entry.es ? "es" : entry.en ? "en" : "other";

    // Un título hecho solo de puntuación («!!!», «—», «...») normaliza a la
    // cadena vacía. `acceptEditionTitle` ya blinda su propia salida, pero
    // nada blinda el título de la obra: si la cadena vacía entrase en el
    // conjunto, casaría con la cadena vacía de CUALQUIER OTRA obra en el
    // mismo caso y las fusionaría, borrando una de las dos. Se descarta aquí.
    const titleSet = new Set(
      [workTitle].map(normalizeTitleForComparison).filter((t) => t.length > 0)
    );

    candidates.push({
      work: {
        workKey: canonical(doc.key as string),
        title,
        titleLang,
        year: typeof doc.first_publish_year === "number" ? doc.first_publish_year : null,
        coverUrl: buildCoverUrl(doc.cover_i),
      },
      titles: titleSet,
      editions: typeof doc.edition_count === "number" ? doc.edition_count : 0,
      order: entry.order,
    });
  }

  // 5. Unir claves canónicas corroboradas o títulos de OBRA equivalentes.
  // Ningún título de edición participa en la identidad. Se conserva el
  // registro con más ediciones y no se heredan alias del registro absorbido.
  const survivors: typeof candidates = [];
  for (const candidate of [...candidates].sort((a, b) => b.editions - a.editions)) {
    const candidateTitles = [...candidate.titles];
    const twin = survivors.find((s) => s.work.workKey === candidate.work.workKey || candidateTitles.some((t) => s.titles.has(t)));
    if (twin) continue;
    survivors.push(candidate);
  }

  // 6. Orden: el de Open Library (`sort=readinglog`, por popularidad), no el de
  //    la desduplicación ni el alfabético.
  return survivors.sort((a, b) => a.order - b.order).map((s) => s.work);
}
