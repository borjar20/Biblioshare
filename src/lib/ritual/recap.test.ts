import { describe, expect, it } from "vitest";
import { computeRecap, daysSpan, longestStreak } from "./recap";

describe("recap", () => {
  it("racha más larga de días consecutivos (repetidos cuentan una vez)", () => {
    expect(longestStreak(["2026-11-01", "2026-11-02", "2026-11-02", "2026-11-04", "2026-11-05", "2026-11-06"])).toBe(3);
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(["2026-12-31", "2027-01-01"])).toBe(2);
  });
  it("días entre la primera y la última sesión, ambos incluidos", () => {
    expect(daysSpan(["2026-11-06", "2026-11-01"])).toBe(6);
    expect(daysSpan(["2026-11-01"])).toBe(1);
    expect(daysSpan([])).toBe(0);
  });
  it("compone el recuento", () => {
    expect(computeRecap({ sessionDates: ["2026-11-01", "2026-11-03"], pages: 412, episodes: null }))
      .toEqual({ sessions: 2, days: 3, longestStreak: 1, pages: 412, episodes: null });
  });
});
