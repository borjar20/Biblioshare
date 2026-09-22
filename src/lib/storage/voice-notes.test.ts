import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrls: vi.fn(),
  rpc: vi.fn(),
}));
const visiblePaths = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ select: () => ({ in: visiblePaths }) }) }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ storage: { from: () => storage }, rpc: storage.rpc }),
}));

import { deleteVoiceNote, signVoiceNoteUrls, uploadVoiceNote } from "./voice-notes";

beforeEach(() => {
  vi.clearAllMocks();
  storage.rpc.mockResolvedValue({ data: false, error: null });
});

describe("uploadVoiceNote", () => {
  it("sube sin upsert (el path lleva uuid nuevo; un choque es un bug)", async () => {
    storage.upload.mockResolvedValue({ error: null });
    const blob = new Blob(["x"], { type: "audio/webm" });
    const res = await uploadVoiceNote("u1/a.webm", blob, "audio/webm");
    expect(res).toEqual({ ok: true });
    expect(storage.upload).toHaveBeenCalledWith("u1/a.webm", blob, {
      contentType: "audio/webm",
      upsert: false,
    });
  });
  it("error de storage → { error: true }, sin lanzar", async () => {
    storage.upload.mockResolvedValue({ error: { message: "boom" } });
    await expect(uploadVoiceNote("u1/a.webm", new Blob(["x"]), "audio/webm")).resolves.toEqual({
      error: true,
    });
  });
});

describe("deleteVoiceNote", () => {
  it("preserva audio referenciado como evidencia", async () => {
    storage.rpc.mockResolvedValue({ data: true, error: null });
    await deleteVoiceNote("u1/a.webm");
    expect(storage.rpc).toHaveBeenCalledWith("moderation_audio_is_evidence", { p_path: "u1/a.webm" });
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it("no destruye evidencia si no puede comprobar las referencias", async () => {
    storage.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    await deleteVoiceNote("u1/a.webm");
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it("borra y no lanza aunque falle (huérfano: se loguea)", async () => {
    storage.remove.mockResolvedValue({ error: { message: "boom" } });
    await expect(deleteVoiceNote("u1/a.webm")).resolves.toBeUndefined();
    expect(storage.remove).toHaveBeenCalledWith(["u1/a.webm"]);
  });
});

describe("signVoiceNoteUrls", () => {
  it("sin paths no llama a storage", async () => {
    await expect(signVoiceNoteUrls([])).resolves.toEqual(new Map());
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });
  it("solo genera rutas autenticadas para comentarios visibles, sin firmar objetos", async () => {
    visiblePaths.mockResolvedValue({ data: [{ id: "c1", audio_path: "u1/a.webm" }], error: null });
    const map = await signVoiceNoteUrls(["u1/a.webm", "u1/b.m4a"]);
    expect(map.get("u1/a.webm")).toBe("/api/voice-notes/c1");
    expect(map.has("u1/b.m4a")).toBe(false);
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });
});
