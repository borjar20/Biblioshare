import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readLootCopies } from "./repository";

it("reads more than the API row cap without merging copies of the same item", async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ id: String(i).padStart(8, "0"),
    reward: { itemId: "sharp_bookmark", slot: "weapon" }, resolved_at: "2026-09-08T00:00:00Z" }));
  const cursors: string[] = [];
  const from = vi.fn(() => {
    let cursor = "";
    const query = {
      select: vi.fn(() => query), eq: vi.fn(() => query), not: vi.fn(() => query),
      order: vi.fn(() => query), limit: vi.fn(() => query),
      gt: vi.fn((_key: string, value: string) => { cursor = value; cursors.push(value); return query; }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows.filter(r => r.id > cursor).slice(0, 500), error: null }).then(resolve),
    };
    return query;
  });
  const copies = await readLootCopies({ from } as unknown as Parameters<typeof readLootCopies>[0], "user-a");
  expect(copies).toHaveLength(1001);
  expect(new Set(copies.map(copy => copy.copyId)).size).toBe(1001);
  expect(cursors).toEqual(["00000499", "00000999"]);
  expect(from).toHaveBeenCalledTimes(3);
});
