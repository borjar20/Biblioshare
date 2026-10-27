import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SagaDetail } from "./get-saga-detail";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: mocks.getCurrentUser }));

import { getSagaPassage } from "./get-saga-passage";

type Call = { table: string; eq: Array<[string, unknown]>; in: Array<[string, unknown[]]> };

// Supabase de mentira: registra los filtros y devuelve filas por tabla. Para
// `passes` devuelve las filas indicadas por tipo (columna `item_type` del eq).
function fakeSupabase(data: Record<string, unknown[]>, errors: Record<string, Error> = {}) {
  const calls: Call[] = [];
  const supabase = {
    from(table: string) {
      const call: Call = { table, eq: [], in: [] };
      calls.push(call);
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (call.eq.push([c, v]), q),
        in: (c: string, v: unknown[]) => (call.in.push([c, v]), q),
        then: (res: (v: { data: unknown[]; error?: unknown }) => unknown) => {
          const key = table === "passes" ? `passes:${call.eq.find(([c]) => c === "item_type")?.[1]}` : table;
          if (errors[key]) return res({ data: [], error: errors[key] });
          return res({ data: data[key] ?? [] });
        },
      };
      return q;
    },
  };
  return { supabase: supabase as never, calls };
}

const member = (itemType: string, itemId: string, optional = false, skipped = false) => ({ itemType, itemId, optional, skipped });
const detail = (over: Partial<SagaDetail> = {}) =>
  ({
    isAuthenticated: true,
    groups: [{ members: [member("book", "b1"), member("book", "b2"), member("movie", "m1")] }],
    ...over,
  }) as unknown as SagaDetail;
const order = [{ key: "book:b1", title: "B1", href: "/b1", optional: false, skipped: false }];
const pass = (id: string) => ({
  item_id: id,
  status: "completed",
  rating: 8,
  started_on: null,
  finished_on: "2026-01-01",
  created_at: "2026-01-01T00:00:00Z",
});

describe("getSagaPassage", () => {
  beforeEach(() => mocks.getCurrentUser.mockReset());

  it("sin sesión devuelve null y no consulta nada", async () => {
    const supabase = {
      from: () => {
        throw new Error("no debe consultar");
      },
    } as never;
    expect(await getSagaPassage(supabase, detail({ isAuthenticated: false }), order)).toBeNull();
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it("sin usuario devuelve null y no consulta nada", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const supabase = {
      from: () => {
        throw new Error("no debe consultar");
      },
    } as never;
    expect(await getSagaPassage(supabase, detail(), order)).toBeNull();
  });

  it("pide los pases por user_id, tipo e ids de la saga, y las tallas solo de lo que tiene pase", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" });
    const { supabase, calls } = fakeSupabase({
      "passes:book": [pass("b1")],
      books: [{ id: "b1", total_pages: 300 }],
    });
    const r = await getSagaPassage(supabase, detail(), order);

    const passCalls = calls.filter((c) => c.table === "passes");
    expect(passCalls).toHaveLength(2); // libros y películas; sin series
    for (const c of passCalls) expect(c.eq).toContainEqual(["user_id", "u1"]);
    const book = passCalls.find((c) => c.eq.some(([, v]) => v === "book"))!;
    expect(book.in).toEqual([["item_id", ["b1", "b2"]]]);
    const movie = passCalls.find((c) => c.eq.some(([, v]) => v === "movie"))!;
    expect(movie.in).toEqual([["item_id", ["m1"]]]);

    expect(calls.find((c) => c.table === "books")?.in).toEqual([["id", ["b1"]]]);
    expect(calls.some((c) => c.table === "movies")).toBe(false);
    expect(r?.completed).toBe(1);
    expect(r?.pages).toEqual({ total: 300, known: 1, of: 1 });
  });

  it("las opcionales saltadas son de la saga entera aunque la balda no las traiga", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" });
    const { supabase } = fakeSupabase({ "passes:book": [pass("b1")], books: [{ id: "b1", total_pages: 300 }] });
    const d = detail({
      groups: [
        { members: [member("book", "b1"), member("book", "b2", true, true), member("book", "b3", true, false)] },
      ] as never,
    });
    const r = await getSagaPassage(supabase, d, order); // `order` solo trae b1 (opcionales ocultas)
    expect(r?.optional).toEqual({ skipped: 1, total: 2 });
  });

  it("un error en la consulta de pases rechaza", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" });
    const { supabase } = fakeSupabase({}, { "passes:book": new Error("boom") });
    await expect(getSagaPassage(supabase, detail(), order)).rejects.toThrow("boom");
  });

  it("un error en la consulta de tallas rechaza", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" });
    const { supabase } = fakeSupabase({ "passes:book": [pass("b1")] }, { books: new Error("boom-books") });
    await expect(getSagaPassage(supabase, detail(), order)).rejects.toThrow("boom-books");
  });

  it("sin pases devuelve null y no pide tallas", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" });
    const { supabase, calls } = fakeSupabase({});
    expect(await getSagaPassage(supabase, detail(), order)).toBeNull();
    expect(calls.some((c) => c.table === "books" || c.table === "movies")).toBe(false);
  });
});
