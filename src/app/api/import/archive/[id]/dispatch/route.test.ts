import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eqState = vi.fn(() => ({ maybeSingle }));
  const eqOwner = vi.fn(() => ({ eq: eqState }));
  const eqId = vi.fn(() => ({ eq: eqOwner }));
  const select = vi.fn(() => ({ eq: eqId }));
  const from = vi.fn(() => ({ select }));
  const getUser = vi.fn();
  return { getUser, maybeSingle, eqState, eqOwner, eqId, select, from, createClient: vi.fn(async () => ({ auth: { getUser }, from })), runArchiveWorker: vi.fn(), expireArchiveBatch: vi.fn(), revalidateArchiveImports: vi.fn() };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/import/archive-worker", () => ({ runArchiveWorker: mocks.runArchiveWorker }));
vi.mock("@/lib/reactivity/revalidate", () => ({ expireArchiveBatch: mocks.expireArchiveBatch, revalidateArchiveImports: mocks.revalidateArchiveImports }));

import { POST } from "./route";

const id = "6e04e8c3-9126-4d03-b4b5-0641f1ea3c80";
const context = { params: Promise.resolve({ id }) };
const request = (headers: HeadersInit = { origin: "https://app.test" }) => new Request(`https://app.test/api/import/archive/${id}/dispatch`, { method: "POST", headers });

describe("POST /api/import/archive/[id]/dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
    mocks.maybeSingle.mockResolvedValue({ data: { id }, error: null });
    mocks.runArchiveWorker.mockResolvedValue({ jobs: 1, batches: 1 });
  });

  it("requires a same-origin authenticated owner and dispatches only that job", async () => {
    mocks.runArchiveWorker.mockImplementation(async (jobId: string, onBatch: (ids: string[]) => void) => {
      expect(jobId).toBe(id);
      await onBatch(["movie-1"]);
      return { jobs: 1, batches: 1 };
    });

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.eqId).toHaveBeenCalledWith("id", id);
    expect(mocks.eqOwner).toHaveBeenCalledWith("user_id", "owner");
    expect(mocks.eqState).toHaveBeenCalledWith("state", "running");
    expect(mocks.expireArchiveBatch).toHaveBeenCalledWith(["movie-1"]);
    expect(mocks.revalidateArchiveImports).toHaveBeenCalledTimes(1);
  });

  it("uses the trusted forwarded public origin when a proxy terminates TLS", async () => {
    const proxied = new Request(`http://internal/api/import/archive/${id}/dispatch`, {
      method: "POST",
      headers: { origin: "https://app.test", "x-forwarded-host": "app.test", "x-forwarded-proto": "https" },
    });

    expect((await POST(proxied, context)).status).toBe(200);
    expect(mocks.runArchiveWorker).toHaveBeenCalledWith(id, expect.any(Function));
  });

  it("rejects missing or cross-site Origin before authentication", async () => {
    expect((await POST(request(), context)).status).toBe(200);
    vi.clearAllMocks();

    expect((await POST(request(), context)).status).toBe(200);
    vi.clearAllMocks();
    const crossSite = await POST(request({ origin: "https://evil.test" }), context);
    const missing = await POST(request({}), context);

    expect(crossSite.status).toBe(403);
    expect(missing.status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects an anonymous or another owner's job without starting the worker", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    expect((await POST(request(), context)).status).toBe(401);
    expect(mocks.runArchiveWorker).not.toHaveBeenCalled();

    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: "other" } } });
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await POST(request(), context)).status).toBe(404);
    expect(mocks.runArchiveWorker).not.toHaveBeenCalled();
  });
});
