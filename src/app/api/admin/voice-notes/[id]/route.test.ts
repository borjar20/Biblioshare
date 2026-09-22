import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ role: vi.fn(), rpc: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ getCurrentUserRole: mocks.role }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({ storage: { from: () => ({ download: mocks.download }) } }) }));
import { GET } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const request = () => GET(new Request(`http://localhost/api/admin/voice-notes/${id}`, { headers: { Range: "bytes=1-2" } }), { params: Promise.resolve({ id }) });
describe("admin audio evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role.mockResolvedValue("admin");
    mocks.rpc.mockResolvedValue({ data: { audio_path: "author/deleted.webm" }, error: null });
    mocks.download.mockResolvedValue({ data: new Blob(["abcd"], { type: "audio/webm" }), error: null });
  });
  it.each([null, "user", "collaborator"])("denies role %s before RPC and storage", async (role) => {
    mocks.role.mockResolvedValue(role);
    const response = await request();
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("serves removed/deleted evidence only through the authorized RPC", async () => {
    const response = await request();
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("bc");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith("admin_moderation_audio", { p_comment_id: id });
    expect(mocks.download).toHaveBeenCalledWith("author/deleted.webm");
  });
  it("denies storage when database rejects admin authorization", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "admin_required" } });
    expect((await request()).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("denies evidence with no audio", async () => {
    mocks.rpc.mockResolvedValue({ data: { audio_path: null }, error: null });
    expect((await request()).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
