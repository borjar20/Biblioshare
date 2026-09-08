import { describe, expect, it } from "vitest";
import { filterByGenre, getLibraryView, getUserGenres } from "./get-library-items";

// Constructor de un cliente Supabase falso que registra los filtros `.eq(...)`
// aplicados a la consulta de `passes` y resuelve sin filas (corta antes de
// loadGenres, así que no hay que mockear el catálogo). El builder es thenable,
// igual que el de Supabase.
function fakeSupabase(eqCalls: [string, unknown][]) {
  const builder: Record<string, unknown> = {
    order: () => builder,
    range: () => builder,
    select: () => builder,
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return builder;
    },
    then: (resolve: (v: { data: never[] }) => unknown) => resolve({ data: [] }),
  };
  return { from: () => builder } as never;
}

describe("getUserGenres (#306: la faceta refleja el filtro de estado)", () => {
  it("aplica .eq('status', ...) cuando se pasa status", async () => {
    const eqCalls: [string, unknown][] = [];
    await getUserGenres(fakeSupabase(eqCalls), "u1", "book", "in_progress");
    expect(eqCalls).toContainEqual(["status", "in_progress"]);
    expect(eqCalls).toContainEqual(["item_type", "book"]);
  });

  it("NO filtra por status cuando no se pasa (comportamiento previo)", async () => {
    const eqCalls: [string, unknown][] = [];
    await getUserGenres(fakeSupabase(eqCalls), "u1", "book");
    expect(eqCalls.some(([col]) => col === "status")).toBe(false);
  });
});

describe("filterByGenre", () => {
  const items = [
    { itemType: "book" as const, itemId: "b1" },
    { itemType: "movie" as const, itemId: "m1" },
  ];
  const genresByKey = new Map<string, string[]>([
    ["book:b1", ["Ciencia ficción", "Aventura"]],
    ["movie:m1", ["Comedia"]],
  ]);

  it("conserva solo los items cuyo array contiene la label", () => {
    const out = filterByGenre(items, "Ciencia ficción", genresByKey);
    expect(out.map((i) => i.itemId)).toEqual(["b1"]);
  });

  it("label ausente → vacío", () => {
    expect(filterByGenre(items, "Terror", genresByKey)).toEqual([]);
  });

  it("item sin entrada en genresByKey se excluye", () => {
    const out = filterByGenre(items, "Comedia", genresByKey);
    expect(out.map((i) => i.itemId)).toEqual(["m1"]);
  });
});

// Cliente falso que devuelve N pases activos y corta la hidratación: `books`,
// `movies`, `series` y `book_editions` resuelven vacío, así que hydrateItems
// descarta todas las claves y devuelve []. Sirve para comprobar el CONTRATO de
// getLibraryView (que existe, que devuelve las tres propiedades y que no
// explota), no el filtrado — eso lo cubren los tests puros de splitDropped.
function fakeEmptyLibrary() {
  const builder: Record<string, unknown> = {
    range: () => builder,
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    not: () => builder,
    order: () => builder,
    then: (resolve: (v: { data: never[] }) => unknown) => resolve({ data: [] }),
  };
  return { from: () => builder } as never;
}

// OJO: con este cliente falso la función sale por su primer `return` temprano
// (biblioteca sin pases activos) y NUNCA llega a `splitDropped` — así que
// estos dos tests solo comprueban la FORMA del contrato (que existe, que
// devuelve `{items, hiddenDropped, total}`, que una biblioteca vacía no
// revienta),
// no que `hideDropped` esté bien cableado en el pipeline. Es a propósito: un
// mock por tabla para ejercitar el pipeline completo no compensa aquí — esa
// cobertura real la da el e2e `e2e/biblioteca-ocultar-abandonados.spec.ts`.
describe("getLibraryView (solo contrato de forma, ver nota arriba)", () => {
  it("con biblioteca vacía devuelve {items: [], hiddenDropped: 0, total: 0}", async () => {
    const view = await getLibraryView(fakeEmptyLibrary(), "u1", {});
    expect(view).toEqual({ items: [], hiddenDropped: 0, total: 0 });
  });

  // `total` es lo que la vista paginada usa para decidir si pinta «Cargar
  // más». Con la biblioteca vacía tiene que ser 0, no `undefined`: un
  // `total - items.length` sobre `undefined` da NaN, y `NaN > 0` es false —
  // el botón no saldría nunca y el fallo pasaría desapercibido.
  it("con biblioteca vacía, total es 0 y no undefined", async () => {
    const view = await getLibraryView(fakeEmptyLibrary(), "u1", {});
    expect(view.total).toBe(0);
  });

  it("con biblioteca vacía, hideDropped no inventa ocultos (no llega a splitDropped)", async () => {
    const view = await getLibraryView(fakeEmptyLibrary(), "u1", { hideDropped: true });
    expect(view.hiddenDropped).toBe(0);
  });
});
