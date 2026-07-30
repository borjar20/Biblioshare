import { labelForSlug } from "./genre-vocab";

// TMDB entrega solo ids de género en la búsqueda. Los ids son estables, así que se
// mapean por id a slugs canónicos SIN pedir a la API la lista de nombres (antes
// tmdb.ts hacía un fetch a /genre/{kind}/list por proceso). El nombre localizado
// de TMDB no se guarda nunca: se resuelve la label desde el slug del registro.
//
// Ids compuestos de TV (Action & Adventure, Sci-Fi & Fantasy, War & Politics)
// emiten varios slugs. Ids sin canónico (Kids, Reality, Talk, News, TV Movie,
// Soap) NO están en la tabla → se descartan.
//
// Confirmado en vivo 2026-07-30 contra
// https://api.themoviedb.org/3/genre/movie/list?language=es-ES y
// https://api.themoviedb.org/3/genre/tv/list?language=es-ES (coincide char a
// char con lo esperado en el Step 1 del brief):
// movie → 28 Acción, 12 Aventura, 16 Animación, 35 Comedia, 80 Crimen,
//   99 Documental, 18 Drama, 10751 Familia, 14 Fantasía, 36 Historia,
//   27 Terror, 10402 Música, 9648 Misterio, 10749 Romance,
//   878 Ciencia ficción, 10770 Película de TV, 53 Suspense, 10752 Bélica,
//   37 Western.
// tv → 10759 Action & Adventure, 16 Animación, 35 Comedia, 80 Crimen,
//   99 Documental, 18 Drama, 10751 Familia, 10762 Kids, 9648 Misterio,
//   10763 News, 10764 Reality, 10765 Sci-Fi & Fantasy, 10766 Soap,
//   10767 Talk, 10768 War & Politics, 37 Western.
const MAX_GENRES = 5;

export const TMDB_GENRE_TO_SLUGS: Record<number, string[]> = {
  // --- movie + tv compartidos ---
  16: ["animacion"],
  35: ["comedia"],
  80: ["crimen"],
  99: ["documental"],
  18: ["drama"],
  10751: ["familia"],
  9648: ["misterio"],
  37: ["western"],
  // --- solo movie ---
  28: ["accion"],
  12: ["aventura"],
  14: ["fantasia"],
  36: ["historia"],
  27: ["terror"],
  10402: ["musica"],
  10749: ["romance"],
  878: ["ciencia-ficcion"],
  53: ["thriller"], // "Suspense" en es-ES
  10752: ["belica"],
  // --- solo tv, compuestos ---
  10759: ["accion", "aventura"], // Action & Adventure
  10765: ["ciencia-ficcion", "fantasia"], // Sci-Fi & Fantasy
  10768: ["belica", "politica"], // War & Politics
  // Ruido tv (10762 Kids, 10763 News, 10764 Reality, 10766 Soap, 10767 Talk) y
  // movie (10770 TV Movie) se omiten a propósito.
};

// Puente para el backfill (Task 5): las filas viejas de movies/series guardan la
// label es-ES cruda de TMDB, no el id. Se deriva de la MISMA tabla de ids usando
// los nombres es-ES confirmados en el Step 1. Mantener sincronizado con Step 1.
export const TMDB_LABEL_ES_TO_SLUGS: Record<string, string[]> = {
  "Acción": ["accion"],
  "Aventura": ["aventura"],
  "Animación": ["animacion"],
  "Comedia": ["comedia"],
  "Crimen": ["crimen"],
  "Documental": ["documental"],
  "Drama": ["drama"],
  "Familia": ["familia"],
  "Fantasía": ["fantasia"],
  "Historia": ["historia"],
  "Terror": ["terror"],
  "Música": ["musica"],
  "Misterio": ["misterio"],
  "Romance": ["romance"],
  "Ciencia ficción": ["ciencia-ficcion"],
  "Suspense": ["thriller"],
  "Bélica": ["belica"],
  "Western": ["western"],
  "Action & Adventure": ["accion", "aventura"],
  "Sci-Fi & Fantasy": ["ciencia-ficcion", "fantasia"],
  "War & Politics": ["belica", "politica"],
  // "Película de TV", "Kids", "News", "Reality", "Soap", "Talk" → sin entrada = descartadas.
};

function slugsToLabels(slugs: string[]): string[] {
  const out: string[] = [];
  for (const slug of slugs) {
    const label = labelForSlug(slug);
    if (label && !out.includes(label)) {
      out.push(label);
      if (out.length === MAX_GENRES) break;
    }
  }
  return out;
}

export function resolveGenresFromIds(ids: number[] | undefined): string[] {
  if (!ids || ids.length === 0) return [];
  const slugs: string[] = [];
  for (const id of ids) {
    for (const slug of TMDB_GENRE_TO_SLUGS[id] ?? []) slugs.push(slug);
  }
  return slugsToLabels(slugs);
}

export function resolveGenresFromEsLabels(
  labels: string[] | null | undefined,
): string[] {
  if (!labels || labels.length === 0) return [];
  const slugs: string[] = [];
  for (const label of labels) {
    for (const slug of TMDB_LABEL_ES_TO_SLUGS[label] ?? []) slugs.push(slug);
  }
  return slugsToLabels(slugs);
}
