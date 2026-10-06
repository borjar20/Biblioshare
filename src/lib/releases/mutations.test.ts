import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", async () => {
  const { releaseTestClient } = await import("./releases.fixture");
  return { createClient: async () => releaseTestClient() };
});
vi.mock("@/lib/reactivity/revalidate", () => ({ revalidateReleases: vi.fn(), revalidateItemPage: vi.fn(), revalidateLibrary: vi.fn() }));
vi.mock("@/lib/catalog/hydrate-screen", () => ({ ensureMovieHydrated: vi.fn(), ensureSeriesHydrated: vi.fn() }));
vi.mock("@/lib/social/autopost", () => ({ maybeAutopostMilestone: vi.fn() }));
vi.mock("@/lib/margin/deliver", () => ({ deliverMarginNotices: vi.fn() }));
import { addReleaseToPending, cancelEditorialRelease, markEditorialReleaseReviewed, publishEditorialRelease, saveEditorialRelease, setReleaseSubscription } from "./mutations";
import { releaseFixture, releaseTestState as state, resetReleaseFixture } from "./releases.fixture";
import type { ReleaseEditorialInput } from "./types";
beforeEach(resetReleaseFixture);

const input = (): ReleaseEditorialInput => ({ title: "Libro futuro", author: "Autora", modality: "book", market: "ES", language: "es", dateValue: null, datePrecision: "unknown", status: "draft", sourceName: "Editorial", sourceUrl: "https://publisher.example.test/new" });

