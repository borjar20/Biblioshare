import { describe, expect, it } from "vitest";
import { filterByGenre, getLibraryView, getUserGenres } from "./get-library-items";

// Constructor de un cliente Supabase falso que registra los filtros `.eq(...)`
// aplicados a la consulta de `passes` y resuelve sin filas (corta antes de
// loadGenres, así que no hay que mockear el catálogo). El builder es thenable,
// igual que el de Supabase.
function fakeSupabase(eqCalls: [string, unknown][]) {
  const builder: Record<string, unknown> = {
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
    { itemType: "book", itemId: "b1" },
    { itemType: "movie", itemId: "m1" },
  ] as any[];
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
// getLibraryView (que existe, que devuelve las dos propiedades y que no
// explota), no el filtrado — eso lo cubren los tests puros de splitDropped.
function fakeEmptyLibrary() {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    not: () => builder,
    order: () => builder,
    then: (resolve: (v: { data: never[] }) => unknown) => resolve({ data: [] }),
  };
  return { from: () => builder } as never;
}

describe("getLibraryView", () => {
  it("devuelve items y hiddenDropped", async () => {
    const view = await getLibraryView(fakeEmptyLibrary(), "u1", {});
    expect(view).toEqual({ items: [], hiddenDropped: 0 });
  });

  it("biblioteca vacía con hideDropped no inventa ocultos", async () => {
    const view = await getLibraryView(fakeEmptyLibrary(), "u1", { hideDropped: true });
    expect(view.hiddenDropped).toBe(0);
  });
});
