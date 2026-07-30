import { describe, expect, it } from "vitest";
import { filterByGenre } from "./get-library-items";

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
