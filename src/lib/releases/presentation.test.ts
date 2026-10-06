import { describe, expect, it } from "vitest";
import { groupReleaseWorks } from "./presentation";
import { releaseFixture } from "./releases.fixture";
const now = new Date("2026-10-06T08:00:00Z");

describe("calendar work grouping and truthful precision", () => {
  it("groups a film once while keeping cinema and digital launch actions independent", () => {
    const base = { item_type: "movie" as const, work_key: "tmdb:movie:42", book_id: null, movie_id: "movie-one" };
    const works = groupReleaseWorks([releaseFixture({ ...base, id: "cinema", modality: "cinema" }), releaseFixture({ ...base, id: "digital", modality: "digital", date_value: "2026-11-20" })], {}, now);
    expect(works).toHaveLength(1);
    expect(works[0].releases.map((row) => row.id)).toEqual(["cinema", "digital"]);
    expect(works[0].catalogId).toBe("movie-one");
  });
  it("ES is the default, international dates require the explicit filter", () => {
    const rows = [releaseFixture({ id: "es" }), releaseFixture({ id: "int", work_key: "other", market: "INT" })];
    expect(groupReleaseWorks(rows, {}, now).flatMap((work) => work.releases.map((row) => row.id))).toEqual(["es"]);
    expect(groupReleaseWorks(rows, { market: "INT" }, now)[0].releases[0].market).toBe("INT");
  });
  it("accepts es-ES books as Castellano and hides unrelated language books", () => {
    const rows = [releaseFixture({ language: "es-ES" }), releaseFixture({ id: "en", work_key: "english", language: "en" })];
    expect(groupReleaseWorks(rows, {}, now)).toHaveLength(1);
  });
  it("keeps month/year/unknown after exact dates and excludes them from the week block", () => {
    const rows = [releaseFixture({ id: "unknown", work_key: "u", date_value: null, date_precision: "unknown" }),
      releaseFixture({ id: "month", work_key: "m", date_value: "2026-10", date_precision: "month" }), releaseFixture({ id: "exact", work_key: "e" })];
    expect(groupReleaseWorks(rows, {}, now).flatMap((work) => work.releases.map((row) => row.id))).toEqual(["exact", "month", "unknown"]);
    expect(groupReleaseWorks(rows, { from: "2026-10-06", to: "2026-10-12", includeUndated: false }, now).flatMap((work) => work.releases.map((row) => row.id))).toEqual(["exact"]);
  });
  it("removes stale known announcements without assigning artificial partial dates", () => {
    expect(groupReleaseWorks([releaseFixture({ date_value: "2025", date_precision: "year" })], {}, now)).toEqual([]);
    expect(groupReleaseWorks([releaseFixture({ status: "draft" })], {}, now)).toEqual([]);
  });
});
