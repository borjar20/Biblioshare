import { normalizeIsbn, isValidIsbnCheckDigit } from "../isbn";
import { buildCoverUrl } from "./covers";

// Documento crudo de OpenLibrary tal como viene de
// GET /works/<key>/editions.json (campo `entries`). Solo los campos que
// usamos para filtrar y mapear.
export type OpenLibraryEditionDoc = {
  title?: string;
  isbn_13?: string[];
  isbn_10?: string[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  languages?: Array<{ key?: string }>;
  physical_format?: string;
  covers?: number[];
};

export type OpenLibraryEdition = {
  isbn: string;
  label: string;
  publisher: string | null;
  year: number | null;
  language: string | null;
  totalPages: number | null;
  coverUrl: string | null;
  // Título tal cual lo trae ESTA edición (puede ser una traducción distinta
  // del título de la obra). Lo usan las candidatas de representación
  // (fetchRepresentationCandidates); el sync masivo a `book_editions` no lo
  // necesita y lo ignora.
  title: string | null;
};

const DEFAULT_LIMIT = 20;

// Códigos de idioma de OpenLibrary (3 letras, MARC) a ISO 639-1 (2 letras),
// para los idiomas que razonablemente aparecen entre las ediciones de un
// libro. Lo que no se reconoce se deja en null antes que arriesgar un
// código erróneo.
const LANGUAGE_CODES: Record<string, string> = {
  spa: "ES",
  eng: "EN",
  fre: "FR",
  fra: "FR",
  ger: "DE",
  deu: "DE",
  ita: "IT",
  por: "PT",
  cat: "CA",
  glg: "GL",
  dut: "NL",
  nld: "NL",
  rus: "RU",
  jpn: "JA",
  chi: "ZH",
  zho: "ZH",
  ara: "AR",
  kor: "KO",
  swe: "SV",
  nor: "NO",
  dan: "DA",
  fin: "FI",
  pol: "PL",
  cze: "CS",
  ces: "CS",
  gre: "EL",
  ell: "EL",
  heb: "HE",
  tur: "TR",
  ukr: "UK",
  rum: "RO",
  ron: "RO",
  hun: "HU",
  hin: "HI",
};

// Prioridad de idioma para ordenar: español e inglés primero (son los que
// mayoritariamente va a leer el usuario de esta app), luego el resto sin
// distinción.
function languagePriority(language: string | null): number {
  if (language === "ES") return 0;
  if (language === "EN") return 1;
  return 2;
}

function extractLanguage(doc: OpenLibraryEditionDoc): string | null {
  const key = doc.languages?.[0]?.key;
  if (!key) return null;
  const code = key.replace("/languages/", "");
  return LANGUAGE_CODES[code] ?? null;
}

const FORMAT_LABELS: Record<string, string> = {
  Hardcover: "Tapa dura",
  Paperback: "Bolsillo",
  "Mass Market Paperback": "Bolsillo",
  "Trade Paperback": "Rústica",
};

function labelFromFormat(format: string | undefined): string {
  if (!format) return "Edición";
  return FORMAT_LABELS[format] ?? "Edición";
}

function parseYear(publishDate: string | undefined): number | null {
  if (!publishDate) return null;
  const match = publishDate.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

function extractIsbn(doc: OpenLibraryEditionDoc): string | null {
  const candidate = doc.isbn_13?.[0] ?? doc.isbn_10?.[0];
  if (!candidate) return null;
  const normalized = normalizeIsbn(candidate);
  if (!normalized) return null;
  return isValidIsbnCheckDigit(normalized) ? normalized : null;
}

// Editoriales de impresión bajo demanda (POD): reimpresiones automáticas y sin
// curar, casi siempre de dominio público subido en bloque. No las tiene nadie
// "en la mano" y en obras muy reeditadas (los clásicos) inundan las primeras
// páginas de resultados, desplazando a las ediciones reales. Se compara en
// minúsculas y sin acentos, y por "contiene" (que ya cubre "empieza por"):
// así "Independently Published" e "Independently published (self)" caen
// igual. Aviso para quien retoque esto: "bod" es una entrada corta y por
// tanto arriesgada (podría atrapar "Bodley Head" u otra editorial legítima
// que empiece por esas letras); se acepta el riesgo porque "Books on Demand"
// (la empresa alemana que firma así) es un emisor de ruido real y frecuente.
const PRINT_ON_DEMAND_PUBLISHERS = [
  "independently published",
  "createspace",
  "lulu",
  "blurb",
  "bibliobazaar",
  "nabu press",
  "kessinger",
  "sagwan press",
  "franklin classics",
  "wentworth press",
  "hansebooks",
  "outlook verlag",
  "bod",
  "books on demand",
];

// Minúsculas y sin diacríticos, para que la lista negra no falle por un
// acento o una mayúscula distintos entre ediciones.
function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function isPrintOnDemandPublisher(publisher: string | null): boolean {
  if (!publisher) return false;
  const normalized = normalizeForComparison(publisher);
  return PRINT_ON_DEMAND_PUBLISHERS.some((needle) => normalized.includes(needle));
}

// El filtro que decide si el selector de ediciones sirve de algo o es ruido:
// descarta lo que no se puede identificar (sin ISBN válido), deduplica, y
// ordena para que lo más útil (idioma del usuario, datos completos, más
// reciente) aparezca primero. Puro a propósito: es lo que se testea.
export function pickEditions(
  raw: OpenLibraryEditionDoc[],
  limit: number = DEFAULT_LIMIT
): OpenLibraryEdition[] {
  const seen = new Set<string>();
  const mapped: OpenLibraryEdition[] = [];

  for (const doc of raw) {
    const isbn = extractIsbn(doc);
    if (!isbn) continue;
    if (seen.has(isbn)) continue;

    // Ruido de impresión bajo demanda: se descarta antes de mapear, ni
    // siquiera cuenta para el tope de `limit`.
    const publisher = doc.publishers?.[0] ?? null;
    if (isPrintOnDemandPublisher(publisher)) continue;

    seen.add(isbn);

    mapped.push({
      isbn,
      label: labelFromFormat(doc.physical_format),
      publisher,
      year: parseYear(doc.publish_date),
      language: extractLanguage(doc),
      totalPages: typeof doc.number_of_pages === "number" ? doc.number_of_pages : null,
      coverUrl: buildCoverUrl(doc.covers?.[0], "L"),
      title: doc.title ?? null,
    });
  }

  mapped.sort((a, b) => {
    const langDiff = languagePriority(a.language) - languagePriority(b.language);
    if (langDiff !== 0) return langDiff;

    // Portada: casi siempre es la diferencia entre una edición real y una
    // reimpresión fantasma que se coló pese a tener editorial "normal". No
    // se descarta la que no tiene (alguna edición legítima carece de ella),
    // solo queda peor puntuada.
    const aCover = a.coverUrl ? 0 : 1;
    const bCover = b.coverUrl ? 0 : 1;
    if (aCover !== bCover) return aCover - bCover;

    const aKnown = a.totalPages !== null || a.publisher !== null ? 0 : 1;
    const bKnown = b.totalPages !== null || b.publisher !== null ? 0 : 1;
    if (aKnown !== bKnown) return aKnown - bKnown;

    return (b.year ?? -Infinity) - (a.year ?? -Infinity);
  });

  return mapped.slice(0, limit);
}

type EditionsResponse = {
  entries?: OpenLibraryEditionDoc[];
  size?: number; // total real de ediciones de la obra, lo traiga o no la propia página
};

const EDITIONS_PAGE_SIZE = 100;
// Tope de páginas a pedir para obras muy reeditadas (los clásicos, que son
// justo el caso que falla si solo se mira una página: las primeras 100
// entradas de un work con miles de ediciones suelen ser reimpresiones POD
// recientes, y las ediciones reales quedan mucho más atrás en el listado).
// 5 páginas = 500 ediciones es el punto en el que ya aparecen ediciones
// españolas reales del Quijote sin disparar el número de llamadas para el
// resto de libros, que tienen muchas menos.
const MAX_EDITIONS_PAGES = 5;
const FETCH_TIMEOUT_MS = 5000;

// Una sola página de editions.json. Nunca lanza: un fallo aquí (timeout, red,
// respuesta no-ok) se trata como "esta página no aportó nada", no como un
// fallo de toda la operación.
async function fetchEditionsPage(key: string, offset: number): Promise<EditionsResponse | null> {
  try {
    const url = `https://openlibrary.org/works/${key}/editions.json?limit=${EDITIONS_PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Tope de páginas para el escaneo en vivo de fetchRepresentationCandidates
// (candidatas de representación ES/EN al identificar un pase): a diferencia
// del sync masivo de arriba, esto corre síncrono en una petición del usuario
// (no en background), así que 2 páginas (200 ediciones) es el límite de lo
// que se puede pedir sin que la identificación se note lenta. No comparte
// constante con MAX_EDITIONS_PAGES a propósito: son límites de dos rutas con
// presupuestos de tiempo distintos, y esta puede subir o bajar sin tocar la
// otra.
const MAX_REPRESENTATION_PAGES = 2;

// Núcleo de paginación compartido por fetchWorkEditions y
// fetchRepresentationCandidates: ambos piden la primera página, miran `size`
// para saber si hace falta pedir más, y traen el resto EN PARALELO
// (Promise.allSettled, tolerando que alguna falle) — solo cambia hasta
// cuántas páginas está dispuesto a llegar cada uno. Devuelve los documentos
// en bruto, sin pasar por pickEditions: cada llamante decide qué límite final
// aplicar.
async function fetchEditionDocs(workKey: string, maxPages: number): Promise<OpenLibraryEditionDoc[]> {
  const key = workKey.replace(/^\/?works\//, "").replace(/^\//, "");
  if (!key) return [];

  const first = await fetchEditionsPage(key, 0);
  if (!first) return [];

  const entries: OpenLibraryEditionDoc[] = Array.isArray(first.entries) ? [...first.entries] : [];
  const total = typeof first.size === "number" ? first.size : entries.length;

  if (total > EDITIONS_PAGE_SIZE) {
    const pagesToFetch = Math.min(maxPages, Math.ceil(total / EDITIONS_PAGE_SIZE)) - 1;
    const offsets = Array.from({ length: pagesToFetch }, (_, i) => (i + 1) * EDITIONS_PAGE_SIZE);

    const results = await Promise.allSettled(
      offsets.map((offset) => fetchEditionsPage(key, offset))
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value?.entries) {
        entries.push(...result.value.entries);
      }
    }
  }

  return entries;
}

// Trae las ediciones reales de una obra desde OpenLibrary. Nunca lanza: si la
// API falla, tarda más de 5s o devuelve algo inesperado, la ficha del libro
// no puede caerse por ello, así que se degrada a lista vacía.
//
// Pagina cuando hace falta: la primera página ya trae `size` (el total real
// de ediciones), así que si el libro tiene 100 ediciones o menos no se pide
// nada más — es el caso de la inmensa mayoría de libros. Solo para obras muy
// reeditadas se piden hasta 4 páginas adicionales, todas EN PARALELO
// (Promise.allSettled) para no multiplicar por 5 el tiempo de la primera
// visita a la ficha, y tolerando que alguna falle: un timeout parcial no deja
// la ficha sin ediciones, simplemente se trabaja con lo que llegó a tiempo.
export async function fetchWorkEditions(workKey: string): Promise<OpenLibraryEdition[]> {
  try {
    const entries = await fetchEditionDocs(workKey, MAX_EDITIONS_PAGES);
    return pickEditions(entries);
  } catch {
    return [];
  }
}

// Candidata de representación: título, portada y páginas de UNA edición
// concreta (no de la obra). "Mejor" según el mismo orden que ya aplica
// pickEditions (idioma, luego portada, luego datos, luego año) — no se
// reinventa el criterio, solo se lee el primer resultado por idioma.
export type EditionCandidate = {
  title: string | null;
  coverUrl: string | null;
  pages: number | null;
};

function toCandidate(edition: OpenLibraryEdition | null): EditionCandidate | null {
  if (!edition) return null;
  return { title: edition.title, coverUrl: edition.coverUrl, pages: edition.totalPages };
}

// Mediana, no media: unas pocas ediciones atípicas (ómnibus, "edición del
// coleccionista" con extras) bastan para disparar la media muy por encima de
// lo que de verdad tiene la mayoría de tiradas, y este número se usa como
// estimación de progreso cuando el pase no tiene edición identificada — ahí
// un valor inflado por un outlier es peor que uno ligeramente corto.
function median(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Candidatas de representación (título + portada preferidos) para la ficha de
// una obra, mirando las ediciones reales de OpenLibrary: la mejor española,
// la mejor inglesa (spec: ES → EN → resto), y una mediana de páginas
// orientativa para cuando el pase no tenga edición propia identificada.
//
// NO PERSISTE NADA: a diferencia de fetchWorkEditions (que alimenta el sync
// masivo a `book_editions`), esto es una vista previa en vivo — las ediciones
// solo se guardan cuando el usuario identifica la suya. Escaneo acotado a
// MAX_REPRESENTATION_PAGES (200 ediciones) y reutiliza pickEditions sin
// límite de resultado (ya viene acotado por lo escaneado) para que la
// mediana se calcule sobre todo lo filtrado, no solo sobre el primer puñado.
// Nunca lanza: cualquier fallo (red, parseo) degrada a los tres campos null.
export async function fetchRepresentationCandidates(
  workKey: string
): Promise<{ es: EditionCandidate | null; en: EditionCandidate | null; pagesMedian: number | null }> {
  try {
    const entries = await fetchEditionDocs(workKey, MAX_REPRESENTATION_PAGES);
    // Sin límite de resultado: ya viene acotado por lo escaneado
    // (MAX_REPRESENTATION_PAGES), y con `entries` vacío pickEditions ya
    // devuelve `[]` por sí solo, sin necesitar un caso especial aparte.
    const editions = pickEditions(entries, entries.length);

    const es = toCandidate(editions.find((edition) => edition.language === "ES") ?? null);
    const en = toCandidate(editions.find((edition) => edition.language === "EN") ?? null);

    const pages = editions
      .map((edition) => edition.totalPages)
      .filter((value): value is number => value !== null);

    return { es, en, pagesMedian: median(pages) };
  } catch {
    // Defensa igual que fetchWorkEditions: si pickEditions o fetchEditionDocs
    // llegaran a lanzar (hoy no lo hacen, ver sus propios comentarios), esto
    // no puede tirar la identificación del pase.
    return { es: null, en: null, pagesMedian: null };
  }
}

type IsbnLookupResponse = {
  works?: Array<{ key?: string }>;
};

// Para libros a los que no se les conoce el work key: se resuelve a partir de
// un ISBN. Igual que fetchWorkEditions, nunca lanza.
export async function resolveWorkKey(isbn: string): Promise<string | null> {
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const data: IsbnLookupResponse = await res.json();
    const key = data.works?.[0]?.key;
    return typeof key === "string" ? key : null;
  } catch {
    return null;
  }
}
