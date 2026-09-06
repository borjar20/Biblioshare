import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportRow } from "@/lib/import/types";

const state = vi.hoisted(() => ({ client: null as unknown, role: "collaborator", rpcError: null as null | { message: string; code: string } }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => state.client,
  getCurrentUser: async () => ({ id: "reviewer" }),
}));
import { resolvePendingRow, resolveUnmatchedImportRow } from "./actions";

const row: ImportRow = {
  rowNumber: 1, title: "Manual", author: "Author", isbn: "9780441172719",
  publisher: "Edition publisher", pageCount: 200, year: 2000,
  status: "planned", rating: null, bookFormat: null, diaryDates: [], unknownStatusLabel: null,
};
let passes: Array<Record<string, unknown>>;
let rpc: ReturnType<typeof vi.fn>;
afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  state.role = "collaborator";
  state.rpcError = null;
  passes = [];
  rpc = vi.fn(async (name: string) => ({ data: name === "register_manual_catalog_item" ? "catalog-id" : null, error: state.rpcError }));
  state.client = {
    auth: { getUser: async () => ({ data: { user: { id: "reviewer" } } }) }, rpc,
    from: (table: string) => {
      const chain = {
        select: () => chain, eq: () => chain,
        maybeSingle: async () => ({ data: { role: state.role }, error: null }),
        single: async () => table === "profiles" ? { data: { role: state.role }, error: null } :
          table === "passes" ? { data: { id: "pass-id" }, error: null } :
          { data: null, error: { code: "42501", message: "catalog INSERT forbidden" } },
        insert: (values: Record<string, unknown>) => { if (table === "passes") passes.push(values); return chain; },
      };
      return chain;
    },
  };
});

function form() {
  const data = new FormData();
  data.set("title", "Curated title"); data.set("author", "Curated author"); data.set("year", "2001");
  return data;
}

describe("manual import through authenticated catalog registration", () => {
  it.each(["book", "movie", "series"] as const)("resolves an unmatched %s without direct catalog INSERT", async (type) => {
    const result = await resolveUnmatchedImportRow(type, row, {}, form());
    expect(result.result?.outcome).toBe("imported");
    expect(passes[0]).toMatchObject({ user_id: "reviewer", item_id: "catalog-id", item_type: type });
    expect(rpc).toHaveBeenCalledWith("register_manual_catalog_item", expect.objectContaining({ p_item_type: type, p_title: "Curated title" }));
  });
  it("resolves the pending row for its owner through the existing RPC", async () => {
    expect(await resolvePendingRow("pending-id", "book", row, {}, form())).toEqual({ done: true });
    expect(rpc).toHaveBeenCalledWith("resolve_pending_import", { p_pending_id: "pending-id", p_catalog_item_id: "catalog-id" });
    expect(passes).toEqual([]);
  });
  it("does not write edition metadata to legacy work columns", async () => {
    await resolveUnmatchedImportRow("book", row, {}, form());
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_isbn");
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_publisher");
  });
  it("rejects a user without the collaborator role before creating anything", async () => {
    state.role = "user";
    expect(await resolveUnmatchedImportRow("book", row, {}, form())).toEqual({ error: "forbidden" });
    expect(await resolvePendingRow("pending-id", "book", row, {}, form())).toEqual({ error: "forbidden" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("reports registration errors and does not resolve or create a pass", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    state.rpcError = { code: "42501", message: "forbidden" };
    expect(await resolveUnmatchedImportRow("book", row, {}, form())).toEqual({ error: "generic" });
    expect(await resolvePendingRow("pending-id", "book", row, {}, form())).toEqual({ error: "generic" });
    expect(passes).toEqual([]);
    expect(rpc).not.toHaveBeenCalledWith("resolve_pending_import", expect.anything());
    expect(log).toHaveBeenCalledWith("register_manual_catalog_item (import) failed", expect.objectContaining({ error: state.rpcError }));
  });
  it("reports a pending resolution failure without claiming success", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: "catalog-id", error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "pending row not found" } });
    expect(await resolvePendingRow("gone", "book", row, {}, form())).toEqual({ error: "generic" });
    expect(log).toHaveBeenCalledWith("resolve_pending_import failed", expect.objectContaining({ pendingId: "gone" }));
  });
});
