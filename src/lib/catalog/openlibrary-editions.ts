import { normalizeIsbn, isValidIsbnCheckDigit } from "./isbn";
import { buildCoverUrl } from "./open-library";

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
    seen.add(isbn);

    mapped.push({
      isbn,
      label: labelFromFormat(doc.physical_format),
      publisher: doc.publishers?.[0] ?? null,
      year: parseYear(doc.publish_date),
      language: extractLanguage(doc),
      totalPages: typeof doc.number_of_pages === "number" ? doc.number_of_pages : null,
      coverUrl: buildCoverUrl(doc.covers?.[0], "L"),
    });
  }

  mapped.sort((a, b) => {
    const langDiff = languagePriority(a.language) - languagePriority(b.language);
    if (langDiff !== 0) return langDiff;

    const aKnown = a.totalPages !== null || a.publisher !== null ? 0 : 1;
    const bKnown = b.totalPages !== null || b.publisher !== null ? 0 : 1;
    if (aKnown !== bKnown) return aKnown - bKnown;

    return (b.year ?? -Infinity) - (a.year ?? -Infinity);
  });

  return mapped.slice(0, limit);
}

type EditionsResponse = {
  entries?: OpenLibraryEditionDoc[];
};

// Trae las ediciones reales de una obra desde OpenLibrary. Nunca lanza: si la
// API falla, tarda más de 5s o devuelve algo inesperado, la ficha del libro
// no puede caerse por ello, así que se degrada a lista vacía.
export async function fetchWorkEditions(workKey: string): Promise<OpenLibraryEdition[]> {
  try {
    const key = workKey.replace(/^\/?works\//, "").replace(/^\//, "");
    if (!key) return [];

    const url = `https://openlibrary.org/works/${key}/editions.json?limit=100`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];

    const data: EditionsResponse = await res.json();
    const entries = Array.isArray(data.entries) ? data.entries : [];
    return pickEditions(entries);
  } catch {
    return [];
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
