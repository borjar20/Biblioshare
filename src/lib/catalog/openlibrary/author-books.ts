import { normalizeAuthorWorks, type NormalizedWork, type OpenLibraryAuthorWorkDoc } from "./normalize";

// La bibliografía de un autor, en DOS llamadas a search.json.
//
// Sustituye a /authors/<key>/works.json, que era un volcado en crudo: sin
// orden, sin edition_count y con fecha en menos de la mitad de las entradas.
// search.json trae año, portada, idiomas y conteo, y con `editions.title` +
// `lang` devuelve además el título de la mejor edición en ese idioma — de ahí
// que hagan falta dos pasadas y no una: la española da «En llamas» y la
// inglesa da «Catching Fire», y tener las dos es lo que permite reconocer que
// dos registros distintos son el mismo libro.
//
// LÍMITE ASUMIDO: `limit=100` y sin paginar. Un autor con más de cien obras se
// queda con las cien más populares, que es mejor que las mil sin ordenar que
// traía el endpoint anterior.

const SEARCH_FIELDS =
  "key,title,cover_i,first_publish_year,edition_count,language,editions,editions.title,editions.language";
const WORKS_LIMIT = 100;
const REVALIDATE_SECONDS = 86400;
const FETCH_TIMEOUT_MS = 5000;

type SearchResponse = { docs?: OpenLibraryAuthorWorkDoc[] };

// Acepta "OL1A" y "/authors/OL1A": `people.openlibrary_key` guarda la forma
// corta, pero no cuesta nada tolerar la larga.
function normalizeAuthorKey(key: string): string {
  return key.trim().replace(/^\/?authors\//, "");
}

async function fetchPass(authorKey: string, lang: "es" | "en"): Promise<OpenLibraryAuthorWorkDoc[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("author_key", authorKey);
  url.searchParams.set("fields", SEARCH_FIELDS);
  url.searchParams.set("limit", String(WORKS_LIMIT));
  url.searchParams.set("sort", "readinglog");
  url.searchParams.set("lang", lang);

  const res = await fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`search.json ${lang}: ${res.status}`);

  const data: SearchResponse = await res.json();
  return data.docs ?? [];
}

// Nunca lanza: [] significa «no se pudo saber», y la ficha se degrada a lo que
// haya en la base de datos.
export async function fetchAuthorWorks(authorKey: string): Promise<NormalizedWork[]> {
  const key = normalizeAuthorKey(authorKey ?? "");
  if (!key) return [];

  try {
    // En paralelo: son independientes y así la ficha no espera el doble.
    const [docsEs, docsEn] = await Promise.all([fetchPass(key, "es"), fetchPass(key, "en")]);
    return normalizeAuthorWorks(docsEs, docsEn);
  } catch (error) {
    console.error("fetchAuthorWorks failed", { authorKey, error });
    return [];
  }
}
