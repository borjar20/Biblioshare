import { describe, expect, it } from "vitest";
import { madridYear, summarizeYear, type YearRow } from "./year";

const row = (finished_on: string, rating: number | null = null, id = finished_on): YearRow =>
  ({ item_type: "movie", item_id: id, finished_on, rating });

describe("madridYear", () => {
  it("el 31-dic a las 23:30 UTC ya es año nuevo en Madrid", () => {
    expect(madridYear(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
  });
});

describe("summarizeYear", () => {
  it("cuenta por mes partiendo la fecha a mano", () => {
    const s = summarizeYear([row("2026-07-01"), row("2026-07-31"), row("2026-01-15")], 2026)!;
    expect(s.total).toBe(3);
    expect(s.byMonth[0]).toBe(1);
    expect(s.byMonth[6]).toBe(2);
    expect(s.bestMonth).toBe(6);
  });

  it("ignora filas de otros años", () => {
    expect(summarizeYear([row("2025-12-31")], 2026)).toBeNull();
  });

  it("la mejor valorada: nota más alta y, a igualdad, la más reciente", () => {
    const s = summarizeYear([row("2026-02-01", 9, "a"), row("2026-03-01", 9, "b"), row("2026-04-01", 7, "c")], 2026)!;
    expect(s.topRatedKey).toBe("movie:b");
  });

  it("sin notas no hay mejor valorada", () => {
    expect(summarizeYear([row("2026-02-01")], 2026)!.topRatedKey).toBeNull();
  });

  it("empate de meses: gana el primero", () => {
    const s = summarizeYear([row("2026-02-01"), row("2026-05-01")], 2026)!;
    expect(s.bestMonth).toBe(1);
  });
});
