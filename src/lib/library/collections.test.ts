import { describe, expect, it } from "vitest";
import { countDistinctItems } from "./collections";

// La cabecera de la pestaña Colecciones decía «22 colecciones · 138 títulos»
// —el total de la BIBLIOTECA— sobre una rejilla cuyas colecciones sumaban 2, y
// con «136 títulos sin organizar» al pie de la misma pestaña. El segundo número
// pasa a contar lo que hay DENTRO, y tiene que cerrar la resta con el del pie.
describe("countDistinctItems", () => {
  it("el mismo título en varias colecciones cuenta una vez", () => {
    expect(
      countDistinctItems([
        { item_type: "book", item_id: "a" },
        { item_type: "book", item_id: "a" },
        { item_type: "book", item_id: "a" },
      ]),
    ).toBe(1);
  });

  it("mismo id en tipos distintos son dos títulos", () => {
    // Los ids no son únicos entre tablas: `movie:1` y `series:1` coexisten.
    expect(
      countDistinctItems([
        { item_type: "movie", item_id: "1" },
        { item_type: "series", item_id: "1" },
      ]),
    ).toBe(2);
  });

  it("sin filas, cero", () => {
    expect(countDistinctItems([])).toBe(0);
  });

  it("cuenta títulos, no filas", () => {
    expect(
      countDistinctItems([
        { item_type: "book", item_id: "a" },
        { item_type: "book", item_id: "b" },
        { item_type: "book", item_id: "a" },
        { item_type: "movie", item_id: "b" },
      ]),
    ).toBe(3);
  });
});
