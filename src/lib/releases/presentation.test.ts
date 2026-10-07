import { describe, expect, it } from "vitest";
import { groupReleaseWorks, groupReleaseDays } from "./presentation";
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

  it("fills weekly slots with complete works before applying the limit", () => {
    const rows = [
      releaseFixture({ id: "limited", work_key: "limited", cover_url: null, synopsis: null, date_value: "2026-10-07" }),
      releaseFixture({ id: "complete-one", work_key: "complete-one", cover_url: "https://images.example/one.jpg", synopsis: "Una sinopsis", date_value: "2026-10-08" }),
      releaseFixture({ id: "complete-two", work_key: "complete-two", cover_url: "https://images.example/two.jpg", synopsis: "Otra sinopsis", date_value: "2026-10-09" }),
    ];
    expect(groupReleaseWorks(rows, { completeness: "complete", limit: 2 }, now).map((work) => work.workKey)).toEqual(["complete-one", "complete-two"]);
    expect(groupReleaseWorks(rows, { completeness: "limited" }, now).map((work) => work.workKey)).toEqual(["limited"]);
    expect(groupReleaseWorks(rows, {}, now)).toHaveLength(3);
  });

  it("does not treat whitespace descriptions or unsafe image URLs as complete metadata", () => {
    const rows = [releaseFixture({ work_key: "unsafe", cover_url: "javascript:alert(1)", synopsis: "Description" }),
      releaseFixture({ id: "blank", work_key: "blank", cover_url: "https://images.example/cover.jpg", synopsis: "  " })];
    expect(groupReleaseWorks(rows, { completeness: "complete" }, now)).toEqual([]);
  });
});

it("organizes the agenda by the first exact date without duplicating multi-date works", () => {
  const works = groupReleaseWorks([
    releaseFixture({ id: "cinema", work_key: "movie", date_value: "2026-10-09", modality: "cinema" }),
    releaseFixture({ id: "digital", work_key: "movie", date_value: "2026-10-11", modality: "digital" }),
    releaseFixture({ id: "other", work_key: "other", date_value: "2026-10-09" }),
    releaseFixture({ id: "earlier", work_key: "earlier", date_value: "2026-10-08" }),
    releaseFixture({ id: "partial", work_key: "partial", date_value: "2026-11", date_precision: "month" }),
  ], {}, now);
  const days = groupReleaseDays(works, now);
  expect(days.map((day) => [day.date, day.works.map((work) => work.workKey)])).toEqual([
    ["2026-10-08", ["earlier"]], ["2026-10-09", ["movie", "other"]],
  ]);
  expect(days[1].works[0].releases.map((release) => release.id)).toEqual(["cinema", "digital"]);
  expect(works.find((work) => work.workKey === "partial")?.releases[0].date_value).toBe("2026-11");
});
it("anchors a mixed personal work to its next published day and retains historical notices", () => {
  const work = groupReleaseWorks([releaseFixture({ id: "future", work_key: "mixed", date_value: "2026-10-10", modality: "digital" })], {}, now)[0];
  const historic = releaseFixture({ id: "historic", work_key: "mixed", date_value: "2026-09-01", status: "cancelled", modality: "cinema" });
  const upcomingCancellation = releaseFixture({ id: "cancelled", work_key: "mixed", date_value: "2026-10-07", status: "cancelled" });
  work.releases.push(historic, upcomingCancellation);
  const days = groupReleaseDays([work], now);
  expect(days[0].date).toBe("2026-10-10");
  expect(days[0].works[0].releases).toEqual([work.releases[0], historic, upcomingCancellation]);
});