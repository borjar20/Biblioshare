import { describe, expect, it } from "vitest";
import { isAutoCloseable } from "./get-passes";

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
