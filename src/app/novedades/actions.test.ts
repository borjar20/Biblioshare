import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReleaseEditorialInput } from "@/lib/releases/types";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ user: vi.fn(), role: vi.fn(), pending: vi.fn(), subscription: vi.fn(),
  save: vi.fn(), publish: vi.fn(), review: vi.fn(), cancel: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/roles", () => ({ getCurrentUserRole: mocks.role }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate, revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/releases/mutations", () => ({ addReleaseToPending: mocks.pending, setReleaseSubscription: mocks.subscription,
  saveEditorialRelease: mocks.save, publishEditorialRelease: mocks.publish, markEditorialReleaseReviewed: mocks.review, cancelEditorialRelease: mocks.cancel }));

import { addNoveltyToPending, chooseReleaseNotice } from "./actions";
import { cancelBookAnnouncement, publishBookAnnouncement, reviewBookAnnouncement, saveBookAnnouncement } from "../admin/novedades/actions";

const id = "5b9685cd-b3f0-489c-8bf8-9c8fd5458ee9";
const version = "2026-10-06T10:00:00Z";
const input: ReleaseEditorialInput = { title: "Libro anunciado", modality: "book", market: "ES", language: "es", datePrecision: "unknown", dateValue: null,
  status: "published", sourceName: "Editorial", sourceUrl: "https://editorial.example/anuncio" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "actor" });
  mocks.role.mockResolvedValue("admin");
  mocks.pending.mockResolvedValue({ itemId: "book", itemType: "book" });
  mocks.subscription.mockResolvedValue(undefined);
  mocks.save.mockResolvedValue({ id });
  mocks.publish.mockResolvedValue(undefined);
  mocks.review.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
});

describe("acciones personales de Novedades", () => {
  it("exige identidad real para Pendiente y Avisarme sin llegar a mutar", async () => {
    mocks.user.mockResolvedValue(null);
    expect(await addNoveltyToPending(id)).toEqual({ ok: false, error: "auth" });
    expect(await chooseReleaseNotice(id, true)).toEqual({ ok: false, error: "auth" });
    expect(mocks.pending).not.toHaveBeenCalled(); expect(mocks.subscription).not.toHaveBeenCalled();
  });
  it("Pendiente envía solo identidad de petición e ID canónico, sin elegir aviso", async () => {
    expect(await addNoveltyToPending(id)).toEqual({ ok: true });
    expect(mocks.pending).toHaveBeenCalledWith("actor", id);
    expect(mocks.subscription).not.toHaveBeenCalled();
  });
  it.each([true, false])("elegir aviso %s no escribe pases", async (enabled) => {
    expect(await chooseReleaseNotice(id, enabled)).toEqual({ ok: true });
    expect(mocks.subscription).toHaveBeenCalledWith("actor", id, enabled);
    expect(mocks.pending).not.toHaveBeenCalled();
  });
  it("rechaza identificadores y booleanos no válidos antes del dominio", async () => {
    expect(await addNoveltyToPending("invento")).toEqual({ ok: false, error: "invalid" });
    expect(await chooseReleaseNotice(id, "yes" as unknown as boolean)).toEqual({ ok: false, error: "invalid" });
    expect(mocks.pending).not.toHaveBeenCalled(); expect(mocks.subscription).not.toHaveBeenCalled();
  });
});

describe("acciones editoriales", () => {
  const editorial = [
    ["guardar", () => saveBookAnnouncement(input), mocks.save], ["publicar", () => publishBookAnnouncement(id, 1, version), mocks.publish],
    ["revisar", () => reviewBookAnnouncement(id, 1, version), mocks.review], ["cancelar", () => cancelBookAnnouncement(id, 1, version), mocks.cancel],
  ] as const;
  it.each(editorial)("%s vuelve a exigir rol admin en cada petición", async (_name, action, mutation) => {
    mocks.role.mockResolvedValue("collaborator");
    expect(await action()).toEqual({ ok: false, error: "forbidden" });
    expect(mutation).not.toHaveBeenCalled();
  });
  it.each(editorial)("%s rechaza una sesión caducada", async (_name, action, mutation) => {
    mocks.user.mockResolvedValue(null);
    expect(await action()).toEqual({ ok: false, error: "auth" });
    expect(mutation).not.toHaveBeenCalled();
  });
  it("una nueva entrada se guarda como borrador y no cambia la biblioteca", async () => {
    expect(await saveBookAnnouncement(input)).toEqual({ ok: true, id });
    expect(mocks.save).toHaveBeenCalledWith("actor", { ...input, status: "draft" }, undefined, undefined, undefined);
    expect(mocks.pending).not.toHaveBeenCalled();
  });
  it("guardar una edición transporta la revisión conocida para rechazar ediciones obsoletas", async () => {
    const updatedAt = "2026-10-06T10:00:00Z";
    await saveBookAnnouncement(input, id, 3, updatedAt);
    expect(mocks.save).toHaveBeenCalledWith("actor", input, id, 3, updatedAt);
    mocks.save.mockRejectedValueOnce({ message: "release_revision_conflict" });
    expect(await saveBookAnnouncement(input, id, 3, updatedAt)).toEqual({ ok: false, error: "conflict" });
  });
  it.each([
    ["guardar", () => saveBookAnnouncement(input, id, 1), mocks.save],
    ["publicar", () => publishBookAnnouncement(id, 1), mocks.publish],
    ["revisar", () => reviewBookAnnouncement(id, 1), mocks.review],
    ["cancelar", () => cancelBookAnnouncement(id, 1), mocks.cancel],
  ] as const)("%s exige también la versión de metadatos que leyó el editor", async (_name, action, mutation) => {
    expect(await action()).toEqual({ ok: false, error: "invalid" });
    expect(mutation).not.toHaveBeenCalled();
  });
  it.each(editorial.slice(1))("%s cambia solo el anuncio editorial", async (_name, action, mutation) => {
    expect(await action()).toEqual({ ok: true });
    expect(mutation).toHaveBeenCalledWith("actor", id, 1, version);
    expect(mocks.pending).not.toHaveBeenCalled(); expect(mocks.subscription).not.toHaveBeenCalled();
  });
});
