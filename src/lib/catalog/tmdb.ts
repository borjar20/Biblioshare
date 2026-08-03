import type { CreditRole } from "@/lib/people/types";
import type { SearchResult } from "./types";
import { resolveGenresFromIds } from "./tmdb-genres";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";
const TMDB_LOGO_BASE = "https://image.tmdb.org/t/p/w92";
const TMDB_PROFILE_BASE = "https://image.tmdb.org/t/p/w185";
const TMDB_STILL_BASE = "https://image.tmdb.org/t/p/w300";
const WATCH_PROVIDERS_REGION = "ES";

type TmdbSearchResponse = {
  results?: Array<{
    id: number;
    title?: string; // movie
    original_title?: string; // movie
    name?: string; // tv
    original_name?: string; // tv
    poster_path: string | null;
    release_date?: string; // movie
    first_air_date?: string; // tv
    overview?: string;
    genre_ids?: number[];
  }>;
};

async function tmdbSearch(kind: "movie" | "tv", query: string, language = "es-ES") {
  const accessToken = process.env.TMDB_API_KEY;
  if (!accessToken) return [];

  const url = new URL(`https://api.themoviedb.org/3/search/${kind}`);
  url.searchParams.set("query", query);
  url.searchParams.set("language", language);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];

  const data: TmdbSearchResponse = await res.json();
  return data.results ?? [];
}

type TmdbMovieResult = NonNullable<TmdbSearchResponse["results"]>[number];

function mapMovieResult(r: TmdbMovieResult): SearchResult {
  return {
    itemType: "movie" as const,
    externalId: String(r.id),
    title: r.title!,
    // Título original (idioma de rodaje). El matcher del importador lo compara
    // junto al `title` traducido y al internacional en inglés.
    originalTitle: r.original_title ?? null,
    // No director available from a search-results response (needs a
    // separate credits call); the year is shown via `year`.
    subtitle: null,
    coverUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
    year: r.release_date ? Number(r.release_date.slice(0, 4)) || null : null,
    synopsis: r.overview ?? null,
    genres: resolveGenresFromIds(r.genre_ids),
  };
}

export async function searchMovies(query: string): Promise<SearchResult[]> {
  const results = await tmdbSearch("movie", query);
  return results.filter((r) => r.title).map(mapMovieResult);
}

/**
 * Los candidatos para casar una fila de Letterboxd, con los TRES títulos que
 * puede tener una película anotados.
 *
 * Letterboxd construye su catálogo desde TMDB **en-US**, así que su `diary.csv`
 * exporta el título en inglés: "Spirited Away", que no es ni el `title` es-ES
 * que cacheamos ("El viaje de Chihiro") ni el `original_title` (千と千尋の神隠し).
 * La PR #356 dio por hecho que exportaba el original y por eso todo el cine no
 * anglosajón seguía sin casar. Ver decisiones.md (2026-08-03).
 *
 * Se consulta en **en-US**, no en es-ES, y eso importa por dos motivos. Uno: el
 * título que hay que casar es el inglés. Dos: TMDB ordena por relevancia CONTRA
 * EL TÍTULO EN ESE IDIOMA, así que buscar "Parasite" en es-ES deja la película
 * de Bong Joon-ho (allí "Parásitos") fuera de la primera página — 95 resultados
 * en 5 páginas, y la buena no está en la primera.
 *
 * Por eso el `title` de estos candidatos viene EN INGLÉS y va anotado también
 * como `englishTitle`: son de usar y tirar, para comparar y para enseñárselos al
 * usuario cuando tiene que desempatar. La ficha en español se pide por id
 * (`getMovieAsSearchResult`) solo para la que acaba eligiéndose, que es la única
 * que se cachea — así el catálogo no se llena de títulos ingleses y se gasta una
 * llamada por película nueva en vez de dos por fila.
 */
