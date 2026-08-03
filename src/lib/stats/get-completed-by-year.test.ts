import { describe, it, expect } from "vitest";
import { computeCompletedByYear } from "./get-completed-by-year";

describe("computeCompletedByYear", () => {
  it("agrupa por año y tipo, rellenando años vacíos hasta el actual", () => {
    const out = computeCompletedByYear(
      [
        { finished_on: "2023-05-01", item_type: "movie" },
        { finished_on: "2023-06-01", item_type: "book" },
        { finished_on: "2026-01-01", item_type: "movie" },
      ],
      2026,
    );
    expect(out.map((y) => y.year)).toEqual([2023, 2024, 2025, 2026]);
    expect(out[0]).toEqual({ year: 2023, book: 1, movie: 1, series: 0, total: 2 });
    expect(out[1].total).toBe(0); // 2024 vacío pero presente
    expect(out[3]).toEqual({ year: 2026, book: 0, movie: 1, series: 0, total: 1 });
  });

  it("sin datos → lista vacía", () => {
    expect(computeCompletedByYear([], 2026)).toEqual([]);
  });
});
