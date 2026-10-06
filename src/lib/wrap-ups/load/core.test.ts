import { describe, expect, it } from "vitest";
import { seriesProgressFacts, activityFacts, collapseFinished, loadCore, sessionsForMinutes, streakWithin, topGenres } from "./core";
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
    for (const m of ["select", "gte", "lt", "lte", "in", "not", "order", "limit", "is", "range"]) q[m] = () => q;
    q.eq = (col: string) => { entry.filters.push(col); return q; };
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
    return q;
  };
  return { client: { from: builder, rpc: () => Promise.resolve({ data: [], error: null }) }, calls };
}

describe("sessionsForMinutes", () => {
  it("excluye las sesiones antiguas de serie: sus minutos salen de episode_watches", () => {
    const rows = [
      { pass_id: "p1", duration_minutes: 30, passes: { item_type: "book" as const } },
      { pass_id: "p2", duration_minutes: 45, passes: { item_type: "series" as const } },
    ];
    expect(sessionsForMinutes(rows)).toEqual([{ item_type: "book", pass_id: "p1", duration_minutes: 30 }]);
  });
});

describe("activityFacts", () => {
  it("los días de serie alimentan días activos y hábitos", () => {
    const sessions = [
      { pass_id: "p1", session_date: "2026-09-01", duration_minutes: 30, started_at: "2026-09-01T19:00:00Z", passes: { item_type: "book" } },
      // sesión antigua de serie: no cuenta en hábitos (ya es día de serie)
      { pass_id: "p2", session_date: "2026-09-05", duration_minutes: 20, started_at: "2026-09-05T08:00:00Z", passes: { item_type: "series" } },
    ];
    const watches = [
      { series_id: "s1", watched_on: "2026-09-02", created_at: "2026-09-02T21:00:00Z" },
      { series_id: "s1", watched_on: "2026-09-02", created_at: "2026-09-02T21:40:00Z" },
    ];
    const { activeDays, habits } = activityFacts(sessions, watches, ["2026-09-03"]);
    expect(activeDays).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05"]);
    expect(habits.sessions).toBe(2); // 1 libro + 1 día de serie (la sesión de serie antigua se descarta)
  });
});