export async function searchMoviesForImport(query: string): Promise<SearchResult[]> {
  const results = await tmdbSearch("movie", query, "en-US");
  return results
    .filter((r) => r.title)
    .map((r) => ({ ...mapMovieResult(r), englishTitle: r.title ?? null }));
}

/**
 * Ficha en español de una película por id, con la forma de un resultado de
 * búsqueda. Es lo que se cachea cuando el importador da de alta una película:
 * sus candidatos vienen en inglés (ver `searchMoviesForImport`) y guardarlos tal
 * cual dejaría "Parasite" en un catálogo que en todas partes dice "Parásitos".
 */
export async function getMovieAsSearchResult(
  tmdbId: number
): Promise<SearchResult | null> {
  const data = await tmdbGet<{
    title?: string;
    original_title?: string;
    poster_path: string | null;
    release_date?: string;
    overview?: string;
    genres?: Array<{ id: number }>;
  }>(`/movie/${tmdbId}?language=es-ES`);
  if (!data?.title) return null;

  return mapMovieResult({
    id: tmdbId,
    title: data.title,
    original_title: data.original_title,
    poster_path: data.poster_path,
    release_date: data.release_date,
    overview: data.overview,
    // El endpoint de ficha devuelve los géneros como objetos, no como ids.
    genre_ids: (data.genres ?? []).map((g) => g.id),
  });
}

export type WatchProvider = {
  id: number;
  name: string;
  logoUrl: string;
};

export type WatchProviders = {
  // TMDB's own watch page for this title/region — required attribution
  // link when displaying this data (see docs/REQUIREMENTS.md §7.25).
  tmdbLink: string;
  flatrate: WatchProvider[];
};

type TmdbWatchProvidersResponse = {
  results?: Record<
    string,
    {
      link?: string;
      flatrate?: Array<{ provider_id: number; provider_name: string; logo_path: string }>;
    }
  >;
};

// TMDB's /watch/providers endpoint surfaces the same regional streaming
// availability data as JustWatch (TMDB has a data-sharing agreement with
// them) — no separate JustWatch integration needed. See docs/REQUIREMENTS.md
// §7.25.
export async function getWatchProviders(
  kind: "movie" | "tv",
  tmdbId: number
): Promise<WatchProviders | null> {
  const accessToken = process.env.TMDB_API_KEY;
  if (!accessToken) return null;

  const res = await fetch(
    `https://api.themoviedb.org/3/${kind}/${tmdbId}/watch/providers`,
    { headers: { Authorization: `Bearer ${accessToken}` }, next: { revalidate: 86400 } }
  );
  if (!res.ok) return null;

  const data: TmdbWatchProvidersResponse = await res.json();
  const region = data.results?.[WATCH_PROVIDERS_REGION];
  if (!region) return null;

  const flatrate = (region.flatrate ?? []).map((p) => ({
    id: p.provider_id,
    name: p.provider_name,
    logoUrl: `${TMDB_LOGO_BASE}${p.logo_path}`,
  }));

  if (flatrate.length === 0 && !region.link) return null;

  return {
    tmdbLink: region.link ?? `https://www.themoviedb.org/${kind}/${tmdbId}/watch`,
    flatrate,
  };
}

// ── Detalles enriquecidos: reparto/equipo, personas y colecciones (sagas) ────
// Alimentan las fichas de persona (§7.34) y la pertenencia a saga. Se consumen
// de forma perezosa ("cache-as-you-go") al abrir una ficha; ver src/lib/people
// y src/lib/sagas.

const MAX_CAST = 10;

// Trabajos de equipo que nos interesan (top-billed + roles clave); el resto se
// descarta para no saturar la ficha. `created_by` (series) se mapea aparte.
const CREW_JOB_ROLES: Record<string, CreditRole> = {
  Director: "director",
  Writer: "writer",
  Screenplay: "writer",
  Story: "writer",
};

