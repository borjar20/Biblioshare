import { describe, expect, it } from "vitest";
import { normalizeMovieReleases, normalizeSeriesReleases } from "./tmdb-normalize";

const movie = { id: 42, title: "La prueba", poster_path: "/p.jpg" };
describe("TMDB announcements", () => {
  it("groups one film identity with independently evidenced cinema/digital dates", () => {
    const result = normalizeMovieReleases(movie, { results: [
      { iso_3166_1: "US", release_dates: [{ type: 3, release_date: "2026-10-08T00:00:00.000Z" }, { type: 4, release_date: "2026-10-10T00:00:00.000Z" }] },
      { iso_3166_1: "ES", release_dates: [{ type: 3, release_date: "2026-10-20T00:00:00.000Z" }, { type: 4, release_date: "2026-11-02T00:00:00.000Z" }] },
    ] });
    expect(result.map(({ work_key, channel, market, date_value, platform }) => ({ work_key, channel, market, date_value, platform }))).toEqual([
      { work_key: "tmdb:movie:42", channel: "cinema", market: "ES", date_value: "2026-10-20", platform: null },
      { work_key: "tmdb:movie:42", channel: "cinema", market: "INT", date_value: "2026-10-08", platform: null },
      { work_key: "tmdb:movie:42", channel: "digital", market: "ES", date_value: "2026-11-02", platform: null },
      { work_key: "tmdb:movie:42", channel: "digital", market: "INT", date_value: "2026-10-10", platform: null },
    ]);
  });
  it("a later Spanish announcement preserves international identity and independently chosen consent", () => {
    const international = { iso_3166_1: "US", release_dates: [{ type: 3, release_date: "2026-10-08T00:00:00Z" }] };
    const before = normalizeMovieReleases(movie, { results: [international] });
    const after = normalizeMovieReleases(movie, { results: [international,
      { iso_3166_1: "ES", release_dates: [{ type: 3, release_date: "2026-10-20T00:00:00Z" }] },
    ] });
    expect(after.find((row) => row.market === "INT")).toEqual(before[0]);
    expect(after.find((row) => row.market === "ES")?.source_key).not.toBe(before[0].source_key);
    expect(new Set(after.map((row) => row.work_key)).size).toBe(1);
  });
  it("marks an international date and does not infer digital availability from primary premiere", () => {
    const result = normalizeMovieReleases(movie, { results: [{ iso_3166_1: "US", release_dates: [
      { type: 1, release_date: "2026-10-01T00:00:00Z" }, { type: 3, release_date: "2026-10-15T00:00:00Z" },
      { type: 5, release_date: "2026-11-01T00:00:00Z" }, { type: 6, release_date: "2026-12-01T00:00:00Z" },
    ] }] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ channel: "cinema", market: "INT", date_value: "2026-10-15" });
  });
  it("never converts missing release_dates or invalid days into cancellation/dates", () => {
    expect(normalizeMovieReleases(movie, { results: [] })).toEqual([]);
    expect(normalizeMovieReleases(movie, { results: [{ iso_3166_1: "ES", release_dates: [{ type: 3, release_date: "2026-02-30T00:00:00Z" }] }] })).toEqual([]);
  });
  it("retains one first-series launch plus new seasons, excluding specials and weekly episodes", () => {
    const series = { id: 7, name: "Serie", original_language: "es", first_air_date: "2026-10-20", seasons: [
      { season_number: 0, air_date: "2026-10-25" }, { season_number: 1, air_date: "2026-10-20" },
      { season_number: 2, air_date: "2027-01-05" }, { season_number: 3, air_date: null },
    ], next_episode_to_air: { air_date: "2026-10-30" } };
    const result = normalizeSeriesReleases(series);
    expect(result.map((row) => [row.channel, row.season_number, row.date_value, row.date_precision, row.market])).toEqual([
      ["series", null, "2026-10-20", "day", "INT"], ["season", 2, "2027-01-05", "day", "INT"], ["season", 3, null, "unknown", "INT"],
    ]);
  });
  it.each(["", null])("retains an announced first series without a known date (%s), without duplicating season one or inventing a Spanish date", (firstDate) => {
    const result = normalizeSeriesReleases({ id: 42, name: "Serie anunciada", first_air_date: firstDate, original_language: "en",
      seasons: [{ season_number: 1, air_date: null }] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ source_key: "tv:42:series:INT", work_key: "tmdb:tv:42", channel: "series",
      season_number: null, market: "INT", date_precision: "unknown", date_value: null });
  });
  it("does not replace a stored date with unknown when a detail response omits its date field", () => {
    expect(normalizeSeriesReleases({ id: 42, name: "Serie", seasons: [] })).toEqual([]);
    const incompleteSeason = { season_number: 2 } as { season_number: number; air_date: string | null };
    expect(normalizeSeriesReleases({ id: 42, name: "Serie", seasons: [incompleteSeason] })).toEqual([]);
  });
});
