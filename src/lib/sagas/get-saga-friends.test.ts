import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SagaDetail } from "./get-saga-detail";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: mocks.getCurrentUser }));

import { getSagaFriends } from "./get-saga-friends";

type Call = {
  table: string;
  select: string | undefined;
  eq: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  is: Array<[string, unknown]>;
};

function fakeSupabase(data: Record<string, unknown[]>, errors: Record<string, Error> = {}) {
  const calls: Call[] = [];
  const supabase = {
    from(table: string) {
      const call: Call = { table, select: undefined, eq: [], in: [], is: [] };
      calls.push(call);
      const q = {
        select: (s: string) => ((call.select = s), q),
        eq: (c: string, v: unknown) => (call.eq.push([c, v]), q),
        in: (c: string, v: unknown[]) => (call.in.push([c, v]), q),
        is: (c: string, v: unknown) => (call.is.push([c, v]), q),
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

const member = (itemType: string, itemId: string) => ({ itemType, itemId, optional: false, skipped: false });
const detail = (over: Partial<SagaDetail> = {}) =>
  ({
    isAuthenticated: true,
    groups: [{ members: [member("book", "b1"), member("book", "b1"), member("book", "b2"), member("movie", "m1")] }],
    ...over,
  }) as unknown as SagaDetail;
const order = [
  { key: "book:b1", title: "B1", href: "/b1", optional: false },
  { key: "movie:m1", title: "M1", href: "/m1", optional: false },
];
const pass = (userId: string, itemId: string) => ({
  user_id: userId,
  item_id: itemId,
  status: "completed",
  is_active: false,
  rating: 8,
  started_on: null,
  finished_on: "2026-01-01",
  created_at: "2026-01-01T00:00:00Z",
});
const ident = (userId: string) => ({ user_id: userId, username: userId, display_name: null, avatar_url: null });
const boom = () => {
  throw new Error("no debe consultar");
};

describe("getSagaFriends", () => {
  beforeEach(() => mocks.getCurrentUser.mockReset());

  it("sin sesión devuelve [] y no consulta nada", async () => {
    expect(await getSagaFriends({ from: boom } as never, detail({ isAuthenticated: false }), order)).toEqual([]);
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it("sin usuario devuelve [] y no consulta nada", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect(await getSagaFriends({ from: boom } as never, detail(), order)).toEqual([]);
  });

  it("consulta los seguidos aceptados y, sin seguidos, no hace más consultas", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "me" });
    const { supabase, calls } = fakeSupabase({ follows: [] });
    expect(await getSagaFriends(supabase, detail(), order)).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("follows");
    expect(calls[0].select).toBe("followee_id");
    expect(calls[0].eq).toEqual([["follower_id", "me"], ["status", "accepted"]]);
  });

  it("pide los pases de los seguidos por tipo, con ids deduplicados, una consulta por tipo presente", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "me" });
    const { supabase, calls } = fakeSupabase({
      follows: [{ followee_id: "a" }, { followee_id: "b" }],
      "passes:book": [pass("a", "b1")],
      profile_identities: [ident("a")],
    });
    await getSagaFriends(supabase, detail(), order);
    const passCalls = calls.filter((c) => c.table === "passes");
    expect(passCalls).toHaveLength(2); // libros y películas; sin series
    for (const c of passCalls) expect(c.in).toContainEqual(["user_id", ["a", "b"]]);
    const book = passCalls.find((c) => c.eq.some(([, v]) => v === "book"))!;
    expect(book.in).toContainEqual(["item_id", ["b1", "b2"]]);
    const movie = passCalls.find((c) => c.eq.some(([, v]) => v === "movie"))!;
    expect(movie.in).toContainEqual(["item_id", ["m1"]]);
  });

  it("un pase que RLS no devuelve no hace aparecer al amigo; identidades solo de quien tiene pases", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "me" });
    const { supabase, calls } = fakeSupabase({
      follows: [{ followee_id: "a" }, { followee_id: "privado" }],
      "passes:book": [pass("a", "b1")],
      profile_identities: [ident("a")],
    });
    const r = await getSagaFriends(supabase, detail(), order);
    expect(r.map((f) => f.userId)).toEqual(["a"]);
    const identCall = calls.find((c) => c.table === "profile_identities")!;
    expect(identCall.in).toEqual([["user_id", ["a"]]]);
  });

  it("sin pases visibles devuelve [] sin consultar identidades", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "me" });
    const { supabase, calls } = fakeSupabase({ follows: [{ followee_id: "a" }] });
    expect(await getSagaFriends(supabase, detail(), order)).toEqual([]);
    expect(calls.some((c) => c.table === "profile_identities")).toBe(false);
  });

  it("filtra identidades sin username y arma la clave tipo:id", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "me" });
    const { supabase } = fakeSupabase({
      follows: [{ followee_id: "a" }, { followee_id: "b" }],
      "passes:book": [pass("a", "b1"), pass("b", "b1")],
      profile_identities: [ident("a"), { user_id: "b", username: null, display_name: null, avatar_url: null }],
    });
    const r = await getSagaFriends(supabase, detail(), order);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ userId: "a", completed: 1, counted: 2 });
  });

  it("con más seguidos que un trozo, trocea pases e identidades y junta los resultados", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "me" });
    const ids = Array.from({ length: 120 }, (_, i) => `f${i}`);
    const { supabase, calls } = fakeSupabase({
      follows: ids.map((followee_id) => ({ followee_id })),
      "passes:book": [pass("f0", "b1"), pass("f119", "b1")],
      profile_identities: [ident("f0"), ident("f119")],
    });
    const r = await getSagaFriends(supabase, detail(), order);
    const bookCalls = calls.filter((c) => c.table === "passes" && c.eq.some(([, v]) => v === "book"));
    expect(bookCalls).toHaveLength(3); // 120 seguidos = 50 + 50 + 20
    const sent = bookCalls.flatMap((c) => c.in.find(([col]) => col === "user_id")![1]);
    expect(sent).toEqual(ids);
    expect(r.map((f) => f.userId).sort()).toEqual(["f0", "f119"]);
  });

  it("trocea la consulta de identidades por ids de usuario", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "me" });
    const ids = Array.from({ length: 60 }, (_, i) => `f${i}`);
    const { supabase, calls } = fakeSupabase({
      follows: ids.map((followee_id) => ({ followee_id })),
      "passes:book": ids.map((u) => pass(u, "b1")),
      profile_identities: ids.map(ident),
    });
    const r = await getSagaFriends(supabase, detail(), order);
    expect(calls.filter((c) => c.table === "profile_identities")).toHaveLength(2);
    expect(r).toHaveLength(60);
  });

  it.each(["follows", "passes:book", "profile_identities"])("lanza si falla la consulta de %s", async (key) => {
    mocks.getCurrentUser.mockResolvedValue({ id: "me" });
    const { supabase } = fakeSupabase(
      { follows: [{ followee_id: "a" }], "passes:book": [pass("a", "b1")], profile_identities: [ident("a")] },
      { [key]: new Error("fallo") },
    );
    await expect(getSagaFriends(supabase, detail(), order)).rejects.toThrow("fallo");
  });
});
