import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), processArchive: vi.fn() }));

vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({ from: mocks.from }) }));
vi.mock("./process-archive", () => ({ processArchive: mocks.processArchive }));

import { runArchiveWorker } from "./archive-worker";

function workerClient({ pendingError }: { pendingError?: Error } = {}) {
  const jobs: { eq: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn>; then: PromiseLike<unknown>["then"] } = {
    eq: vi.fn(), order: vi.fn(), limit: vi.fn(),
    then(resolve, reject) { return Promise.resolve({ data: [{ id: "job-1" }], error: null }).then(resolve, reject); },
  };
  jobs.eq.mockReturnValue(jobs); jobs.order.mockReturnValue(jobs); jobs.limit.mockReturnValue(jobs);
  const pending: { eq: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn>; then: PromiseLike<unknown>["then"] } = {
    eq: vi.fn(), select: vi.fn(),
    then(resolve, reject) { return Promise.resolve({ count: 0, error: pendingError ?? null }).then(resolve, reject); },
  };
  pending.eq.mockReturnValue(pending); pending.select.mockReturnValue(pending);
  mocks.from.mockImplementation((table: string) => ({
    select: vi.fn(() => table === "archive_imports" ? jobs : pending),
  }));
}

describe("runArchiveWorker", () => {
  it("reports each written batch before a later pending-read failure", async () => {
    workerClient({ pendingError: new Error("later read failed") });
    mocks.processArchive.mockResolvedValueOnce(["movie-1"]);
    const onBatch = vi.fn();

    await expect(runArchiveWorker(undefined, onBatch)).rejects.toThrow("later read failed");

    expect(mocks.processArchive).toHaveBeenCalledWith(expect.anything(), "job-1", expect.any(Number));
    expect(onBatch).toHaveBeenCalledWith(["movie-1"]);
  });

  it("limits an explicit dispatch to its authorized job", async () => {
    workerClient();
    mocks.processArchive.mockResolvedValueOnce([]);

    await runArchiveWorker("job-1", vi.fn());

    const archiveImportsCall = mocks.from.mock.calls.map((args, index) => ({ args, index })).filter(({ args }) => args[0] === "archive_imports").at(-1);
    const client = mocks.from.mock.results[archiveImportsCall!.index]?.value;
    const jobs = client.select.mock.results[0]?.value;
    expect(jobs.eq).toHaveBeenLastCalledWith("id", "job-1");
    expect(mocks.processArchive).toHaveBeenCalledWith(expect.anything(), "job-1", expect.any(Number));
  });
});
