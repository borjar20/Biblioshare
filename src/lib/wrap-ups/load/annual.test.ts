import { describe, expect, it } from "vitest";
import { buildMonths, fastestFinish, loadAnnual, loadOwnPet } from "./annual";
import { wrapUpWindow } from "../windows";

describe("buildMonths", () => {
  it("12 meses, ceros medidos, minutos y obras por mes", () => {
    const m = buildMonths(2026, [{ session_date: "2026-02-03", duration_minutes: 30 }, { session_date: "2026-02-10", duration_minutes: null }], ["2026-02-11", "2026-12-20"]);
    expect(m).toHaveLength(12);
    expect(m[1]).toEqual({ month: "2026-02", minutes: 30, works: 1 });
    expect(m[11]).toEqual({ month: "2026-12", minutes: 0, works: 1 });
  });
});

describe("fastestFinish", () => {
  const a = { type: "book" as const, id: "a", title: "A", coverUrl: null, times: 1 };
  it("menos días entre empezar y terminar, mínimo 1", () => {
    expect(fastestFinish([
      { item_type: "book", item_id: "a", started_on: "2026-03-01", finished_on: "2026-03-01" },
    ], [a])).toEqual({ item: a, days: 1 });
  });
  it("sin started_on no compite", () => {
    expect(fastestFinish([{ item_type: "book", item_id: "a", started_on: null, finished_on: "2026-03-01" }], [a])).toBeNull();
  });
});

function fakeClient(tables: Record<string, unknown[]>, extra: Record<string, unknown> = {}) {
  const calls: { table: string; filters: string[]; ins: string[] }[] = [];
  const client = {
    from: (table: string) => {
      const entry = { table, filters: [] as string[], ins: [] as string[] };
      calls.push(entry);
      const q: Record<string, unknown> = {};
      for (const m of ["gte", "lt", "lte", "not", "order", "limit", "is", "range"]) q[m] = () => q;
      q.select = () => q;
      q.in = (col: string) => { entry.ins.push(col); return q; };
      q.eq = (col: string, v: unknown) => { entry.filters.push(`${col}=${String(v)}`); return q; };
      const rows = () => tables[table] ?? [];
      q.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows(), count: rows().length, error: null, ...extra }).then(res);
      return q;
    },
  };
  return { client, calls };
}

const w = wrapUpWindow("year", new Date("2026-12-26T07:00:00Z"));
const book = (id: string) => ({ type: "book" as const, id, title: id, coverUrl: null, times: 1 });

describe("loadAnnual", () => {
  it("toda consulta por usuario filtra por user_id", async () => {
    const { client, calls } = fakeClient({});
    await loadAnnual(client as never, "u1", w, [book("a")]);
    const perUser = new Set(["progress_sessions", "passes", "pet_battles"]);
    expect(new Set(calls.filter((c) => perUser.has(c.table)).map((c) => c.table))).toEqual(perUser);
    for (const c of calls.filter((x) => perUser.has(x.table))) expect(c.filters).toContain("user_id=u1");
    // pet_battles: solo aventuras resueltas
    const pb = calls.find((c) => c.table === "pet_battles")!;
    expect(pb.filters).toEqual(expect.arrayContaining(["kind=adventure", "status=resolved"]));
  });

  it("junta hechos: creadores con mínimo 2, pila y aventuras ganadas", async () => {
    const { client } = fakeClient({
      progress_sessions: [{ session_date: "2026-03-01", duration_minutes: 90, passes: { item_type: "book" } }, { session_date: "2026-03-02", duration_minutes: 20, passes: { item_type: "movie" } }],
      passes: [{ item_type: "book", item_id: "a", started_on: "2026-03-01", finished_on: "2026-03-05", status: "completed" },
               { item_type: "book", item_id: "b", started_on: null, finished_on: "2026-04-05", status: "dropped" }],
      books: [{ id: "a", author: "Ursula" }, { id: "b", author: "Ursula" }, { id: "c", author: "Solo" }],
      pet_battles: [{ reward: { x: 1 }, result: { outcome: "win" } }, { reward: null, result: { outcome: "win" } }, { reward: { x: 2 }, result: { outcome: "loss" } }],
    });
    const r = await loadAnnual(client as never, "u1", w, [book("a"), book("b"), book("c")]);
    expect(r.creators).toEqual([{ name: "Ursula", works: 2 }]);
    expect(r.records.longestSessionMinutes).toBe(90);
    expect(r.records.busiestMonth).toEqual({ month: "2026-03", minutes: 110 });
    expect(r.records.fastest?.days).toBe(5);
    expect(r.pile.removed).toBe(2);
    expect(r.petYear).toEqual({ adventuresWon: 2, loot: 1 });
  });
});

describe("loadAnnual: sesiones de serie antiguas", () => {
  it("no cuentan en meses, mes más intenso ni sesión más larga", async () => {
    const { client } = fakeClient({
      progress_sessions: [
        { pass_id: "p1", session_date: "2026-02-01", duration_minutes: 500, passes: { item_type: "series" } },
        { pass_id: "p2", session_date: "2026-03-01", duration_minutes: 30, passes: { item_type: "book" } },
      ],
    });
    const r = await loadAnnual(client as never, "u1", w, []);
    expect(r.months[1].minutes).toBe(0);
    expect(r.records.busiestMonth).toEqual({ month: "2026-03", minutes: 30 });
    expect(r.records.longestSessionMinutes).toBe(30);
  });
});

describe("loadOwnPet", () => {
  it("last_stage inválido, null", async () => {
    const { client } = fakeClient({ pet_state: [{ name: "X", class: "wizard", last_stage: "dragon" }] });
    expect(await loadOwnPet(client as never, "u1")).toBeNull();
  });
  it("filtra por user_id y mapea last_stage", async () => {
    const { client, calls } = fakeClient({ pet_state: [{ name: "Bruto", class: "barbarian", last_stage: "young" }] });
    expect(await loadOwnPet(client as never, "u1")).toEqual({ name: "Bruto", petClass: "barbarian", stage: "young" });
    expect(calls[0].filters).toContain("user_id=u1");
  });
  it("sin mascota o datos raros, null", async () => {
    expect(await loadOwnPet(fakeClient({}).client as never, "u1")).toBeNull();
    expect(await loadOwnPet(fakeClient({ pet_state: [{ name: "X", class: "nope", last_stage: "young" }] }).client as never, "u1")).toBeNull();
  });
});
