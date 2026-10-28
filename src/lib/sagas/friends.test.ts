import { describe, expect, it } from "vitest";
import { deriveFriends, type FriendIdentity, type FriendOnSaga, type FriendPass, type FriendsInput } from "./friends";

const order: FriendsInput["order"] = [
  { key: "book:a", title: "A", href: "/a", optional: false },
  { key: "book:b", title: "B", href: "/b", optional: false },
  { key: "movie:c", title: "C", href: "/c", optional: false },
  { key: "book:o", title: "O", href: "/o", optional: true },
];
const fp = (userId: string, itemKey: string, extra: Partial<FriendPass> = {}): FriendPass => ({
  userId,
  itemKey,
  status: "completed",
  isActive: false,
  rating: null,
  startedOn: null,
  finishedOn: "2026-01-01",
  createdAt: "2026-01-01T00:00:00Z",
  ...extra,
});
const id = (userId: string): FriendIdentity => ({ userId, username: userId, displayName: null, avatarUrl: null });
const one = (passes: FriendPass[], ids = ["u"]): FriendOnSaga => {
  const r = deriveFriends({ passes, identities: ids.map(id), order });
  expect(r).toHaveLength(1);
  return r[0];
};

describe("deriveFriends", () => {
  it("una entrada por usuario e ignora pases de obras fuera del orden", () => {
    const r = deriveFriends({
      passes: [fp("u", "book:a"), fp("u", "book:b"), fp("v", "book:zzz")],
      identities: [id("u"), id("v")],
      order,
    });
    expect(r.map((f) => f.userId)).toEqual(["u"]);
  });

  it("sin identidad no hay entrada", () => {
    expect(deriveFriends({ passes: [fp("u", "book:a")], identities: [], order })).toEqual([]);
  });

  it("completed cuenta obras distintas no opcionales; counted las del orden no opcionales", () => {
    const f = one([fp("u", "book:a"), fp("u", "book:a", { finishedOn: "2026-02-01" }), fp("u", "book:o")]);
    expect(f.completed).toBe(1);
    expect(f.counted).toBe(3);
  });

  it("status reading si tiene una en curso activa", () => {
    const f = one([fp("u", "book:a"), fp("u", "book:b", { status: "in_progress", isActive: true, finishedOn: null })]);
    expect(f.status).toEqual({ kind: "reading", title: "B", href: "/b" });
  });

  it("un en curso no activo no es reading", () => {
    const f = one([fp("u", "book:a"), fp("u", "book:b", { status: "in_progress", isActive: false, finishedOn: null })]);
    expect(f.status.kind).toBe("last");
  });

  it("dos pases en curso: gana el de mayor índice en el orden", () => {
    const f = one([
      fp("u", "movie:c", { status: "in_progress", isActive: true, finishedOn: null }),
      fp("u", "book:a", { status: "in_progress", isActive: true, finishedOn: null }),
    ]);
    expect(f.status).toEqual({ kind: "reading", title: "C", href: "/c" });
  });

  it("finished si ha terminado todas las que cuentan", () => {
    const f = one([fp("u", "book:a"), fp("u", "book:b"), fp("u", "movie:c")]);
    expect(f.status).toEqual({ kind: "finished" });
  });

  it("last: la terminada de mayor índice en el orden", () => {
    const f = one([fp("u", "movie:c"), fp("u", "book:a")]);
    expect(f.status).toEqual({ kind: "last", title: "C", href: "/c" });
  });

  it("started si solo hay planned o dropped", () => {
    const f = one([fp("u", "book:a", { status: "planned", finishedOn: null }), fp("u", "book:b", { status: "dropped", finishedOn: null })]);
    expect(f.status).toEqual({ kind: "started" });
  });

  it("average usa el último pase terminado por obra; sin nota no aporta", () => {
    const f = one([
      fp("u", "book:a", { rating: 2, finishedOn: "2026-01-01" }),
      fp("u", "book:a", { rating: 8, finishedOn: "2026-03-01" }),
      fp("u", "book:b", { rating: 6, finishedOn: "2026-01-01" }),
      fp("u", "book:b", { rating: null, finishedOn: "2026-02-01" }),
    ]);
    expect(f.average).toBe(8);
  });

  it("average: finishedOn nulo es más antiguo y el empate lo decide createdAt", () => {
    const a = one([fp("u", "book:a", { rating: 2, finishedOn: null }), fp("u", "book:a", { rating: 6, finishedOn: "2020-01-01" })]);
    expect(a.average).toBe(6);
    const b = one([
      fp("u", "book:a", { rating: 2, createdAt: "2026-01-01T00:00:00Z" }),
      fp("u", "book:a", { rating: 4, createdAt: "2026-05-01T00:00:00Z" }),
    ]);
    expect(b.average).toBe(4);
  });

  it("average null si ninguna obra aporta", () => {
    expect(one([fp("u", "book:a")]).average).toBeNull();
  });

  it("lastActivity: máximo de finishedOn ?? startedOn ?? createdAt", () => {
    const f = one([
      fp("u", "book:a", { finishedOn: "2026-01-05" }),
      fp("u", "book:b", { status: "in_progress", finishedOn: null, startedOn: "2026-04-02" }),
      fp("u", "movie:c", { status: "planned", finishedOn: null, startedOn: null, createdAt: "2026-02-10T10:00:00Z" }),
    ]);
    expect(f.lastActivity).toBe("2026-04-02");
  });

  it("ordena por lastActivity desc y desempata por username asc", () => {
    const r = deriveFriends({
      passes: [
        fp("zed", "book:a", { finishedOn: "2026-05-01" }),
        fp("ana", "book:a", { finishedOn: "2026-05-01" }),
        fp("old", "book:a", { finishedOn: "2025-01-01" }),
      ],
      identities: [id("zed"), id("ana"), id("old")],
      order,
    });
    expect(r.map((f) => f.username)).toEqual(["ana", "zed", "old"]);
  });
});
