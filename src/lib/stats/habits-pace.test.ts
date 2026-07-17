import { describe, expect, it } from "vitest";
import { computeHabits, type HabitRow } from "./get-habits";
import { computePagesPerDay, type PaceRow } from "./get-pace";

describe("computeHabits", () => {
  it("sin datos, todo null", () => {
    expect(computeHabits([])).toEqual({
      favoriteBand: null,
      favoriteWeekday: null,
      averageMinutes: null,
    });
  });

  it("franja sale de started_at; las filas sin ella no cuentan para la franja", () => {
    const rows: HabitRow[] = [
      { session_date: "2026-07-11", duration_minutes: 30, started_at: "2026-07-11T22:15:00Z" },
      { session_date: "2026-07-12", duration_minutes: 40, started_at: "2026-07-12T23:00:00Z" },
      { session_date: "2026-07-13", duration_minutes: 20, started_at: null },
    ];
    const h = computeHabits(rows);
    // 22:15 y 23:00 caen en la banda 22-24 (índice 11 → startHour 22).
    expect(h.favoriteBand).toEqual({ startHour: 22 });
    // Media de 30/40/20 = 30.
    expect(h.averageMinutes).toBe(30);
  });

  it("día más lector: lunes=0 … domingo=6", () => {
    // 2026-07-11 es sábado (5), 2026-07-13 lunes (0). Dos sábados → sábado gana.
    const rows: HabitRow[] = [
      { session_date: "2026-07-11", duration_minutes: null, started_at: null },
      { session_date: "2026-07-18", duration_minutes: null, started_at: null },
      { session_date: "2026-07-13", duration_minutes: null, started_at: null },
    ];
    expect(computeHabits(rows).favoriteWeekday).toBe(5);
  });
});

describe("computePagesPerDay", () => {
  it("sin avances medibles, null", () => {
    expect(computePagesPerDay([])).toBeNull();
  });

  it("suma avances positivos por pase y divide entre días distintos", () => {
    const rows: PaceRow[] = [
      { pass_id: "a", session_date: "2026-07-10", position: { page: 20 } },
      { pass_id: "a", session_date: "2026-07-11", position: { page: 60 } }, // +40
      { pass_id: "a", session_date: "2026-07-12", position: { page: 90 } }, // +30
    ];
    // 70 páginas en 2 días de lectura (el primero solo fija el cursor) = 35.
    expect(computePagesPerDay(rows)).toBe(35);
  });

  it("cada pase arranca su propio cursor: no cruza relecturas", () => {
    const rows: PaceRow[] = [
      { pass_id: "a", session_date: "2026-07-10", position: { page: 300 } },
      { pass_id: "b", session_date: "2026-07-11", position: { page: 10 } },
      { pass_id: "b", session_date: "2026-07-12", position: { page: 50 } }, // +40
    ];
    // Solo el pase b produce un avance (+40) en 1 día = 40; el salto 300→10 no
    // cuenta (distinto pase).
    expect(computePagesPerDay(rows)).toBe(40);
  });
});