describe("loadCore", () => {
  it("lista una serie abierta con un episodio visto en la ventana", async () => {
    const tables: Record<string, unknown[]> = {
      passes: [{ id: "ps1", item_type: "series", item_id: "s1", position: null, status: "in_progress" }],
      episode_watches: [{ series_id: "s1", watched_on: "2026-09-10", created_at: "2026-09-10T20:00:00Z" }],
      series: [{ id: "s1", title: "Serie", cover_url: null, genres: null, episode_runtime_minutes: 40 }],
    };
    const client = {
      from: (table: string) => {
        const filters: Record<string, unknown> = {};
        const q: Record<string, unknown> = {};
        for (const m of ["select", "gte", "lt", "in", "order", "range", "not", "is", "lte", "limit"]) q[m] = () => q;
        q.eq = (c: string, v: unknown) => { filters[c] = v; return q; };
        q.then = (res: (v: unknown) => unknown) => {
          let rows = tables[table] ?? [];
          if (table === "passes") rows = rows.filter((r) => (r as { status: string }).status === filters.status);
          return Promise.resolve({ data: rows, error: null }).then(res);
        };
        return q;
      },
    };
    const facts = await loadCore(client as never, "u1", wrapUpWindow("month", new Date("2026-10-01T07:00:00Z")));
    expect(facts.inProgress).toEqual([
      { type: "series", id: "s1", title: "Serie", coverUrl: null, times: 1, percent: null },
    ]);
    expect(facts.time.minutes.series).toBe(40);
  });

  it("un libro abierto a una página del final no se anuncia al 100 % (passPercent)", async () => {
    // Regresión: 668/669
    // salía «· 100 %» en «En marcha» mientras la home decía 99 %.
    const tables: Record<string, unknown[]> = {
      passes: [{ id: "pb1", item_type: "book", item_id: "b1", position: { page: 668 }, status: "in_progress" }],
      progress_sessions: [{ pass_id: "pb1", session_date: "2026-09-10", duration_minutes: 30, started_at: "2026-09-10T20:00:00Z", passes: { item_type: "book" } }],
      books: [{ id: "b1", title: "Libro", cover_url: null, genres: null, total_pages: 669 }],
    };
    const client = {
      from: (table: string) => {
        const filters: Record<string, unknown> = {};
        const q: Record<string, unknown> = {};
        for (const m of ["select", "gte", "lt", "in", "order", "range", "not", "is", "lte", "limit"]) q[m] = () => q;
        q.eq = (c: string, v: unknown) => { filters[c] = v; return q; };
        q.then = (res: (v: unknown) => unknown) => {
          let rows = tables[table] ?? [];
          if (table === "passes") rows = rows.filter((r) => (r as { status: string }).status === filters.status);
          return Promise.resolve({ data: rows, error: null }).then(res);
        };
        return q;
      },
    };
    const facts = await loadCore(client as never, "u1", wrapUpWindow("month", new Date("2026-10-01T07:00:00Z")));
    expect(facts.inProgress.map((i) => i.percent)).toEqual([99]);
  });

  it("toda consulta por usuario filtra por user_id", async () => {
    const { client, calls } = recordingClient();
    await loadCore(client as never, "u1", wrapUpWindow("month", new Date("2026-10-01T07:00:00Z")));
    const perUser = calls.filter((c) => ["passes", "progress_sessions", "episode_watches"].includes(c.table));
    expect(perUser.length).toBeGreaterThan(0);
    for (const c of perUser) expect(c.filters).toContain("user_id");
  });
});

 it("los avances agrupan todos los episodios de la ventana, sin exigir pase abierto", () => {
 const meta = new Map([["series:s1", {title: "Serie", coverUrl: null}], ["series:s2", {title: "Otra", coverUrl: null}]]);
 const rows = [{series_id: "s1"}, {series_id: "s2"}, {series_id: "s1"}, {series_id: "missing"}];
 expect(seriesProgressFacts(rows, meta)).toEqual([
 {type: "series", id: "s1", title: "Serie", coverUrl: null, times: 1, episodes: 2},
 {type: "series", id: "s2", title: "Otra", coverUrl: null, times: 1, episodes: 1},
 ]);
 });

 it("loadCore semanal recupera títulos y episodios aunque no haya pases abiertos", async () => {
 const tables: Record<string, unknown[]> = {
 episode_watches: [{id: "w1", user_id: "u1", series_id: "s1", watched_on: "2026-09-29", created_at: "2026-09-29T20:00:00Z"}, {id: "w2", user_id: "u1", series_id: "s1", watched_on: "2026-09-30", created_at: "2026-09-30T20:00:00Z"}, {id: "w3", user_id: "other", series_id: "s1", watched_on: "2026-09-30"}, {id: "w4", user_id: "u1", series_id: "s1", watched_on: "2026-09-27"}],
 series: [{id: "s1", title: "Sin pase", cover_url: null, genres: null, episode_runtime_minutes: null}],
 };
 const client = {from: (table: string) => {
 const predicates: ((r: Record<string, unknown>) => boolean)[] = [];
 const q: Record<string, unknown> = {};
 for (const method of ["select", "order", "range"]) q[method] = () => q;
 q.eq = (c: string, v: unknown) => {predicates.push(r => r[c] === v);return q;};
 q.gte = (c: string, v: string) => {predicates.push(r => String(r[c]) >= v);return q;};
 q.lt = (c: string, v: string) => {predicates.push(r => String(r[c]) < v);return q;};
 q.in = (c: string, values: unknown[]) => {predicates.push(r => values.includes(r[c]));return q;};
 q.then = (res: (v: unknown) => unknown) => Promise.resolve({data: (tables[table] ?? []).filter(r => predicates.every(p => p(r as Record<string, unknown>))), error: null}).then(res);
 return q;
 }};
 const facts = await loadCore(client as never, "u1", wrapUpWindow("week", new Date("2026-10-05T07:00:00Z")));
 expect(facts.seriesProgress).toEqual([{type: "series", id: "s1", title: "Sin pase", coverUrl: null, times: 1, episodes: 2}]);
 expect(facts.time.episodesWithoutRuntime).toBe(2);
 expect(facts.inProgress).toEqual([]);
 });
