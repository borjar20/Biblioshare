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
import { normalizeTitleForComparison } from "../openlibrary/normalize";
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
  synopsis: string | null;
  coverUrl: string | null;
  pageCount: number | null;
  language: string | null;
};

type RawVolume = {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    description?: string;
    pageCount?: number;
    language?: string;
    imageLinks?: { thumbnail?: string; small?: string };
  };
};

// `small` antes que `thumbnail`: cuando existen las dos, `small` es la de
// mayor resolución de las que trae la respuesta por defecto.
function mapCover(links?: { thumbnail?: string; small?: string }): string | null {
  const raw = links?.small ?? links?.thumbnail;
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
  const out = url.toString();
  // La URL viaja hasta el cliente y de ahí puede volver manipulada (ver
  // decisiones.md 2026-08-02): solo hosts de la allowlist de portadas
  // oficiales, la misma que usan TMDB y Open Library.
  return isAllowedCoverHost(out) ? out : null;
}

function mapVolume(raw: RawVolume): GoogleVolume | null {
  // Sin `id` no hay con qué anclar el volumen (ni URL de detalle ni cache key).
  if (!raw.id) return null;
  const info = raw.volumeInfo ?? {};
  return {
    volumeId: raw.id,
    title: info.title ?? null,
    authors: info.authors ?? [],
    synopsis: info.description ?? null,
    coverUrl: mapCover(info.imageLinks),
    // 0 páginas no es un libro de 0 páginas: es el campo ausente que Google
    // Books rellena con 0 en vez de omitirlo.
    pageCount: typeof info.pageCount === "number" && info.pageCount > 0 ? info.pageCount : null,
    language: info.language ?? null,
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
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data: { items?: RawVolume[] } = await res.json();
    return (data.items ?? []).flatMap((raw) => mapVolume(raw) ?? []);
  } catch {
    // Red caída, timeout, JSON roto: todo degrada a "sin enriquecimiento",
    // nunca a un error que tumbe al llamador.
    return [];
  }
}

// Identidad de último recurso: el ISBN no admite ambigüedad, así que el
// primer resultado es el volumen (no hace falta verificar título/autor).
export async function findVolumeByIsbn(isbn: string): Promise<GoogleVolume | null> {
  const volumes = await queryVolumes({ q: `isbn:${isbn}` });
  return volumes[0] ?? null;
}

// Enriquecimiento por texto (spec §4): a diferencia del ISBN, aquí SÍ hace
// falta verificar identidad antes de aceptar nada — título normalizado igual
// y, si se conoce el autor, que aparezca entre los de la respuesta (también
// normalizado, con contención en los dos sentidos para tolerar "Matt Haig"
// frente a "J. Matt Haig" sin abrir la puerta a autores distintos). Sin match
// fiable, `null`: mejor un hueco que un dato de otra obra.
export async function findBestVolume(
  title: string,
  author: string | null,
  lang: "es" | "en"
): Promise<GoogleVolume | null> {
  const q = author ? `intitle:${title} inauthor:${author}` : `intitle:${title}`;
  const volumes = await queryVolumes({ q, langRestrict: lang });
  const want = normalizeTitleForComparison(title);
  const wantAuthor = author ? normalizeTitleForComparison(author) : null;
  return (
    volumes.find((v) => {
      if (!v.title || normalizeTitleForComparison(v.title) !== want) return false;
      if (!wantAuthor) return true;
      return v.authors.some((a) => {
        const n = normalizeTitleForComparison(a);
        return n.includes(wantAuthor) || wantAuthor.includes(n);
      });
    }) ?? null
  );
}
