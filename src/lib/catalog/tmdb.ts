import type { CreditRole } from "@/lib/people/types";
import type { SearchResult } from "./types";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";
const TMDB_LOGO_BASE = "https://image.tmdb.org/t/p/w92";
const TMDB_PROFILE_BASE = "https://image.tmdb.org/t/p/w185";
const WATCH_PROVIDERS_REGION = "ES";

type TmdbSearchResponse = {
  results?: Array<{
    id: number;
    title?: string; // movie
    name?: string; // tv
    poster_path: string | null;
    release_date?: string; // movie
    first_air_date?: string; // tv
    overview?: string;
    genre_ids?: number[];
  }>;
};

async function tmdbSearch(kind: "movie" | "tv", query: string) {
  const accessToken = process.env.TMDB_API_KEY;
  if (!accessToken) return [];

  const url = new URL(`https://api.themoviedb.org/3/search/${kind}`);
  url.searchParams.set("query", query);
  url.searchParams.set("language", "es-ES");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];

  const data: TmdbSearchResponse = await res.json();
  return data.results ?? [];
}

// TMDB search results only give genre ids, not names — the id→name mapping
// barely ever changes, so cache it per server process instead of resolving
// names with an extra request per search.
const genreMapCache = new Map<"movie" | "tv", Map<number, string>>();

async function getGenreMap(kind: "movie" | "tv"): Promise<Map<number, string>> {
  const cached = genreMapCache.get(kind);
  if (cached) return cached;

  const accessToken = process.env.TMDB_API_KEY;
  if (!accessToken) return new Map();

  const res = await fetch(
    `https://api.themoviedb.org/3/genre/${kind}/list?language=es-ES`,
    { headers: { Authorization: `Bearer ${accessToken}` }, next: { revalidate: 86400 } }
  );
  if (!res.ok) return new Map();

  const data: { genres?: Array<{ id: number; name: string }> } = await res.json();
  const map = new Map((data.genres ?? []).map((g) => [g.id, g.name]));
  genreMapCache.set(kind, map);
  return map;
}

async function resolveGenres(
  kind: "movie" | "tv",
  ids?: number[]
): Promise<string[] | null> {
  if (!ids || ids.length === 0) return null;
  const map = await getGenreMap(kind);
  const names = ids.map((id) => map.get(id)).filter((n): n is string => Boolean(n));
  return names.length > 0 ? names : null;
}

export async function searchMovies(query: string): Promise<SearchResult[]> {
  const results = await tmdbSearch("movie", query);
  return Promise.all(
    results
      .filter((r) => r.title)
      .map(async (r) => ({
        itemType: "movie" as const,
        externalId: String(r.id),
        title: r.title!,
        // No director available from a search-results response (needs a
        // separate credits call); the year is shown via `year`.
        subtitle: null,
        coverUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
        year: r.release_date ? Number(r.release_date.slice(0, 4)) || null : null,
        synopsis: r.overview ?? null,
        genres: await resolveGenres("movie", r.genre_ids),
        publisher: null,
        pageCount: null,
        isbn: null,
      }))
  );
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
  };
}

export async function getSeriesDetails(
  tmdbId: number
): Promise<ScreenDetails | null> {
  const data = await tmdbGet<{
    created_by?: Array<{ id: number; name: string; profile_path: string | null }>;
    credits?: TmdbCreditsPayload;
    number_of_episodes?: number | null;
    number_of_seasons?: number | null;
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
  };
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
  return Promise.all(
    results
      .filter((r) => r.name)
      .map(async (r) => ({
        itemType: "series" as const,
        externalId: String(r.id),
        title: r.name!,
        subtitle: null,
        coverUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
        year: r.first_air_date
          ? Number(r.first_air_date.slice(0, 4)) || null
          : null,
        synopsis: r.overview ?? null,
        genres: await resolveGenres("tv", r.genre_ids),
        publisher: null,
        pageCount: null,
        isbn: null,
      }))
  );
}
