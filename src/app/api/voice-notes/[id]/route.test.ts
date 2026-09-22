import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), row: vi.fn(), download: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.user }, from: mocks.from }) }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({ storage: { from: () => ({ download: mocks.download }) } }) }));
import { GET } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const request = (range?: string) => GET(new Request(`http://localhost/api/voice-notes/${id}`, { headers: range ? { Range: range } : {} }), { params: Promise.resolve({ id }) });
describe("authenticated voice notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ data: { user: { id: "viewer" } }, error: null });
    mocks.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.row }) }) }));
    mocks.row.mockResolvedValue({ data: { id, audio_path: "author/audio.webm", interaction_target_id: "target" }, error: null });
    mocks.download.mockResolvedValue({ data: new Blob(["abcdef"], { type: "audio/webm" }), error: null });
  });
  it("denies missing session without querying storage", async () => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    expect((await request()).status).toBe(401);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("checks the same URL again after withdrawal", async () => {
    expect((await request()).status).toBe(200);
    mocks.row.mockResolvedValue({ data: null, error: null });
    const denied = await request();
    expect(denied.status).toBe(404);
    expect(denied.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });
  it("denies an invisible parent even when the comment is returned", async () => {
    mocks.row.mockResolvedValueOnce({ data: { audio_path: "author/audio.webm", interaction_target_id: "target" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    expect((await request()).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("serves visible audio privately and supports seeking", async () => {
    const response = await request("bytes=2-4");
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("cde");
    expect(response.headers.get("content-range")).toBe("bytes 2-4/6");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.download).toHaveBeenCalledWith("author/audio.webm");
    expect(mocks.from).toHaveBeenCalledWith("interaction_targets");
  });
  it("rejects unsatisfiable ranges", async () => {
    const response = await request("bytes=10-");
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */6");
  });
  it.each([
    ["bytes=-2", "ef", "bytes 4-5/6"],
    ["bytes=3-", "def", "bytes 3-5/6"],
    ["bytes=0-999", "abcdef", "bytes 0-5/6"],
  ])("supports browser seek range %s", async (range, body, contentRange) => {
    const response = await request(range);
    expect(response.status).toBe(206);
    expect(await response.text()).toBe(body);
    expect(response.headers.get("content-range")).toBe(contentRange);
  });
  it.each(["bytes=-0", "bytes=", "bytes=0-1,4-5", "bytes=4-2"])("rejects invalid range %s", async (range) => {
    expect((await request(range)).status).toBe(416);
  });
});
