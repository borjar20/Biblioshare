import "server-only";
import type { ReleaseCandidate, TmdbReleaseDates, TmdbScreen } from "./provider-model";
import { normalizeMovieReleases, normalizeSeriesReleases } from "./tmdb-normalize";

type DiscoverPage = { results: TmdbScreen[]; total_pages: number };
export type TrackedTmdbWork = { item_type: "movie" | "series"; tmdb_id: number };
export type TmdbReleaseBatch = {
  releases: ReleaseCandidate[];
  checkedWorks: TrackedTmdbWork[];
  failedWorks: number;
  discoveryFailed: boolean;
};

export class ReleaseProviderError extends Error {
  constructor(public readonly code: "configuration" | "network" | "http" | "malformed", public readonly status?: number) {
    super(`tmdb_${code}`);
  }
}

async function tmdbRequest<T>(path: string, parameters: Record<string, string> = {}): Promise<T> {
  // Same server credential used by the existing catalog adapter; it never enters a public snapshot.
  const accessToken = process.env.TMDB_API_KEY;
  if (!accessToken) throw new ReleaseProviderError("configuration");
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.set("language", "es-ES");
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ReleaseProviderError("network");
  }
  if (!response.ok) throw new ReleaseProviderError("http", response.status);
  try {
    return await response.json() as T;
  } catch {
    throw new ReleaseProviderError("malformed");
  }
}

async function discover(kind: "movie" | "tv", parameters: Record<string, string>, pages: number): Promise<TmdbScreen[]> {
  const items: TmdbScreen[] = [];
  const maxPages = Math.max(1, Math.min(3, Math.floor(pages)));
  for (let page = 1; page <= maxPages; page++) {
    const result = await tmdbRequest<DiscoverPage>(`discover/${kind}`, { ...parameters, page: String(page), include_adult: "false" });
    if (!Array.isArray(result.results) || !Number.isInteger(result.total_pages) || result.total_pages < 0) {
      throw new ReleaseProviderError("malformed");
    }
    items.push(...result.results);
    if (page >= result.total_pages) break;
  }
  return items;
}

export async function getTmdbWorkReleases(work: TrackedTmdbWork): Promise<ReleaseCandidate[]> {
  if (!Number.isSafeInteger(work.tmdb_id) || work.tmdb_id <= 0) throw new ReleaseProviderError("malformed");
  if (work.item_type === "movie") {
    const movie = await tmdbRequest<TmdbScreen & { release_dates: TmdbReleaseDates }>(`movie/${work.tmdb_id}`, { append_to_response: "release_dates" });
    if (movie.id !== work.tmdb_id || !Array.isArray(movie.release_dates?.results) || movie.release_dates.results.some((r) => !Array.isArray(r.release_dates))) {
      throw new ReleaseProviderError("malformed");
    }
    return normalizeMovieReleases(movie, movie.release_dates);
  }
  const series = await tmdbRequest<TmdbScreen>(`tv/${work.tmdb_id}`);
  if (series.id !== work.tmdb_id) throw new ReleaseProviderError("malformed");
  return normalizeSeriesReleases(series);
}

/** Bounded discovery plus every tracked upcoming work, including those absent from discovery. */
export async function collectTmdbReleases(
  from: string,
  to: string,
  tracked: TrackedTmdbWork[] = [],
  pages = 2,
): Promise<TmdbReleaseBatch> {
  if (!process.env.TMDB_API_KEY) throw new ReleaseProviderError("configuration");
  const queries = await Promise.allSettled([
    discover("movie", { region: "ES", "release_date.gte": from, "release_date.lte": to, with_release_type: "2|3|4", sort_by: "popularity.desc" }, pages),
    discover("movie", { "primary_release_date.gte": from, "primary_release_date.lte": to, sort_by: "primary_release_date.asc" }, pages),
    discover("tv", { "first_air_date.gte": from, "first_air_date.lte": to, sort_by: "first_air_date.asc" }, pages),
    discover("tv", { "air_date.gte": from, "air_date.lte": to, sort_by: "popularity.desc" }, pages),
  ]);
  const workByKey = new Map<string, TrackedTmdbWork>();
  for (const work of tracked) workByKey.set(`${work.item_type}:${work.tmdb_id}`, work);
  queries.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    for (const item of result.value) {
      if (!Number.isSafeInteger(item.id) || item.id <= 0) continue;
      const item_type = index < 2 ? "movie" : "series";
      workByKey.set(`${item_type}:${item.id}`, { item_type, tmdb_id: item.id });
    }
  });
  const trackedKeys = new Set(tracked.map((work) => `${work.item_type}:${work.tmdb_id}`));
  const works = [...workByKey.values()];
  const batch: TmdbReleaseBatch = { releases: [], checkedWorks: [], failedWorks: 0, discoveryFailed: queries.some((result) => result.status === "rejected") };
  // Four requests in flight at most; one slow/failing work does not erase successful work snapshots.
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, works.length) }, async () => {
    while (cursor < works.length) {
      const work = works[cursor++];
      try {
        const rows = await getTmdbWorkReleases(work);
        batch.checkedWorks.push(work);
        const trackedWork = trackedKeys.has(`${work.item_type}:${work.tmdb_id}`);
        batch.releases.push(...rows.filter((row) => trackedWork || row.date_value === null || (row.date_value >= from && row.date_value <= to)));
      } catch {
        batch.failedWorks++;
      }
    }
  }));
  return batch;
}