type TmdbCreditsPayload = {
  cast?: Array<{
    id: number;
    name: string;
    character?: string | null;
    profile_path: string | null;
    order?: number;
  }>;
  crew?: Array<{
    id: number;
    name: string;
    job?: string;
    profile_path: string | null;
  }>;
};

export type CreditPerson = {
  tmdbId: number;
  name: string;
  photoUrl: string | null;
  role: CreditRole;
  character: string | null;
  billingOrder: number | null;
};

export type ScreenCollection = {
  tmdbId: number;
  name: string;
  coverUrl: string | null;
};

export type ScreenDetails = {
  collection: ScreenCollection | null;
  credits: CreditPerson[];
  // Size data for time-to-complete estimates (§7.22). Movie-only/series-only
  // fields are null on the other type.
  runtimeMinutes: number | null;
  numberOfEpisodes: number | null;
  numberOfSeasons: number | null;
  episodeRuntimeMinutes: number | null;
};

function profileUrl(path: string | null | undefined): string | null {
  return path ? `${TMDB_PROFILE_BASE}${path}` : null;
}

async function tmdbGet<T>(path: string): Promise<T | null> {
  const accessToken = process.env.TMDB_API_KEY;
  if (!accessToken) return null;

  const res = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function mapScreenCredits(
  credits: TmdbCreditsPayload | undefined,
  creators: Array<{ id: number; name: string; profile_path: string | null }> = []
): CreditPerson[] {
  const out: CreditPerson[] = [];
  const seen = new Set<string>(); // dedupe por (tmdbId, role)

  for (const c of creators) {
    const key = `${c.id}:creator`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      tmdbId: c.id,
      name: c.name,
      photoUrl: profileUrl(c.profile_path),
      role: "creator",
      character: null,
      billingOrder: null,
    });
  }

  const cast = (credits?.cast ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, MAX_CAST);
  for (const c of cast) {
    const key = `${c.id}:cast`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      tmdbId: c.id,
      name: c.name,
      photoUrl: profileUrl(c.profile_path),
      role: "cast",
      character: c.character ?? null,
      billingOrder: c.order ?? null,
    });
  }

  for (const c of credits?.crew ?? []) {
    const role = c.job ? CREW_JOB_ROLES[c.job] : undefined;
    if (!role) continue;
    const key = `${c.id}:${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      tmdbId: c.id,
      name: c.name,
      photoUrl: profileUrl(c.profile_path),
      role,
      character: null,
      billingOrder: null,
    });
  }

  return out;
}

export async function getMovieDetails(
  tmdbId: number
): Promise<ScreenDetails | null> {
  const data = await tmdbGet<{
    belongs_to_collection: {
      id: number;
      name: string;
      poster_path: string | null;
    } | null;
    credits?: TmdbCreditsPayload;
    runtime?: number | null;
  }>(`/movie/${tmdbId}?language=es-ES&append_to_response=credits`);
  if (!data) return null;

  const c = data.belongs_to_collection;
  return {
    collection: c
      ? {
          tmdbId: c.id,
          name: c.name,
          coverUrl: c.poster_path ? `${TMDB_IMAGE_BASE}${c.poster_path}` : null,
        }
      : null,
    credits: mapScreenCredits(data.credits),
    runtimeMinutes: typeof data.runtime === "number" && data.runtime > 0 ? data.runtime : null,
    numberOfEpisodes: null,
    numberOfSeasons: null,
    episodeRuntimeMinutes: null,
  };
}

// `episode_run_time` es un array (una entrada por duración habitual de la
// serie) y viene vacío en muchas series modernas de duración variable. En ese
// caso TMDB sí trae la duración del último episodio emitido en la misma
// respuesta, que es una aproximación razonable. Ver §7.22.
function pickEpisodeRuntime(
  runtimes: number[] | undefined,
  lastEpisodeRuntime: number | null | undefined
): number | null {
  const first = (runtimes ?? []).find((minutes) => minutes > 0);
  if (first) return first;
  return typeof lastEpisodeRuntime === "number" && lastEpisodeRuntime > 0
    ? lastEpisodeRuntime
    : null;
}

export async function getSeriesDetails(
  tmdbId: number
): Promise<ScreenDetails | null> {
  const data = await tmdbGet<{
    created_by?: Array<{ id: number; name: string; profile_path: string | null }>;
    credits?: TmdbCreditsPayload;
    number_of_episodes?: number | null;
    number_of_seasons?: number | null;
    episode_run_time?: number[];
    last_episode_to_air?: { runtime?: number | null } | null;
  }>(`/tv/${tmdbId}?language=es-ES&append_to_response=credits`);
  if (!data) return null;

  return {
    collection: null, // las series de TMDB no usan belongs_to_collection
    credits: mapScreenCredits(data.credits, data.created_by ?? []),
    runtimeMinutes: null,
    numberOfEpisodes:
      typeof data.number_of_episodes === "number" && data.number_of_episodes > 0
        ? data.number_of_episodes
        : null,
    numberOfSeasons:
      typeof data.number_of_seasons === "number" && data.number_of_seasons > 0
        ? data.number_of_seasons
        : null,
    episodeRuntimeMinutes: pickEpisodeRuntime(
      data.episode_run_time,
      data.last_episode_to_air?.runtime
    ),
  };
}

// Un episodio del catálogo, tal como se persiste en series_episodes (§7.x).
export type SeriesEpisode = {
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  synopsis: string | null;
  stillUrl: string | null;
  airDate: string | null; // ISO date
  runtimeMinutes: number | null;
};

type TmdbSeasonResponse = {
  episodes?: Array<{
    season_number?: number;
    episode_number?: number;
    name?: string | null;
    overview?: string | null;
    still_path?: string | null;
    air_date?: string | null;
    runtime?: number | null;
  }>;
};

// Trae todos los episodios de una serie recorriendo sus temporadas
// (`/tv/{id}/season/{n}`). TMDB numera las temporadas desde 1; la 0 son
// "especiales" y se omite. Alimenta el cache-as-you-go de series_episodes;
// nunca lanza (las temporadas que fallen se descartan). Ver §7.x.
export async function getSeriesEpisodes(
  tmdbId: number,
  totalSeasons: number
): Promise<SeriesEpisode[]> {
  const seasons = Array.from({ length: Math.max(0, totalSeasons) }, (_, i) => i + 1);
  const perSeason = await Promise.all(
    seasons.map((n) =>
      tmdbGet<TmdbSeasonResponse>(`/tv/${tmdbId}/season/${n}?language=es-ES`)
    )
  );

  const out: SeriesEpisode[] = [];
  for (const season of perSeason) {
    for (const ep of season?.episodes ?? []) {
      if (typeof ep.season_number !== "number" || typeof ep.episode_number !== "number") {
        continue;
      }
      out.push({
        seasonNumber: ep.season_number,
        episodeNumber: ep.episode_number,
        title: ep.name?.trim() || null,
        synopsis: ep.overview?.trim() || null,
        stillUrl: ep.still_path ? `${TMDB_STILL_BASE}${ep.still_path}` : null,
        airDate: ep.air_date || null,
        runtimeMinutes:
          typeof ep.runtime === "number" && ep.runtime > 0 ? ep.runtime : null,
      });
    }
  }
  return out;
}

export type PersonDetails = {
  bio: string | null;
  photoUrl: string | null;
  birthDate: string | null;
  deathDate: string | null;
  placeOfBirth: string | null;
};

export async function getPersonDetails(
  tmdbId: number
): Promise<PersonDetails | null> {
  const data = await tmdbGet<{
    biography?: string;
    profile_path: string | null;
    birthday?: string | null;
    deathday?: string | null;
    place_of_birth?: string | null;
  }>(`/person/${tmdbId}?language=es-ES`);
  if (!data) return null;

  // La biografía en español suele venir vacía; caemos a inglés en ese caso.
  let bio = data.biography?.trim() || null;
  if (!bio) {
    const en = await tmdbGet<{ biography?: string }>(
      `/person/${tmdbId}?language=en-US`
    );
    bio = en?.biography?.trim() || null;
  }

  return {
    bio,
    photoUrl: profileUrl(data.profile_path),
    birthDate: data.birthday || null,
    deathDate: data.deathday || null,
    placeOfBirth: data.place_of_birth || null,
  };
}

export type CollectionDetails = {
  name: string;
  overview: string | null;
  coverUrl: string | null;
  parts: Array<{
    tmdbId: number;
    title: string;
    coverUrl: string | null;
    year: number | null;
    synopsis: string | null;
  }>;
};

export async function getCollection(
  collectionId: number
): Promise<CollectionDetails | null> {
  const data = await tmdbGet<{
    name: string;
    overview?: string;
    poster_path: string | null;
    parts?: Array<{
      id: number;
      title?: string;
      poster_path: string | null;
      release_date?: string;
      overview?: string;
    }>;
  }>(`/collection/${collectionId}?language=es-ES`);
  if (!data) return null;

  const parts = (data.parts ?? [])
    .filter((p) => p.title)
    .map((p) => ({
      tmdbId: p.id,
      title: p.title!,
      coverUrl: p.poster_path ? `${TMDB_IMAGE_BASE}${p.poster_path}` : null,
      year: p.release_date ? Number(p.release_date.slice(0, 4)) || null : null,
      synopsis: p.overview ?? null,
    }))
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));

  return {
    name: data.name,
    overview: data.overview?.trim() || null,
    coverUrl: data.poster_path ? `${TMDB_IMAGE_BASE}${data.poster_path}` : null,
    parts,
  };
}

export async function searchSeries(query: string): Promise<SearchResult[]> {
  const results = await tmdbSearch("tv", query);
  return results
    .filter((r) => r.name)
    .map((r) => ({
      itemType: "series" as const,
      externalId: String(r.id),
      title: r.name!,
      // Nombre original (idioma de emisión) — el equivalente de `original_title`
      // para series. Mismo motivo que en `searchMovies`: `name` viene en es-ES.
      originalTitle: r.original_name ?? null,
      subtitle: null,
      coverUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
      year: r.first_air_date
        ? Number(r.first_air_date.slice(0, 4)) || null
        : null,
      synopsis: r.overview ?? null,
      genres: resolveGenresFromIds(r.genre_ids),
      publisher: null,
      pageCount: null,
      isbn: null,
    }));
}

// ── Galería de portadas oficiales (editor de ficha) ──────────────────────────
// TMDB /images devuelve TODOS los posters de la obra (varios idiomas/ediciones).
// Se usan para ofrecer al colaborador portadas oficiales alternas a la actual.
export type TmdbImagesResponse = {
  posters?: Array<{ file_path?: string | null }>;
};

// Puro: mapea file_path -> URL absoluta con el mismo base (w342) que las
// portadas importadas, para que la elegida sea coherente con el resto.
export function mapPosterPaths(data: TmdbImagesResponse | null): string[] {
  return (data?.posters ?? [])
    .map((p) => p.file_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .map((p) => `${TMDB_IMAGE_BASE}${p}`);
}

// `include_image_language=es,en,null` prioriza posters en español/inglés y los
// sin idioma (arte sin texto); TMDB los ordena por votos. Nunca lanza: tmdbGet
// ya devuelve null si no hay API key o la llamada falla.
export async function getPosterPaths(
  kind: "movie" | "tv",
  tmdbId: number
): Promise<string[]> {
  const data = await tmdbGet<TmdbImagesResponse>(
    `/${kind}/${tmdbId}/images?include_image_language=es,en,null`
  );
  return mapPosterPaths(data);
}
