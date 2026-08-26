import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrls: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ storage: { from: () => storage } }),
}));

import { deleteVoiceNote, signVoiceNoteUrls, uploadVoiceNote } from "./voice-notes";

beforeEach(() => {
  vi.clearAllMocks();
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
  it("mapea path → signedUrl y descarta filas con error", async () => {
    storage.createSignedUrls.mockResolvedValue({
      data: [
        { path: "u1/a.webm", signedUrl: "https://x/a?token=1", error: null },
        { path: "u1/b.m4a", signedUrl: null, error: "not found" },
      ],
      error: null,
    });
    const map = await signVoiceNoteUrls(["u1/a.webm", "u1/b.m4a"]);
    expect(map.get("u1/a.webm")).toBe("https://x/a?token=1");
    expect(map.has("u1/b.m4a")).toBe(false);
    expect(storage.createSignedUrls).toHaveBeenCalledWith(["u1/a.webm", "u1/b.m4a"], 3600);
  });
});
