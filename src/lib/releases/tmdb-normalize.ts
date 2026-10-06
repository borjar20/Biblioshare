import { isExactReleaseDate, parseReleaseDate } from "./precision";
import type { ReleaseCandidate, TmdbReleaseDates, TmdbScreen } from "./provider-model";

const imageUrl = (path: string | null | undefined) => path ? `https://image.tmdb.org/t/p/w342${path}` : null;

export function normalizeMovieReleases(movie: TmdbScreen, releases: TmdbReleaseDates): ReleaseCandidate[] {
  if (!Number.isSafeInteger(movie.id) || movie.id <= 0 || !movie.title?.trim()) throw new Error("malformed_provider_response");
  const rows: ReleaseCandidate[] = [];
  for (const channel of ["cinema", "digital"] as const) {
    const types = channel === "cinema" ? [2, 3] : [4];
    const regional = releases.results.flatMap((region) => region.release_dates
      .filter((row) => types.includes(row.type))
      .map((row) => ({ market: region.iso_3166_1, date: row.release_date.slice(0, 10), language: row.iso_639_1 || null }))
      .filter((row) => isExactReleaseDate(row.date)));
    for (const market of ["ES", "INT"] as const) {
      const selected = regional.filter((row) => market === "ES" ? row.market === "ES" : row.market !== "ES")
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      if (!selected) continue;
      rows.push({
        ...parseReleaseDate(selected.date), source: "tmdb",
        // A Spanish launch is a distinct announcement. It never inherits international consent.
        source_key: `movie:${movie.id}:${channel}:${market}`, work_key: `tmdb:movie:${movie.id}`,
        item_type: "movie", external_id: String(movie.id), title: movie.title.trim(),
        cover_url: imageUrl(movie.poster_path), synopsis: movie.overview || null,
        channel, season_number: null, market, language: selected.language,
        source_url: `https://www.themoviedb.org/movie/${movie.id}/release-dates`, platform: null,
      });
    }
  }
  return rows;
}

/** Seasons use air_date, never next_episode_to_air (weekly episodes are out of scope). */
export function normalizeSeriesReleases(series: TmdbScreen): ReleaseCandidate[] {
  if (!Number.isSafeInteger(series.id) || series.id <= 0 || !series.name?.trim() || !Array.isArray(series.seasons)) {
    throw new Error("malformed_provider_response");
  }
  const common = {
    source: "tmdb" as const, work_key: `tmdb:tv:${series.id}`,
    item_type: "series" as const, external_id: String(series.id), title: series.name.trim(),
    cover_url: imageUrl(series.poster_path), synopsis: series.overview || null,
    // TMDB air_date is international; original_language does not prove a Spanish release.
    market: "INT" as const, language: series.original_language || null, platform: null,
  };
  const rows: ReleaseCandidate[] = [];
  const firstDate = series.first_air_date;
  // An explicit null/empty provider date is a real undated announcement; omission is not evidence.
  if (firstDate !== undefined && (!firstDate || isExactReleaseDate(firstDate))) {
    rows.push({ ...common, ...parseReleaseDate(firstDate), source_key: `tv:${series.id}:series:INT`,
      channel: "series", season_number: null, source_url: `https://www.themoviedb.org/tv/${series.id}` });
  }
  for (const season of series.seasons) {
    // Season 0 = specials; season 1 is already represented by the first-series announcement.
    if (!Number.isInteger(season.season_number) || season.season_number <= 1) continue;
    const date = season.air_date;
    if (date === undefined || (date && !isExactReleaseDate(date))) continue;
    rows.push({ ...common, ...parseReleaseDate(date), source_key: `tv:${series.id}:season:${season.season_number}:INT`,
      channel: "season", season_number: season.season_number,
      source_url: `https://www.themoviedb.org/tv/${series.id}/season/${season.season_number}` });
  }
  return rows;
}
