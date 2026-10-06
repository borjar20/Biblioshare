import { describe, expect, it } from "vitest";
import { adminSweepDeps } from "./generate";
import type { WrapUpPayload } from "./types";
import { wrapUpWindow } from "./windows";

type Row = Record<string, unknown>;
function database(initial: Row[] = [], experiences: Row[] = []) {
  const rows = initial;
  const client = { from(table: string) {
    let op = "read"; let values: Row = {}; const filters: ((row: Row) => boolean)[] = [];
    const q = {
      select: () => q, order: () => q, range: () => q,
      or: (value: string) => {
        if (value.startsWith("period_start.lt.")) {
          const start = value.split(",")[0].slice("period_start.lt.".length);
          filters.push(r => String(r.period_start) < start || r.published_post_id == null);
        }
        return q;
      },
      eq: (key: string, value: unknown) => { filters.push(r => r[key] === value); return q; },
      is: (key: string, value: unknown) => { filters.push(r => (r[key] ?? null) === value); return q; },
      lt: (key: string, value: string) => { filters.push(r => String(r[key]) < value); return q; },
      lte: (key: string, value: string) => { filters.push(r => String(r[key]) <= value); return q; },
      gte: (key: string, value: string) => { filters.push(r => String(r[key]) >= value); return q; },
      update: (v: Row) => { op = "update"; values = v; return q; },
      upsert: (v: Row) => { op = "upsert"; values = v; return q; },
      insert: (v: Row) => { op = "insert"; values = v; return q; },
      delete: () => { op = "delete"; return q; },
      then: (resolve: (result: unknown) => unknown) => {
        let data: Row[] = []; let error: { code: string } | null = null;
        if (table === "experiences") data = experiences.filter(r => filters.every(f => f(r)));
        else if (table === "wrap_ups") {
          data = rows.filter(r => filters.every(f => f(r)));
          if (op === "update") data.forEach(r => Object.assign(r, values));
          if (op === "delete") for (const r of data) rows.splice(rows.indexOf(r), 1);
          if (op === "insert") {
            if (rows.some(r => r.user_id === values.user_id && r.kind === values.kind)) { data = []; error = { code: "23505" }; }
            else { rows.push(values); data = [values]; }
          }
          if (op === "upsert") {
            const row = rows.find(r => r.user_id === values.user_id && r.kind === values.kind);
            if (row) Object.assign(row, values); else rows.push(values);
            data = [row ?? values];
          }
        }
        return Promise.resolve({ data, error }).then(resolve);
      },
    }; return q;
  }};
  return { rows, deps: adminSweepDeps(client as never) };
}
const payload = (start: string) => ({ v: 1, kind: "week", periodStart: start, periodEnd: "2026-10-11", intensity: "full" }) as WrapUpPayload;
const row = (start: string) => ({ user_id: "u1", kind: "week", period_start: start, payload: payload(start), published_post_id: null, refreshed_at: null });

describe("cron: escrituras y candidatos reales", () => {
  it("un barrido anterior no pisa el periodo siguiente", async () => {
    const db = database([row("2026-10-05")]);
    expect(await db.deps.upsert("u1", payload("2026-09-28"), true)).toBe(false);
    expect(db.rows[0].payload).toEqual(payload("2026-10-05"));
  });
  it("dos barridos del nuevo periodo sólo producen una escritura que reclama el push", async () => {
    const db = database([row("2026-09-28")]);
    const results = await Promise.all([db.deps.upsert("u1", payload("2026-10-05"), false), db.deps.upsert("u1", payload("2026-10-05"), false)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(db.rows).toHaveLength(1);
  });
  it("el reintento no pisa una actualización manual ni una publicación", async () => {
    const db = database([{ ...row("2026-09-28"), refreshed_at: "2026-10-06T10:00:00Z" }]);
    expect(await db.deps.upsert("u1", payload("2026-09-28"), true)).toBe(false);
    db.rows[0].refreshed_at = null; db.rows[0].published_post_id = "post";
    expect(await db.deps.upsert("u1", payload("2026-09-28"), true)).toBe(false);
  });
  it("el barrido vacío anterior no borra el periodo siguiente", async () => {
    const db = database([row("2026-10-05")]);
    await db.deps.remove("u1", "week", "2026-09-28");
    expect(db.rows).toHaveLength(1);
  });
  it("un reintento vacío conserva una publicación del mismo periodo", async () => {
    const db = database([{ ...row("2026-09-28"), published_post_id: "post" }]);
    await db.deps.remove("u1", "week", "2026-09-28");
    expect(db.rows).toHaveLength(1);
    await db.deps.remove("u1", "week", "2026-10-05");
    expect(db.rows).toHaveLength(0);
  });
  it("incluye quien sólo tiene una experiencia vivida en el periodo", async () => {
    const db = database([], [{ creator_id: "xp-owner", state: "lived", audience: "profile", starts_on: "2026-10-01", ends_on: null }]);
    expect(await db.deps.candidates(wrapUpWindow("week", new Date("2026-10-05T10:00:00Z")))).toEqual(["xp-owner"]);
  });
});
