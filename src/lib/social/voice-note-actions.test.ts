import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    user: { id: "user-1" } as { id: string } | null,
    target: {
      id: "target-1",
      owner_id: "owner-1",
      commentable: true,
      reactable: true,
      comment_notification_type: "commented",
      reaction_notification_type: "reacted",
    } as Record<string, unknown> | null,
    threadCount: 0,
    dayCount: 0,
    lastComment: null as { author_id: string; audio_path: string | null } | null,
    insertError: null as { message: string } | null,
    inserted: { id: "comment-1", parent_id: null as string | null },
    insertedRows: [] as Array<Record<string, unknown>>,
  };

  // Cliente del usuario: auth + insert en comments + lookup del target del comentario.
  const userClient = {
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from(table: string) {
      if (table === "interaction_targets") {
        return {
          select: () => ({
            eq: (_c: string, _v: string) => ({
              eq: () => ({ maybeSingle: async () => ({ data: { id: "comment-target-1" }, error: null }) }),
              maybeSingle: async () => ({ data: state.target, error: null }),
            }),
          }),
        };
      }
      // comments
      return {
        insert: (row: Record<string, unknown>) => {
          state.insertedRows.push(row);
          return {
            select: () => ({
              single: async () =>
                state.insertError
                  ? { data: null, error: state.insertError }
                  : { data: state.inserted, error: null },
            }),
          };
        },
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      };
    },
  };

  // Cliente service-role: solo los conteos de los frenos.
  function countBuilder(result: () => { count?: number; data?: unknown }) {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "gte", "order", "limit"]) {
      b[m] = () => b;
    }
    b.maybeSingle = async () => ({ data: state.lastComment, error: null });
    b.then = (resolve: (v: unknown) => void) => resolve({ ...result(), error: null });
    return b;
  }
  let adminCall = 0;
  const adminClient = {
    from: () => {
      adminCall += 1;
      const call = adminCall;
      if (call % 3 === 1) return countBuilder(() => ({ count: state.threadCount }));
      if (call % 3 === 2) return countBuilder(() => ({ data: state.lastComment }));
      return countBuilder(() => ({ count: state.dayCount }));
    },
  };

  return {
    state,
    resetAdmin: () => (adminCall = 0),
    userClient,
    adminClient,
    uploadVoiceNote: vi.fn<
      (path: string, blob: Blob, contentType: string) => Promise<{ ok: true } | { error: true }>
    >(async () => ({ ok: true })),
    deleteVoiceNote: vi.fn(async () => {}),
    notify: vi.fn(async () => {}),
    revalidateInteraction: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.userClient }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => h.adminClient }));
vi.mock("@/lib/storage/voice-notes", () => ({
  uploadVoiceNote: h.uploadVoiceNote,
  deleteVoiceNote: h.deleteVoiceNote,
}));
vi.mock("./notifications", () => ({ notify: h.notify }));
vi.mock("@/lib/reactivity/revalidate", () => ({ revalidateInteraction: h.revalidateInteraction }));

import { addVoiceComment } from "./voice-note-actions";

function makeFormData(overrides?: { type?: string; size?: number; durationMs?: string; peaks?: string }) {
  const fd = new FormData();
  const bytes = new Uint8Array(overrides?.size ?? 1000);
  fd.set("file", new File([bytes], "nota.webm", { type: overrides?.type ?? "audio/webm;codecs=opus" }));
  fd.set("durationMs", overrides?.durationMs ?? "5000");
  fd.set("peaks", overrides?.peaks ?? JSON.stringify([10, 50, 90]));
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.resetAdmin();
  h.state.user = { id: "user-1" };
  h.state.threadCount = 0;
  h.state.dayCount = 0;
  h.state.lastComment = null;
  h.state.insertError = null;
  h.state.insertedRows = [];
  h.uploadVoiceNote.mockResolvedValue({ ok: true });
});

describe("addVoiceComment", () => {
  it("camino feliz: sube, inserta body vacío con audio y notifica al dueño", async () => {
    const res = await addVoiceComment("target-1", makeFormData());
    expect(res).toEqual({ ok: true });
    expect(h.uploadVoiceNote).toHaveBeenCalledTimes(1);
    const [path, , contentType] = h.uploadVoiceNote.mock.calls[0]!;
    expect(path).toMatch(/^user-1\/[0-9a-f-]{36}\.webm$/);
    expect(contentType).toBe("audio/webm");
    const row = h.state.insertedRows[0]!;
    expect(row.body).toBe("");
    expect(row.audio_path).toBe(path);
    expect(row.audio_duration_ms).toBe(5000);
    expect(row.audio_peaks).toEqual([10, 50, 90]);
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.revalidateInteraction).toHaveBeenCalled();
  });

  it("sin sesión → unauthenticated y NO sube nada", async () => {
    h.state.user = null;
    expect(await addVoiceComment("target-1", makeFormData())).toEqual({ ok: false, error: "unauthenticated" });
    expect(h.uploadVoiceNote).not.toHaveBeenCalled();
  });

  it("mime no permitido → invalid_audio", async () => {
    expect(await addVoiceComment("target-1", makeFormData({ type: "audio/ogg" }))).toEqual({ ok: false, error: "invalid_audio" });
  });

  it("más de 2 MB → too_large", async () => {
    expect(await addVoiceComment("target-1", makeFormData({ size: 2 * 1024 * 1024 + 1 }))).toEqual({ ok: false, error: "too_large" });
  });

  it("duración fuera de 2s–60s → invalid_duration", async () => {
    expect(await addVoiceComment("target-1", makeFormData({ durationMs: "1500" }))).toEqual({ ok: false, error: "invalid_duration" });
    expect(await addVoiceComment("target-1", makeFormData({ durationMs: "61000" }))).toEqual({ ok: false, error: "invalid_duration" });
  });

  it("3 audios ya en el hilo → voice_thread_limit", async () => {
    h.state.threadCount = 3;
    expect(await addVoiceComment("target-1", makeFormData())).toEqual({ ok: false, error: "voice_thread_limit" });
    expect(h.uploadVoiceNote).not.toHaveBeenCalled();
  });

  it("mi último comentario del hilo es un audio → voice_consecutive", async () => {
    h.state.lastComment = { author_id: "user-1", audio_path: "user-1/x.webm" };
    expect(await addVoiceComment("target-1", makeFormData())).toEqual({ ok: false, error: "voice_consecutive" });
  });

  it("20 audios hoy → voice_daily_limit", async () => {
    h.state.dayCount = 20;
    expect(await addVoiceComment("target-1", makeFormData())).toEqual({ ok: false, error: "voice_daily_limit" });
  });

  it("si el insert falla, borra el objeto subido (sin huérfanos)", async () => {
    h.state.insertError = { message: "boom" };
    expect(await addVoiceComment("target-1", makeFormData())).toEqual({ ok: false, error: "unknown" });
    expect(h.deleteVoiceNote).toHaveBeenCalledWith(h.uploadVoiceNote.mock.calls[0]![0]);
  });

  it("peaks corruptos no tumban la publicación: van como []", async () => {
    const res = await addVoiceComment("target-1", makeFormData({ peaks: '"no-array"' }));
    expect(res).toEqual({ ok: true });
    expect(h.state.insertedRows[0]!.audio_peaks).toEqual([]);
  });
});
