import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  role: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), cleanup: vi.fn(),
}));
vi.mock("@/lib/auth/roles", () => ({ getCurrentUserRole: mocks.role }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/reactivity/revalidate", () => ({ revalidateModeration: mocks.revalidate }));
vi.mock("@/lib/storage/voice-notes", () => ({ deleteVoiceNote: mocks.cleanup }));
import { moderateContent, reviewReport } from "./moderation-actions";

const input = { kind: "post" as const, id: "12345678-1234-1234-1234-123456789abc", action: "remove" as const, reason: "Contenido ofensivo", confirmation: "" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue("admin");
  mocks.rpc.mockResolvedValue({ data: { ok: true, audio_paths: [] }, error: null });
});
describe("administrative moderation", () => {
  it.each([null, "user", "collaborator"])("denies %s before calling privileged RPC", async (role) => {
    mocks.role.mockResolvedValue(role);
    expect(await moderateContent(input)).toEqual({ ok: false, error: "forbidden" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires a reason and valid target", async () => {
    expect(await moderateContent({ ...input, reason: " " })).toEqual({ ok: false, error: "invalid" });
    expect(await moderateContent({ ...input, id: "wrong" })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires explicit permanent deletion confirmation", async () => {
    expect(await moderateContent({ ...input, action: "delete" })).toEqual({ ok: false, error: "confirmation" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("passes canonical confirmation to database, which checks club name", async () => {
    await moderateContent({ ...input, kind: "club", action: "delete", confirmation: "Mi club" });
    expect(mocks.rpc).toHaveBeenCalledWith("admin_moderate_content", {
      p_kind: "club", p_id: input.id, p_action: "delete", p_reason: input.reason, p_confirmation: "Mi club",
    });
  });
  it("refreshes only after a confirmed transition", async () => {
    expect(await moderateContent(input)).toEqual({ ok: true });
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });
  it("does not present an unsuccessful RPC as success or delete storage", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "moderation_target_missing" } });
    expect((await moderateContent(input)).ok).toBe(false);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it("cleans audio only after a confirmed permanent deletion", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, audio_paths: ["user/audio.webm"] }, error: null });
    expect(await moderateContent({ ...input, action: "delete", confirmation: "ELIMINAR" })).toEqual({ ok: true });
    expect(mocks.cleanup).toHaveBeenCalledWith("user/audio.webm");
  });
  it("denies malformed/null payloads without throwing", async () => {
    expect(await moderateContent(null as never)).toEqual({ ok: false, error: "invalid" });
  });
});
describe("report review", () => {
  it("requires admin, a resolution and a reason", async () => {
    mocks.role.mockResolvedValue("user");
    expect(await reviewReport(input.id, "dismissed", "No incumple las normas")).toEqual({ ok: false, error: "forbidden" });
    mocks.role.mockResolvedValue("admin");
    expect(await reviewReport(input.id, "pending" as never, "Revisión")).toEqual({ ok: false, error: "invalid" });
    expect(await reviewReport(input.id, "actioned", "")).toEqual({ ok: false, error: "invalid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("records resolution through its authorized RPC", async () => {
    expect(await reviewReport(input.id, "dismissed", "  No incumple las normas  ")).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("admin_review_report", {
      p_id: input.id, p_status: "dismissed", p_reason: "No incumple las normas",
    });
  });
});
