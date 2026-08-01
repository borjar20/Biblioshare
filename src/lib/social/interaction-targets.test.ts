import { describe, expect, it } from "vitest";
import { getInteractionTargetRefs } from "./interaction-targets";

type Row = Record<string, unknown>;

type Query = {
  table: string;
  columns: string | null;
  equals: Array<[string, unknown]>;
  includes: Array<[string, unknown[]]>;
};

function makeFakeSupabase(tables: Record<string, Row[]>) {
  const queries: Query[] = [];

  return {
    queries,
    client: {
      from(table: string) {
        const query: Query = {
          table,
          columns: null,
          equals: [],
          includes: [],
        };
        queries.push(query);

        const builder = {
          select(columns: string) {
            query.columns = columns;
            return builder;
          },
          eq(column: string, value: unknown) {
            query.equals.push([column, value]);
            return builder;
          },
          in(column: string, values: unknown[]) {
            query.includes.push([column, values]);
            return builder;
          },
          then(resolve: (value: unknown) => void) {
            let data = tables[table] ?? [];
            for (const [column, value] of query.equals) {
              data = data.filter((row) => row[column] === value);
            }
            for (const [column, values] of query.includes) {
              data = data.filter((row) => values.includes(row[column]));
            }
            resolve({
              data,
              error: null,
              count: null,
              status: 200,
              statusText: "OK",
            });
          },
        };

        return builder;
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

describe("getInteractionTargetRefs", () => {
  it("resuelve un lote deduplicado aunque las filas lleguen repetidas y fuera de orden", async () => {
    const { client, queries } = makeFakeSupabase({
      interaction_targets: [
        { id: "target-pass-2", kind: "pass", source_id: "pass-2" },
        { id: "target-pass-1", kind: "pass", source_id: "pass-1" },
        { id: "target-pass-1", kind: "pass", source_id: "pass-1" },
      ],
    });

    const refs = await getInteractionTargetRefs(client, [
      { kind: "pass", sourceId: "pass-2" },
      { kind: "pass", sourceId: "pass-1" },
      { kind: "pass", sourceId: "pass-1" },
      { kind: "pass", sourceId: "missing" },
    ]);

    expect(refs.size).toBe(2);
    expect(refs.get("pass:pass-1")).toEqual({
      id: "target-pass-1", kind: "pass", sourceId: "pass-1",
    });
    expect(refs.has("pass:missing")).toBe(false);
    expect(queries).toEqual([
      {
        table: "interaction_targets",
        columns: "id, kind, source_id",
        equals: [["kind", "pass"]],
        includes: [["source_id", ["pass-2", "pass-1", "missing"]]],
      },
    ]);
  });
});
