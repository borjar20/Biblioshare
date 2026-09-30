import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runArchiveWorker: vi.fn(), expireArchiveBatch: vi.fn(), revalidateArchiveImports: vi.fn() }));

vi.mock("@/lib/import/archive-worker", () => ({ runArchiveWorker: mocks.runArchiveWorker }));
vi.mock("@/lib/reactivity/revalidate", () => ({ expireArchiveBatch: mocks.expireArchiveBatch, revalidateArchiveImports: mocks.revalidateArchiveImports }));

import { POST } from "./route";

describe("POST /api/cron/archive-imports", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    vi.clearAllMocks();
  });
  afterEach(() => { process.env.CRON_SECRET = original; });

  it("runs without a browser and invalidates every completed batch", async () => {
    mocks.runArchiveWorker.mockImplementation(async (_jobId: undefined, onBatch: (ids: string[]) => void) => {
      await onBatch(["movie-1"]);
      return { jobs: 1, batches: 1 };
    });

    const response = await POST(new Request("https://app.test/api/cron/archive-imports", {
      method: "POST", headers: { "x-cron-secret": "test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jobs: 1, batches: 1 });
    expect(mocks.runArchiveWorker).toHaveBeenCalledWith(undefined, expect.any(Function));
    expect(mocks.expireArchiveBatch).toHaveBeenCalledWith(["movie-1"]);
    expect(mocks.revalidateArchiveImports).toHaveBeenCalledTimes(1);
  });
});
