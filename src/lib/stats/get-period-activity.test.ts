import { describe, expect, it } from "vitest";
import { getPeriodActivity } from "./get-period-activity";

type Row = { user_id: string; finished_on: string | null; item_type: string; status: string };
const rows: Row[] = [
  { user_id: "u", finished_on: null, item_type: "movie", status: "completed" },
  { user_id: "u", finished_on: "2020-01-01", item_type: "movie", status: "completed" },
  { user_id: "u", finished_on: null, item_type: "movie", status: "planned" },
];
function fixture() {
  return { from(table: string) {
    let result = table === "passes" ? [...rows] : [];
    const query = {
      select() { return query; },
      eq(key: keyof Row, value: string) { result = result.filter((r) => r[key] === value); return query; },
      in(key: keyof Row, values: string[]) { result = result.filter((r) => values.includes(r[key]!)); return query; },
      gte(key: keyof Row, value: string) { result = result.filter((r) => r[key] !== null && r[key]! >= value); return query; },
      lt(key: keyof Row, value: string) { result = result.filter((r) => r[key] !== null && r[key]! < value); return query; },
      then(resolve: (result: { data: Row[]; error: null }) => unknown) { return Promise.resolve({ data: result, error: null }).then(resolve); },
    };
    return query;
  } } as unknown as Parameters<typeof getPeriodActivity>[0];
}

describe("vistas sin fecha en actividad", () => {
  it("cuentan en el total sin inventar un bucket anual", async () => {
    const result = await getPeriodActivity(fixture(), "u", "all");
    expect(result.works).toBe(2);
    expect(result.byType.movie).toBe(2);
    expect(result.buckets.map((b) => [b.key, b.works])).toEqual([["2020", 1]]);
  });
  it("no entran en un periodo fechado ni cuentan como pendientes vistos", async () => {
    const result = await getPeriodActivity(fixture(), "u", 2020);
    expect(result.works).toBe(1);
  });
});
