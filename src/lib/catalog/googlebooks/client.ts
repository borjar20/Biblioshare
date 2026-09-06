// Google Books (spec 2026-08-26 §4): enriquecedor por campo (sinopsis en
// español, portada, páginas, idioma) para los huecos que Open Library deja
// crónicamente vacíos, y como identidad de ÚLTIMO RECURSO cuando un ISBN
// existe pero Open Library no lo conoce.
//
// Regla dura: este cliente NUNCA crea una obra a partir de una búsqueda por
// texto. El ISBN identifica sin ambigüedad; el título no. `findBestVolume`
// solo ENRIQUECE una obra que ya existe, y solo si título+autor normalizados
// casan con la respuesta — si no hay match fiable, `null`: mejor un hueco que
// pisar una obra con el dato de otra.
//
// Dependencia BLANDA, igual que inventaire/client.ts: sin
// `GOOGLE_BOOKS_API_KEY` queda desactivado y todo degrada a OpenLibrary-only.
// Nunca lanza — cualquier fallo de red, timeout o cuerpo raro vuelve `null`.
// Ese "cuerpo raro" incluye campos con el TIPO equivocado (`authors` como
// cadena, `title` numérico): `mapVolume` SANEA POR TIPO, así que nadie llama
// después a `.some` sobre una cadena ni a `.toLowerCase` sobre un número, y de
// paso un `synopsis` no-string nunca llega a la base. Mismo estilo defensivo
// que openlibrary/normalize.ts.
import { normalizeTitleForComparison } from "../openlibrary/normalize";
import { isSamePersonName } from "../person-name";
import { isAllowedCoverHost } from "../official-covers";

const API = "https://www.googleapis.com/books/v1/volumes";
// Igual que el resto de fuentes externas del catálogo (openlibrary,
// inventaire): margen de sobra para una API externa sin bloquear al usuario.
const FETCH_TIMEOUT_MS = 4000;
// Los metadatos de un volumen de Google Books no cambian de un día para otro.
const REVALIDATE_SECONDS = 86400;
// Basta con explorar unos pocos candidatos: `findBestVolume` filtra por
// título+autor exacto (normalizado) sobre esta ventana, no hace falta paginar.
const MAX_RESULTS = 5;

export type GoogleVolume = {
  volumeId: string;
  title: string | null;
  authors: string[];
  /** ISBNs que el propio volumen declara (`industryIdentifiers`), normalizados. */
  isbns: string[];
  synopsis: string | null;
  coverUrl: string | null;
  pageCount: number | null;
  language: string | null;
};

// El cuerpo llega de una API externa: NADA está garantizado aquí, ni que el
// campo venga ni que venga con el tipo documentado. Por eso todo es `unknown`
// y lo estrecha `mapVolume`, no una aserción de tipo optimista.
type RawVolume = {
  id?: unknown;
  volumeInfo?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// Un ISBN se compara sin guiones ni espacios y en mayúsculas (la X del dígito
// de control de los ISBN-10): "978-84-101-3840-7" y "9788410138407" son el
// mismo identificador.
function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9Xx]/g, "").toUpperCase();
}

function mapIsbns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(asRecord(entry).identifier))
    .filter((id): id is string => id !== null)
    .map(normalizeIsbn)
    .filter((id) => id.length > 0);
}

// `small` antes que `thumbnail`: cuando existen las dos, `small` es la de
// mayor resolución de las que trae la respuesta por defecto.
function mapCover(links: unknown): string | null {
  const record = asRecord(links);
  const raw = asString(record.small) ?? asString(record.thumbnail);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // La API sirve las miniaturas por http:// y en la resolución más baja
  // (zoom=1); la ficha necesita https (mixed content) y más calidad.
  url.protocol = "https:";
  url.searchParams.set("zoom", "2");
  // Los volúmenes escaneados vienen con `edge=curl`: una esquina rizada con
  // sombra que desentona con las portadas planas de OL/TMDB. Sin el parámetro
  // la imagen se sigue sirviendo, solo que plana.
  url.searchParams.delete("edge");
  const out = url.toString();
  // La URL viaja hasta el cliente y de ahí puede volver manipulada (ver
  // decisiones.md 2026-08-02): solo hosts de la allowlist de portadas
  // oficiales, la misma que usan TMDB y Open Library.
  return isAllowedCoverHost(out) ? out : null;
}

