import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const provider = vi.hoisted(() => vi.fn());
vi.mock("./tmdb-provider", () => ({ collectTmdbReleases: provider }));
import { syncTmdbReleases } from "./sync";
import { releaseFixture, releaseTestClient, releaseTestState as state, resetReleaseFixture } from "./releases.fixture";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { normalizeMovieReleases } from "./tmdb-normalize";
const now = new Date("2026-10-06T08:00:00Z");
const client = () => releaseTestClient("service") as unknown as ReturnType<typeof createServiceRoleClient>;
beforeEach(() => { resetReleaseFixture(); provider.mockReset(); });

describe("source freshness and failure preservation", () => {
  it("does not replace known dates with empty results on provider failure", async () => {
    state.tables.cultural_releases = [releaseFixture({ source: "tmdb", item_type: "movie", tmdb_id: 42, modality: "cinema" })];
    state.tables.release_sync_state = [{ source: "tmdb", last_attempt_at: null, last_success_at: "2026-10-05T08:00:00Z", last_error: null }];
    const before = structuredClone(state.tables.cultural_releases);
    provider.mockRejectedValue(new Error("tmdb_network"));
    const report = await syncTmdbReleases(client(), now);
    expect(report.failed).toBe(true);
    expect(state.tables.cultural_releases).toEqual(before);
    expect(state.tables.release_sync_state[0]).toMatchObject({ last_success_at: "2026-10-05T08:00:00Z", last_error: "tmdb_network" });
  });
  it("a successful empty review advances the source timestamp without implying cancellation", async () => {
    state.tables.cultural_releases = [releaseFixture({ source: "tmdb", item_type: "movie", tmdb_id: 42, modality: "cinema" })];
    const before = structuredClone(state.tables.cultural_releases);
    provider.mockResolvedValue({ releases: [], checkedWorks: [{ item_type: "movie", tmdb_id: 42 }], failedWorks: 0, discoveryFailed: false });
    expect(await syncTmdbReleases(client(), now)).toMatchObject({ attempted: true, failed: false, checkedWorks: 1 });
    expect(state.tables.cultural_releases).toEqual(before);
    expect(state.tables.release_sync_state[0].last_success_at).toBe(now.toISOString());
  });
  it("keeps source failure visible when only part of the selected works could be checked", async () => {
    provider.mockResolvedValue({ releases: [], checkedWorks: [], failedWorks: 1, discoveryFailed: true });
    await syncTmdbReleases(client(), now);
    expect(state.tables.release_sync_state[0]).toMatchObject({ last_error: "tmdb_partial_failure" });
    expect(state.tables.release_sync_state[0].last_success_at).toBeNull();
  });
  it("checks tracked announcements once a Madrid day, retrying failures separately", async () => {
    state.tables.release_sync_state = [{ source: "tmdb", last_success_at: now.toISOString(), last_attempt_at: now.toISOString() }];
    expect((await syncTmdbReleases(client(), now)).attempted).toBe(false);
    expect(provider).not.toHaveBeenCalled();
  });
  it("allows only one overlapping caller to acquire the same source review", async () => {
    provider.mockResolvedValue({ releases: [], checkedWorks: [], failedWorks: 0, discoveryFailed: false });
    const reviews = await Promise.all([syncTmdbReleases(client(), now), syncTmdbReleases(client(), now)]);
    expect(reviews.filter((review) => review.attempted)).toHaveLength(1);
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("a superseded job cannot rewrite source freshness or import an older response", async () => {
    const sourceRow = state.tables.release_sync_state[0];
    provider.mockImplementation(async () => {
      sourceRow.last_attempt_at = "2026-10-06T09:01:00Z";
      sourceRow.last_success_at = "2026-10-06T09:02:00Z";
      return { releases: [{ source_key: "movie:42:cinema:ES", work_key: "tmdb:movie:42", item_type: "movie", external_id: "42", title: "Old", cover_url: null, synopsis: null, channel: "cinema", season_number: null, market: "ES", language: null, source_url: "https://www.themoviedb.org/movie/42/release-dates", platform: null, date_value: "2026-10-07", date_precision: "day" }], checkedWorks: [], failedWorks: 0, discoveryFailed: false };
    });
    const report = await syncTmdbReleases(client(), now);
    expect(report.superseded).toBe(true);
    expect(state.rpcCalls).toEqual([]);
    expect(sourceRow.last_success_at).toBe("2026-10-06T09:02:00Z");
  });
  it("passes its exact attempt to the atomic import fence and observes a race rejected by SQL", async () => {
    const releases = normalizeMovieReleases({ id: 42, title: "Anuncio" }, { results: [{ iso_3166_1: "ES", release_dates: [{ type: 3, release_date: "2026-10-07T00:00:00Z" }] }] });
    provider.mockResolvedValue({ releases, checkedWorks: [], failedWorks: 0, discoveryFailed: false });
    state.handlers.set("release_upsert_tmdb", ({ p_expected_attempt }) => {
      expect(p_expected_attempt).toBe(now.toISOString());
      state.tables.release_sync_state[0].last_attempt_at = "2026-10-06T09:00:00Z";
      state.tables.release_sync_state[0].last_success_at = "2026-10-06T09:01:00Z";
      return { data: null, error: { code: "40001", message: "release_sync_attempt_conflict" } };
    });
    expect(await syncTmdbReleases(client(), now)).toMatchObject({ superseded: true, imported: 0, failed: false });
    expect(state.tables.release_sync_state[0].last_success_at).toBe("2026-10-06T09:01:00Z");
  });
  it("a final zero-row source update reports supersession rather than fresh success", async () => {
    provider.mockImplementation(async () => {
      state.tables.release_sync_state[0].last_attempt_at = "2026-10-06T09:00:00Z";
      return { releases: [], checkedWorks: [], failedWorks: 0, discoveryFailed: false };
    });
    expect(await syncTmdbReleases(client(), now)).toMatchObject({ superseded: true, imported: 0 });
    expect(state.tables.release_sync_state[0].last_success_at).toBeNull();
  });
});
