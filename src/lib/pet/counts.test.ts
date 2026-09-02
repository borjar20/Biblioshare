import { describe, expect, it } from "vitest";
import { countCompletedSagas, daysBetweenISO, petActiveDays, sessionUnits, splitPassHistory, type PassRow } from "./counts";

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

  it("tras un retroceso la referencia no baja: las páginas no se cuentan dos veces", () => {
    const rows = [
      { pass_id: "A", duration_minutes: null, position: 200, session_date: "2026-09-01", started_at: null },
      { pass_id: "A", duration_minutes: null, position: 50, session_date: "2026-09-02", started_at: null },
      { pass_id: "A", duration_minutes: null, position: 220, session_date: "2026-09-03", started_at: null },
    ];
    // 200 → 20; retroceso → 0; 220 − 200 = 20 → 2. Total 22 (no 20 + 17).
    expect(sessionUnits(rows)).toBe(22);
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

describe("splitPassHistory", () => {
  const day = (iso: string) => iso.slice(0, 10);
  const pass = (over: Partial<PassRow>): PassRow => ({
    item_type: "book",
    item_id: "b",
    status: "completed",
    finished_on: null,
    rating: null,
    created_at: "2026-09-02T10:15:00.123Z",
    ...over,
  });

  it("un pase cerrado el mismo día del alta, o después, es vivido", () => {
    const rows = [
      pass({ finished_on: "2026-09-02" }),
      pass({ item_id: "c", finished_on: "2026-09-05" }),
      pass({ item_id: "d", status: "reading", finished_on: null }),
    ];
    const r = splitPassHistory(rows, day, 10);
    expect(r.lived).toHaveLength(3);
    expect(r.historical).toHaveLength(0);
  });

  it("un pase cerrado ANTES del día del alta es historial (lectura pasada registrada hoy)", () => {
    const r = splitPassHistory([pass({ finished_on: "2024-01-31" })], day, 10);
    expect(r.historical).toHaveLength(1);
    expect(r.lived).toHaveLength(0);
  });

  it("created_at a medianoche UTC exacta es historial (relectura fechada por el importador)", () => {
    const rows = [
      pass({ created_at: "2024-03-01T00:00:00+00:00", finished_on: "2024-03-01" }),
      pass({ item_id: "c", created_at: "2026-09-02T00:00:00.001Z", finished_on: "2026-09-02" }),
    ];
    const r = splitPassHistory(rows, day, 10);
    expect(r.historical.map((p) => p.item_id)).toEqual(["b"]);
    expect(r.lived.map((p) => p.item_id)).toEqual(["c"]);
  });

  it("un día de alta con burstMin pases o más es un volcado: todos historial, aunque no sean retroactivos", () => {
    const burst = Array.from({ length: 10 }, (_, i) =>
      pass({ item_id: `x${i}`, status: i % 2 ? "completed" : "planned", finished_on: i % 2 ? "2026-09-02" : null }),
    );
    const other = pass({ item_id: "y", created_at: "2026-09-03T09:00:00.5Z", finished_on: "2026-09-03" });
    const r = splitPassHistory([...burst, other], day, 10);
    expect(r.historical).toHaveLength(10);
    expect(r.lived.map((p) => p.item_id)).toEqual(["y"]);
    // Un pase menos y el día ya no es volcado.
    const r2 = splitPassHistory([...burst.slice(1), other], day, 10);
    expect(r2.historical).toHaveLength(0);
  });
});

describe("petActiveDays", () => {
  it("un día de sesión y un día de cierre vivido cuentan, y no se duplican", () => {
    const days = petActiveDays(
      [{ session_date: "2026-09-01" }, { session_date: "2026-09-02" }, { session_date: "2026-09-02" }],
      [{ finished_on: "2026-09-02" }, { finished_on: "2026-09-03" }, { finished_on: null }],
    );
    expect([...days].sort()).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("148 finished_on del HISTORIAL no suben los días activos de la mascota", () => {
    // El caso real de prod (decisiones.md 2026-09-02): un volcado de 148
    // lecturas con sus fechas. Como splitPassHistory las deja fuera de
    // `lived`, no llegan aquí y la CON de la mascota no se infla: solo cuenta
    // el día que SÍ se vivió en la app.
    const historical = Array.from({ length: 148 }, (_, i) => ({
      finished_on: `2019-${String((i % 12) + 1).padStart(2, "0")}-01`,
    }));
    const lived = [{ finished_on: "2026-09-02" }];
    expect(petActiveDays([], lived).size).toBe(1);
    // Y si se colaran, serían 12 días más: por eso el filtro va antes.
    expect(petActiveDays([], [...lived, ...historical]).size).toBe(13);
  });
});
