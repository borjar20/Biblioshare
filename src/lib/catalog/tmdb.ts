import type { SearchResult } from "./types";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

type TmdbSearchResponse = {
  results?: Array<{
    id: number;
    title?: string; // movie
    name?: string; // tv
    poster_path: string | null;
    release_date?: string; // movie
    first_air_date?: string; // tv
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

export async function searchMovies(query: string): Promise<SearchResult[]> {
  const results = await tmdbSearch("movie", query);
  return results
    .filter((r) => r.title)
    .map((r) => ({
      itemType: "movie" as const,
      externalId: String(r.id),
      title: r.title!,
      // No director/creator available from a search-results response
      // (needs a separate credits call); the year is shown via `year`.
      subtitle: null,
      coverUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
      year: r.release_date ? Number(r.release_date.slice(0, 4)) || null : null,
      publisher: null,
      pageCount: null,
    }));
}

export async function searchSeries(query: string): Promise<SearchResult[]> {
  const results = await tmdbSearch("tv", query);
  return results
    .filter((r) => r.name)
    .map((r) => ({
      itemType: "series" as const,
      externalId: String(r.id),
      title: r.name!,
      subtitle: null,
      coverUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
      year: r.first_air_date
        ? Number(r.first_air_date.slice(0, 4)) || null
        : null,
      publisher: null,
      pageCount: null,
    }));
}