describe("release personal and editorial mutations", () => {
  it("creates one canonical planned pass and never subscribes implicitly", async () => {
    state.tables.cultural_releases = [releaseFixture()];
    await addReleaseToPending("user-one", releaseFixture().id);
    await addReleaseToPending("user-one", releaseFixture().id);
    expect(state.tables.passes).toHaveLength(1);
    expect(state.tables.passes[0]).toMatchObject({ user_id: "user-one", item_type: "book", item_id: "book-one", status: "planned" });
    expect(state.tables.release_subscriptions).toEqual([]);
    expect(state.rpcCalls).toEqual([]);
  });
  it.each(["in_progress", "completed", "dropped"])("does not reset an existing %s state on a stale add click", async (status) => {
    state.tables.cultural_releases = [releaseFixture()];
    state.tables.passes = [{ id: "existing", user_id: "user-one", item_type: "book", item_id: "book-one", status, is_active: true }];
    await addReleaseToPending("user-one", releaseFixture().id);
    expect(state.tables.passes).toHaveLength(1);
    expect(state.tables.passes[0].status).toBe(status);
  });
  it.each(["in_progress", "completed", "dropped"])("preserves a concurrent %s pass created after the absence read", async (status) => {
    state.tables.cultural_releases = [releaseFixture()];
    const concurrent = { id: "concurrent", user_id: "user-one", item_type: "book", item_id: "book-one", status,
      is_active: true, position: { page: 84 }, started_on: "2026-10-01", finished_on: status === "in_progress" ? null : "2026-10-06",
      rating: 4, pinned_order: 2 };
    state.afterRead = (table) => {
      if (table !== "pass_reviews") return;
      state.afterRead = undefined;
      state.tables.passes.push(structuredClone(concurrent));
    };
    await addReleaseToPending("user-one", releaseFixture().id);
    expect(state.tables.passes).toEqual([concurrent]);
    expect(state.tables.release_subscriptions).toEqual([]);
  });
  it("uses only the stored TMDB identity to register a new work via the catalog path", async () => {
    state.tables.cultural_releases = [releaseFixture({ source: "tmdb", item_type: "movie", modality: "cinema", book_id: null, tmdb_id: 42 })];
    state.handlers.set("consume_request_quota", () => ({ data: true, error: null }));
    state.handlers.set("register_catalog_item", (args) => {
      expect(args).toEqual({ p_item_type: "movie", p_external_id: "42" });
      state.tables.movies.push({ id: "canonical-movie", tmdb_id: 42 });
      return { data: "canonical-movie", error: null };
    });
    expect(await addReleaseToPending("user-one", releaseFixture().id)).toEqual({ itemId: "canonical-movie", itemType: "movie" });
    expect(state.tables.passes[0].item_id).toBe("canonical-movie");
  });
  it("keeps subscription changes independent from the person's library", async () => {
    state.tables.passes = [{ id: "planned", user_id: "user-one", item_id: "book-one", status: "planned", is_active: true }];
    const before = structuredClone(state.tables.passes);
    state.handlers.set("release_set_subscription", ({ p_release_id, p_active }) => {
      state.tables.release_subscriptions = [{ user_id: "user-one", release_id: p_release_id, active: p_active }];
      return { data: state.tables.release_subscriptions, error: null };
    });
    await setReleaseSubscription("user-one", releaseFixture().id, true);
    await setReleaseSubscription("user-one", releaseFixture().id, false);
    expect(state.tables.passes).toEqual(before);
    expect(state.tables.release_subscriptions[0].active).toBe(false);
  });
  it("checks the real session and admin role before any publication or consent write", async () => {
    state.userId = null;
    await expect(setReleaseSubscription("user-one", releaseFixture().id, true)).rejects.toThrow("auth");
    state.userId = "user-one"; state.tables.profiles = [{ user_id: "user-one", role: "collaborator" }];
    await expect(saveEditorialRelease("user-one", input())).rejects.toThrow("forbidden");
    expect(state.rpcCalls).toEqual([]);
  });
  it("publishes/cancels by editorial RPC without using the personal manual-add action", async () => {
    state.tables.cultural_releases = [releaseFixture({ status: "draft", revision: 4 })];
    state.tables.passes = [{ id: "existing-personal-pass", user_id: "user-one", status: "completed" }];
    const before = structuredClone(state.tables.passes);
    state.handlers.set("release_editorial_save", ({ p_input, p_expected_revision }) => {
      expect(p_expected_revision).toBe(4);
      const value = p_input as ReleaseEditorialInput;
      Object.assign(state.tables.cultural_releases[0], { status: value.status });
      return { data: state.tables.cultural_releases, error: null };
    });
    await publishEditorialRelease("user-one", releaseFixture().id, 4, releaseFixture().updated_at);
    expect(state.tables.cultural_releases[0].status).toBe("published");
    await cancelEditorialRelease("user-one", releaseFixture().id, 4, releaseFixture().updated_at);
    expect(state.tables.cultural_releases[0].status).toBe("cancelled");
    expect(state.tables.passes).toEqual(before);
    expect(state.rpcCalls.map((call) => call.name)).toEqual(["release_editorial_save", "release_editorial_save"]);
  });
  it.each([publishEditorialRelease, cancelEditorialRelease, markEditorialReleaseReviewed])("preserves the user's original metadata approval token instead of replacing it on a re-read", async (operation) => {
    const original = releaseFixture().updated_at;
    state.tables.cultural_releases = [releaseFixture({ revision: 4, title: "Metadata changed elsewhere", updated_at: "2026-10-06T09:00:00.123456Z" })];
    state.handlers.set("release_editorial_save", ({ p_expected_revision, p_expected_updated_at }) => {
      expect(p_expected_revision).toBe(4);
      expect(p_expected_updated_at).toBe(original);
      return { data: null, error: { code: "40001", message: "release_edit_conflict" } };
    });
    await expect(operation("user-one", releaseFixture().id, 4, original)).rejects.toMatchObject({ code: "40001" });
    expect(state.tables.cultural_releases[0].updated_at).toBe("2026-10-06T09:00:00.123456Z");
  });
  it("requires both edit tokens and preserves fractional timestamp precision from the UI", async () => {
    await expect(saveEditorialRelease("user-one", input(), releaseFixture().id, 1)).rejects.toThrow("invalid");
    const timestamp = "2026-10-06T08:00:00.123456+00:00";
    state.handlers.set("release_editorial_save", ({ p_expected_updated_at }) => {
      expect(p_expected_updated_at).toBe(timestamp);
      return { data: [releaseFixture()], error: null };
    });
    await saveEditorialRelease("user-one", input(), releaseFixture().id, 1, timestamp);
    expect(state.rpcCalls).toHaveLength(1);
  });
  it("allows absent ISBN and es-ES translation while rejecting invented date precision and unsafe source URLs", async () => {
    state.handlers.set("release_editorial_save", () => ({ data: [releaseFixture()], error: null }));
    expect(await saveEditorialRelease("user-one", { ...input(), modality: "book_translation", language: "es-ES" })).toEqual({ id: releaseFixture().id });
    await expect(saveEditorialRelease("user-one", { ...input(), datePrecision: "month", dateValue: "2026-10-01" })).rejects.toThrow("invalid");
    await expect(saveEditorialRelease("user-one", { ...input(), sourceUrl: "javascript:alert(1)" })).rejects.toThrow("invalid");
    await expect(saveEditorialRelease("user-one", { ...input(), modality: "book_translation", language: "en" })).rejects.toThrow("invalid");
    expect(state.rpcCalls).toHaveLength(1);
  });
});