function mapVolume(raw: RawVolume): GoogleVolume | null {
  // Sin `id` no hay con qué anclar el volumen (ni URL de detalle ni cache key).
  const volumeId = asString(raw.id);
  if (!volumeId) return null;
  const info = asRecord(raw.volumeInfo);
  const pageCount = info.pageCount;
  return {
    volumeId,
    title: asString(info.title),
    authors: asStringArray(info.authors),
    isbns: mapIsbns(info.industryIdentifiers),
    synopsis: asString(info.description),
    coverUrl: mapCover(info.imageLinks),
    // 0 páginas no es un libro de 0 páginas: es el campo ausente que Google
    // Books rellena con 0 en vez de omitirlo.
    pageCount: typeof pageCount === "number" && pageCount > 0 ? pageCount : null,
    language: asString(info.language),
  };
}

async function queryVolumes(params: Record<string, string>): Promise<GoogleVolume[]> {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  // Sin key, dependencia BLANDA desactivada: ni se intenta la llamada.
  if (!key) return [];
  try {
    const url = new URL(API);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("key", key);
    url.searchParams.set("maxResults", String(MAX_RESULTS));
    const res = await fetch(url, {
      // OJO: mismo patrón que inventaire/client.ts y openlibrary/*, y con
      // `cacheComponents: true` puede que NO cachee nada (falta `cache:
      // "force-cache"`, o envolver en `use cache`). Sospecha sin confirmar,
      // de alcance repo, en la issue #882 — no se toca aquí en solitario.
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data: { items?: unknown } = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return items.flatMap((raw) => mapVolume(asRecord(raw)) ?? []);
  } catch {
    // Red caída, timeout, JSON roto: todo degrada a "sin enriquecimiento",
    // nunca a un error que tumbe al llamador.
    return [];
  }
}

// Identidad de último recurso: el ISBN no admite ambigüedad — pero esta es la
// ÚNICA vía que CREA obra en el catálogo COMPARTIDO, así que no basta con
// fiarse de que la consulta llevaba `isbn:`: se confirma contra los
// `industryIdentifiers` que el propio volumen declara (vienen gratis en la
// misma respuesta). Defensa en profundidad y fallo cerrado: si el volumen no
// declara el identificador que se pidió, se prefiere el hueco a crear una obra
// con los datos de otra.
export async function findVolumeByIsbn(isbn: string): Promise<GoogleVolume | null> {
  const want = normalizeIsbn(isbn);
  if (!want) return null;
  const volumes = await queryVolumes({ q: `isbn:${isbn}` });
  return volumes.find((v) => v.isbns.includes(want)) ?? null;
}

// Enriquecimiento por texto (spec §4): a diferencia del ISBN, aquí SÍ hace
// falta verificar identidad antes de aceptar nada — título normalizado igual
// y, si se conoce el autor, que case con alguno de los de la respuesta. La
// comparación de autor es `isSameTitle` (title-match.ts), la MISMA que usa
// wikidata-collapse.ts, y por las mismas dos razones (ver su cabecera):
//  1. La contención tiene COTA (65%): "Ana" ya no casa con "Susana Fortes"
//     solo por ser substring, que es lo que pasaba comparando a mano con
//     `normalizeTitleForComparison` + `includes` en los dos sentidos.
//  2. Un nombre que normaliza a vacío (autor de solo puntuación: «—», «...»)
//     no casa con NADA, en vez de desactivar la guarda entera. Con `author`
//     presente la verificación es obligatoria: falla cerrado.
// Sin match fiable, `null`: mejor un hueco que un dato de otra obra.
export async function findBestVolume(
  title: string,
  author: string | null,
  lang: "es" | "en"
): Promise<GoogleVolume | null> {
  // Solo un autor genuinamente ausente (null o en blanco) salta la
  // verificación; cualquier otro texto la exige, normalice a lo que normalice.
  const wantAuthor = author && author.trim().length > 0 ? author : null;
  const q = wantAuthor ? `intitle:${title} inauthor:${wantAuthor}` : `intitle:${title}`;
  const volumes = await queryVolumes({ q, langRestrict: lang });
  const want = normalizeTitleForComparison(title);
  return (
    volumes.find((v) => {
      // El TÍTULO sigue comparándose por igualdad exacta del normalizado, no
      // con `isSameTitle`: asimetría con la línea de abajo que está sin
      // decidir (falla cerrado, pero pierde ediciones con sufijo editorial
      // tipo «(AdN)») — issue #881.
      if (!v.title || normalizeTitleForComparison(v.title) !== want) return false;
      if (!wantAuthor) return true;
      return v.authors.some((a) => isSamePersonName(a, wantAuthor));
    }) ?? null
  );
}
