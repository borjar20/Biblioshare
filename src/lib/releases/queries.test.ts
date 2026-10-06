import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", async () => {
  const { releaseTestClient } = await import("./releases.fixture");
  return { createClient: async () => releaseTestClient(), createPublicClient: () => releaseTestClient("public") };
});
vi.mock("@/lib/supabase/service-role", async () => {
  const { releaseTestClient } = await import("./releases.fixture");
  return { createServiceRoleClient: () => releaseTestClient("service") };
});
import { getAdminReleases, getPersonalReleases, getPublicReleases, getReleaseById, getReleaseSourceStatus, getReleaseUserState } from "./queries";
import { releaseFixture, releaseTestState as state, resetReleaseFixture } from "./releases.fixture";
beforeEach(resetReleaseFixture);

describe("public read and request-owned interests", () => {
  it("browses provider snapshots without persisting catalog or personal rows", async () => {
    state.tables.cultural_releases = [releaseFixture({ source: "tmdb", item_type: "movie", modality: "cinema", tmdb_id: 42, book_id: null, work_key: "tmdb:movie:42" })];
    const before = structuredClone(state.tables);
    expect(await getPublicReleases({ from: "2026-10-06" })).toHaveLength(1);
    expect(state.tables).toEqual(before);
    expect(state.rpcCalls).toEqual([]);
    expect(state.reads.every((read) => read.kind === "public")).toBe(true);
  });
  it("finds an interest after more than 1000 passes and never reads frozen library_entries", async () => {
    state.tables.passes = Array.from({ length: 1201 }, (_, index) => ({ id: `pass-${String(index).padStart(4, "0")}`, user_id: "user-one", item_type: "book", item_id: `book-${index}`, status: "planned", is_active: true }));
    state.tables.cultural_releases = [releaseFixture({ book_id: "book-1200" })];
    expect(await getPersonalReleases("user-one", { from: "2026-10-06" })).toHaveLength(1);
    expect(state.reads.some((read) => read.table === "passes" && read.from === 1000)).toBe(true);
    expect(state.reads.some((read) => read.table === "library_entries")).toBe(false);
  });
  it("uses saga descendants and known catalog identities for source announcements", async () => {
    state.tables.saga_follows = [{ user_id: "user-one", saga_id: "saga-root" }];
    state.tables.sagas = [{ id: "saga-child", parent_saga_id: "saga-root" }];
    state.tables.saga_items = [{ id: "member", saga_id: "saga-child", item_type: "movie", item_id: "movie-one" }];
    state.tables.movies = [{ id: "movie-one", tmdb_id: 42 }];
    state.tables.cultural_releases = [releaseFixture({ item_type: "movie", modality: "cinema", book_id: null, tmdb_id: 42 })];
    expect((await getPersonalReleases("user-one", { from: "2026-10-06" }))[0].catalogId).toBe("movie-one");
  });
  it("keeps active consent manageable for a past cancelled release without sharing another person's choice", async () => {
    state.tables.cultural_releases = [releaseFixture({ status: "cancelled", date_value: "2025-12-01" })];
    state.tables.release_subscriptions = [{ user_id: "user-one", release_id: releaseFixture().id, active: true }];
    expect(await getPersonalReleases("user-one", { from: "2026-10-06" })).toHaveLength(1);
    state.userId = "user-two";
    expect(await getPersonalReleases("user-two", { from: "2026-10-06" })).toEqual([]);
    await expect(getReleaseUserState("user-one", [releaseFixture().id])).rejects.toThrow("auth");
  });
  it("fails visibly on private selection errors and guards editorial drafts by server role", async () => {
    state.failures.add("passes");
    await expect(getPersonalReleases("user-one")).rejects.toThrow("fixture_passes_failed");
    state.failures.clear(); state.tables.profiles = [{ user_id: "user-one", role: "collaborator" }];
    await expect(getAdminReleases()).rejects.toThrow("forbidden");
  });
  it("resolves an international cancellation deep link outside calendar filters", async () => {
    state.tables.cultural_releases = [releaseFixture({ market: "INT", status: "cancelled", date_value: "2024-01-01" })];
    expect(await getReleaseById(releaseFixture().id)).toMatchObject({ market: "INT", status: "cancelled" });
    expect(await getReleaseById("bad-id")).toBeNull();
    state.failures.add("cultural_releases");
    await expect(getReleaseById(releaseFixture().id)).rejects.toThrow("fixture_cultural_releases_failed");
  });
  it("exposes source timestamps and a generic failure indicator, never raw operational errors", async () => {
    state.tables.release_sync_state = [{ source: "tmdb", last_attempt_at: "2026-10-06T08:00:00Z", last_success_at: null, last_error: "sensitive operation detail" }];
    expect(await getReleaseSourceStatus()).toEqual([{ source: "tmdb", last_attempt_at: "2026-10-06T08:00:00Z", last_success_at: null, last_error: "source_review_failed" }]);
  });
});
