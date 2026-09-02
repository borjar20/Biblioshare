import { describe, expect, it } from "vitest";
import { countCompletedSagas, daysBetweenISO, sessionUnits } from "./counts";

describe("sessionUnits", () => {
  it("por sesión toma el máximo entre minutos/10 y páginas avanzadas/10", () => {
    const rows = [
      // pase A: 25 min, de la página 0 a la 100 → max(2, 10) = 10
      { pass_id: "A", duration_minutes: 25, position: 100, session_date: "2026-09-01", started_at: "2026-09-01T10:00:00Z" },
      // pase A: 40 min, de 100 a 110 → max(4, 1) = 4
      { pass_id: "A", duration_minutes: 40, position: 110, session_date: "2026-09-01", started_at: "2026-09-01T18:00:00Z" },
      // pase B: sin posición, 15 min → max(1, 0) = 1
      { pass_id: "B", duration_minutes: 15, position: null, session_date: "2026-09-02", started_at: null },
    ];
    expect(sessionUnits(rows)).toBe(15);
  });

  it("una posición que retrocede no resta", () => {
    const rows = [
      { pass_id: "A", duration_minutes: null, position: 200, session_date: "2026-09-01", started_at: "2026-09-01T10:00:00Z" },
      { pass_id: "A", duration_minutes: null, position: 50, session_date: "2026-09-02", started_at: "2026-09-02T10:00:00Z" },
    ];
    expect(sessionUnits(rows)).toBe(20);
  });
});

describe("countCompletedSagas", () => {
  it("una saga cuenta cuando TODOS sus ítems no opcionales están completados", () => {
    const items = [
      { saga_id: "s1", item_type: "book", item_id: "b1", optional: false },
      { saga_id: "s1", item_type: "book", item_id: "b2", optional: false },
      { saga_id: "s1", item_type: "book", item_id: "b3", optional: true },
      { saga_id: "s2", item_type: "movie", item_id: "m1", optional: false },
      { saga_id: "s2", item_type: "movie", item_id: "m2", optional: false },
    ];
    const done = new Set(["book:b1", "book:b2", "movie:m1"]);
    expect(countCompletedSagas(items, done)).toBe(1);
  });
  it("una saga sin ítems obligatorios no cuenta", () => {
    const items = [{ saga_id: "s1", item_type: "book", item_id: "b1", optional: true }];
    expect(countCompletedSagas(items, new Set(["book:b1"]))).toBe(0);
  });
});

describe("daysBetweenISO", () => {
  it("cuenta días de calendario", () => {
    expect(daysBetweenISO("2026-09-01", "2026-09-01")).toBe(0);
    expect(daysBetweenISO("2026-08-30", "2026-09-02")).toBe(3);
  });
});
