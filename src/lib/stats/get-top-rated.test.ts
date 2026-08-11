import { describe, it, expect } from "vitest";
import { pickTopRated } from "./get-top-rated";

const rows = [
  { item_type: "movie" as const, item_id: "a", rating: 5 },
  { item_type: "book" as const, item_id: "b", rating: 3 },
  { item_type: "movie" as const, item_id: "c", rating: 4 },
  { item_type: "movie" as const, item_id: "d", rating: 5 },
];

describe("pickTopRated", () => {
  it("ordena por nota desc y corta a limit", () => {
    const out = pickTopRated(rows, 2);
    expect(out.map((r) => r.rating)).toEqual([5, 5]);
  });

  it("con menos filas que el límite, las devuelve todas ordenadas", () => {
    const out = pickTopRated(rows, 10);
    expect(out.map((r) => r.rating)).toEqual([5, 5, 4, 3]);
  });

  it("relectura de la misma obra no duplica: se queda con la nota más alta", () => {
    const reread = [
      { item_type: "book" as const, item_id: "dune", rating: 4 },
      { item_type: "book" as const, item_id: "dune", rating: 5 },
    ];
    const out = pickTopRated(reread, 10);
    expect(out).toHaveLength(1);
    expect(out[0].rating).toBe(5);
  });
});
