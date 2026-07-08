import type { SearchResult } from "./types";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";
const TMDB_LOGO_BASE = "https://image.tmdb.org/t/p/w92";
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
