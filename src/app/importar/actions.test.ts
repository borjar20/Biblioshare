import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), commit: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "reader" } } }) },
  rpc: mocks.rpc,
}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ getCurrentUserRole: vi.fn(), hasMinRole: vi.fn() }));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateImportBatch: vi.fn(), revalidatePendingImports: vi.fn(), revalidateReadingLog: vi.fn(),
}));
vi.mock("@/lib/import/manual-catalog", () => ({ registerManualImportItem: vi.fn() }));
vi.mock("@/lib/import/commit-row", () => ({
  commitImportRow: mocks.commit, catalogIdForCandidate: vi.fn(),
  commitImportRowWithCandidate: vi.fn(), commitManualImportRow: vi.fn(),
}));
import { commitImportBatch } from "./actions";
import type { ImportRow } from "@/lib/import/types";

describe("CSV quota boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.commit.mockResolvedValue({ outcome: "duplicate", itemId: "existing" });
  });
  it("admits the supported 3000-row batch with one row-based charge", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const rows = Array.from({ length: 3000 }, () => ({ title: "Fixture" } as ImportRow));
    expect(await commitImportBatch("book", rows)).toHaveLength(3000);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("consume_request_quota", {
      p_operation: "import_rows", p_cost: 3000,
    });
    expect(mocks.commit).toHaveBeenCalledTimes(3000);
  });
  it("rejects an exhausted quota before matching or hydration", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(commitImportBatch("book", [{} as ImportRow])).rejects.toThrow("quota");
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("does not charge or process an oversized or empty batch", async () => {
    expect(await commitImportBatch("book", Array(3001).fill({}))).toEqual([]);
    expect(await commitImportBatch("book", [])).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
