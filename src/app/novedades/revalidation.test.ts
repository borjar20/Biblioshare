import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReleaseEditorialInput } from "@/lib/releases/types";

const cache = vi.hoisted(() => ({ paths: vi.fn(), expiredTags: vi.fn(), updatedTags: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: cache.paths, revalidateTag: cache.expiredTags, updateTag: cache.updatedTags }));
vi.mock("@/lib/supabase/server", async () => {
  const { releaseTestClient, releaseTestState } = await import("@/lib/releases/releases.fixture");
  return {
    createClient: async () => releaseTestClient(),
    getCurrentUser: async () => releaseTestState.userId ? { id: releaseTestState.userId } : null,
  };
});
vi.mock("@/lib/auth/roles", async () => {
  const { releaseTestState } = await import("@/lib/releases/releases.fixture");
  return { getCurrentUserRole: async () => releaseTestState.tables.profiles.find((row) => row.user_id === releaseTestState.userId)?.role };
});
vi.mock("@/lib/catalog/hydrate-screen", () => ({ ensureMovieHydrated: vi.fn(), ensureSeriesHydrated: vi.fn() }));
vi.mock("@/lib/social/autopost", () => ({ maybeAutopostMilestone: vi.fn() }));
vi.mock("@/lib/margin/deliver", () => ({ deliverMarginNotices: vi.fn() }));

import { addNoveltyToPending, chooseReleaseNotice } from "./actions";
import { cancelBookAnnouncement, publishBookAnnouncement, reviewBookAnnouncement, saveBookAnnouncement } from "../admin/novedades/actions";
import { releaseFixture, releaseTestState as state, resetReleaseFixture } from "@/lib/releases/releases.fixture";

const release = releaseFixture();
const input: ReleaseEditorialInput = {
  title: "Libro corregido", author: "Autora", modality: "book", market: "ES", language: "es", datePrecision: "unknown", dateValue: null,
  status: "published", sourceName: "Editorial", sourceUrl: "https://publisher.example.test/announcement",
};
const commonPaths = ["/novedades", "/admin/novedades", "/"];
const editorPath = `/admin/novedades/${release.id}`;
const editorialActions = [
  ["borrador nuevo", () => saveBookAnnouncement(input)],
  ["corrección editorial", () => saveBookAnnouncement(input, release.id, release.revision, release.updated_at)],
  ["publicación", () => publishBookAnnouncement(release.id, release.revision, release.updated_at)],
  ["cancelación", () => cancelBookAnnouncement(release.id, release.revision, release.updated_at)],
  ["revisión de fuente", () => reviewBookAnnouncement(release.id, release.revision, release.updated_at)],
] as const;

beforeEach(() => {
  resetReleaseFixture();
  vi.clearAllMocks();
  state.tables.cultural_releases = [releaseFixture()];
  state.handlers.set("release_set_subscription", ({ p_release_id, p_active }) => {
    state.tables.release_subscriptions = [{ user_id: state.userId, release_id: p_release_id, active: p_active }];
    return { data: state.tables.release_subscriptions, error: null };
  });
  state.handlers.set("release_editorial_save", ({ p_input }) => {
    const announcement = p_input as ReleaseEditorialInput;
    Object.assign(state.tables.cultural_releases[0], { title: announcement.title, status: announcement.status });
    return { data: state.tables.cultural_releases, error: null };
  });
});

function expectPaths(paths: string[]) {
  // Compare the complete scope and multiplicity; ordering is not part of the contract.
  expect(cache.paths.mock.calls.map(([path]) => path).sort()).toEqual([...paths].sort());
  expect(cache.expiredTags).not.toHaveBeenCalled();
  expect(cache.updatedTags).not.toHaveBeenCalled();
}

describe("revalidación de Novedades tras escrituras reales del dominio", () => {
  it("añadir a Pendiente refresca ficha, biblioteca, calendario, cola editorial e Inicio una vez", async () => {
    expect(await addNoveltyToPending(release.id)).toEqual({ ok: true });
    expect(state.tables.passes).toEqual([expect.objectContaining({ item_id: release.book_id, status: "planned" })]);
    expectPaths([...commonPaths, `/libro/${release.book_id}`, "/coleccion"]);
  });

  it.each([true, false])("elegir aviso %s refresca la selección después de persistir sin tocar la biblioteca", async (enabled) => {
    expect(await chooseReleaseNotice(release.id, enabled)).toEqual({ ok: true });
    expect(state.tables.release_subscriptions).toEqual([{ user_id: "user-one", release_id: release.id, active: enabled }]);
    expect(state.tables.passes).toEqual([]);
    expectPaths(commonPaths);
  });

  it.each(editorialActions)("%s refresca calendario, cola, Inicio y el editor concreto una vez", async (_name, action) => {
    expect(await action()).toMatchObject({ ok: true });
    expect(state.rpcCalls.map((call) => call.name)).toEqual(["release_editorial_save"]);
    expect(state.tables.passes).toEqual([]);
    expectPaths([...commonPaths, editorPath]);
  });

  it("un fallo al crear el pase no invalida ninguna ruta", async () => {
    state.failures.add("passes");
    expect(await addNoveltyToPending(release.id)).toMatchObject({ ok: false });
    expect(state.tables.passes).toEqual([]);
    expectPaths([]);
  });

  it("un rechazo al guardar el consentimiento no invalida ninguna ruta", async () => {
    state.handlers.set("release_set_subscription", () => ({ data: null, error: new Error("subscription_write_failed") }));
    expect(await chooseReleaseNotice(release.id, true)).toMatchObject({ ok: false });
    expect(state.tables.release_subscriptions).toEqual([]);
    expectPaths([]);
  });

  it.each(editorialActions)("%s no invalida nada si la escritura editorial es rechazada", async (_name, action) => {
    state.handlers.set("release_editorial_save", () => ({ data: null, error: { code: "40001", message: "release_edit_conflict" } }));
    expect(await action()).toEqual({ ok: false, error: "conflict" });
    expect(state.tables.cultural_releases).toEqual([releaseFixture()]);
    expectPaths([]);
  });

  it.each([
    ["Pendiente", () => addNoveltyToPending(release.id)],
    ["Avisarme", () => chooseReleaseNotice(release.id, true)],
    ...editorialActions,
  ] as const)("%s no invalida ninguna ruta si la sesión ha caducado", async (_name, action) => {
    state.userId = null;
    expect(await action()).toEqual({ ok: false, error: "auth" });
    expect(state.rpcCalls).toEqual([]);
    expectPaths([]);
  });
});
