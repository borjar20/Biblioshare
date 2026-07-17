import { describe, expect, it } from "vitest";
import { bestStreak, currentStreak, lastDays } from "./streak";

const HOY = "2026-07-17";

describe("racha", () => {
  it("cuenta los días seguidos hasta hoy", () => {
    const days = new Set(["2026-07-15", "2026-07-16", "2026-07-17"]);
    expect(currentStreak(days, HOY)).toBe(3);
  });

  it("una racha viva no se rompe porque aún no hayas leído HOY", () => {
    const days = new Set(["2026-07-15", "2026-07-16"]);
    expect(currentStreak(days, HOY)).toBe(2);
  });

  it("se rompe con un hueco: anteayer y antes no cuentan si ayer no hubo nada", () => {
    const days = new Set(["2026-07-14", "2026-07-15"]);
    expect(currentStreak(days, HOY)).toBe(0);
  });

  it("sin actividad no hay racha", () => {
    expect(currentStreak(new Set(), HOY)).toBe(0);
    expect(bestStreak(new Set())).toBe(0);
  });

  it("la mejor racha es la más larga, esté donde esté", () => {
    const days = new Set([
      "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", // 4 seguidos
      "2026-07-16", "2026-07-17", // 2 seguidos (la actual)
    ]);
    expect(bestStreak(days)).toBe(4);
    expect(currentStreak(days, HOY)).toBe(2);
  });

  it("un día repetido no infla la racha", () => {
    // El Set ya deduplica, pero es la garantía que da sentido a usar Set:
    // dos sesiones el mismo día son UN día de racha.
    const days = new Set(["2026-07-17", "2026-07-17"]);
    expect(currentStreak(days, HOY)).toBe(1);
  });

  it("los últimos 7 días van del más antiguo a hoy", () => {
    const week = lastDays(new Set(["2026-07-17", "2026-07-13"]), HOY);
    expect(week).toHaveLength(7);
    expect(week[0].date).toBe("2026-07-11");
    expect(week[6].date).toBe(HOY);
    expect(week[6].active).toBe(true);
    expect(week.filter((d) => d.active).map((d) => d.date)).toEqual([
      "2026-07-13",
      "2026-07-17",
    ]);
  });
});
