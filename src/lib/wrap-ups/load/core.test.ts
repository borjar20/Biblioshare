import { describe, expect, it } from "vitest";
import { collapseFinished, loadCore, streakWithin, topGenres } from "./core";
import { wrapUpWindow } from "../windows";

describe("collapseFinished", () => {
  it("una carta por obra; relecturas suben times", () => {
    const meta = new Map([["book:a", { title: "A", coverUrl: null, genres: ["Drama"] }]]);
    const items = collapseFinished([
      { item_type: "book", item_id: "a", finished_on: "2026-09-02" },
      { item_type: "book", item_id: "a", finished_on: "2026-09-20" },
    ], meta);
    expect(items).toEqual([{ type: "book", id: "a", title: "A", coverUrl: null, times: 2 }]);
  });
  it("obra sin metadatos se descarta (borrada del catálogo)", () => {
    expect(collapseFinished([{ item_type: "movie", item_id: "x", finished_on: "2026-09-02" }], new Map())).toEqual([]);
  });
});

describe("streakWithin", () => {
  it("racha máxima de días consecutivos", () => {
    expect(streakWithin(["2026-09-01", "2026-09-02", "2026-09-04", "2026-09-05", "2026-09-06"])).toBe(3);
    expect(streakWithin([])).toBe(0);
  });
  it("cruza el fin de mes", () => expect(streakWithin(["2026-08-31", "2026-09-01"])).toBe(2));
});

describe("topGenres", () => {
  it("cuenta obras por género, desc, empate alfabético", () => {
    const items = [
      { type: "book" as const, id: "a", title: "A", coverUrl: null, times: 1 },
      { type: "book" as const, id: "b", title: "B", coverUrl: null, times: 2 },
    ];
    const meta = new Map([["book:a", { genres: ["Drama", "Ciencia ficción"] }], ["book:b", { genres: ["Drama"] }]]);
    expect(topGenres(items, meta)).toEqual([{ name: "Drama", works: 2 }, { name: "Ciencia ficción", works: 1 }]);
  });
});

function recordingClient() {
  const calls: { table: string; filters: string[] }[] = [];
  const builder = (table: string) => {
    const entry = { table, filters: [] as string[] };
    calls.push(entry);
    const q: Record<string, unknown> = {};
    for (const m of ["select", "gte", "lt", "lte", "in", "not", "order", "limit", "is"]) q[m] = () => q;
    q.eq = (col: string) => { entry.filters.push(col); return q; };
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
    return q;
  };
  return { client: { from: builder, rpc: () => Promise.resolve({ data: [], error: null }) }, calls };
}

describe("loadCore", () => {
  it("toda consulta por usuario filtra por user_id", async () => {
    const { client, calls } = recordingClient();
    await loadCore(client as never, "u1", wrapUpWindow("month", new Date("2026-10-01T07:00:00Z")));
    const perUser = calls.filter((c) => ["passes", "progress_sessions", "episode_watches"].includes(c.table));
    expect(perUser.length).toBeGreaterThan(0);
    for (const c of perUser) expect(c.filters).toContain("user_id");
  });
});
