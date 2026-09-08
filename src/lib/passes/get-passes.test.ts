import { describe, expect, it } from "vitest";
import { getPasses, getActivePass, isAutoCloseable } from "./get-passes";

it("ordena pases abiertos, fechados y completados sin fecha sin confundir su estado", async () => {
  const rows = [
    { id: "unknown", status: "completed", finished_on: null },
    { id: "open", status: "planned", finished_on: null },
    { id: "dated", status: "completed", finished_on: "2020-01-01" },
  ];
  const builder = { select: () => builder, eq: () => builder, order: async () => ({ data: rows, error: null }) };
  const result = await getPasses({ from: () => builder } as never, "movie", "m", "u");
  expect(result.map((p) => p.id)).toEqual(["open", "dated", "unknown"]);
});

// Cliente falso: devuelve el `status` que se le pida para la fila de `passes` y
// registra los filtros aplicados (el gate de usuario tiene que estar ahí).
function fakeSupabase(status: string | null, eqCalls: [string, unknown][] = []) {
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return builder;
    },
    maybeSingle: async () => ({ data: status === null ? null : { status }, error: null }),
  };
  return { from: () => builder } as never;
}

describe("isAutoCloseable (#716)", () => {
  it("deja auto-cerrar un pase en curso", async () => {
    expect(await isAutoCloseable(fakeSupabase("in_progress"), "p1", "u1")).toBe(true);
  });

  it("deja auto-cerrar un pase planificado", async () => {
    expect(await isAutoCloseable(fakeSupabase("planned"), "p1", "u1")).toBe(true);
  });

  it("NO resucita un pase abandonado: dropped se queda como está", async () => {
    expect(await isAutoCloseable(fakeSupabase("dropped"), "p1", "u1")).toBe(false);
  });

  it("no vuelve a cerrar un pase ya completado", async () => {
    expect(await isAutoCloseable(fakeSupabase("completed"), "p1", "u1")).toBe(false);
  });

  it("sin fila (pase de otro usuario, o borrado) no cierra nada", async () => {
    expect(await isAutoCloseable(fakeSupabase(null), "p1", "u1")).toBe(false);
  });

  it("filtra por id Y por usuario", async () => {
    const eqCalls: [string, unknown][] = [];
    await isAutoCloseable(fakeSupabase("in_progress", eqCalls), "p1", "u1");
    expect(eqCalls).toContainEqual(["id", "p1"]);
    expect(eqCalls).toContainEqual(["user_id", "u1"]);
  });
});

describe("lecturas de pases (#657)", () => {
  it("no convierte un fallo de lectura en un diario vacío", async () => {
    const failure = { code: "42703", message: "column unavailable" };
    const query = {
      select: () => query,
      eq: () => query,
      order: async () => ({ data: null, error: failure }),
    };
    const client = { from: () => query } as never;
    await expect(getPasses(client, "book", "book-1", "user-1"))
      .rejects.toThrow("Could not load passes");
  });

  it("no declara inexistente el pase activo cuando falla su lectura", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: async () => ({ data: null, error: { code: "42501" } }),
    };
    await expect(getActivePass({ from: () => query } as never, "book", "b", "u"))
      .rejects.toThrow("Could not load passes");
  });

  it("una consulta vacía correcta sigue significando ausencia", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: async () => ({ data: [], error: null }),
    };
    const client = { from: () => query } as never;
    expect(await getPasses(client, "book", "b", "u")).toEqual([]);
    expect(await getActivePass(client, "book", "b", "u")).toBeNull();
  });

  it("un fallo al comprobar el autocierre no equivale a un pase cerrado", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: null, error: { code: "42703" } }),
    };
    await expect(isAutoCloseable({ from: () => query } as never, "p", "u"))
      .rejects.toThrow("Could not load pass status");
  });
});
