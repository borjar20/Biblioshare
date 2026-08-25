import { describe, expect, it } from "vitest";
import { computeHabits, type HabitRow } from "./get-habits";
import { computePagesPerDay, computeReadingSpeed, type PaceRow, type SpeedRow } from "./get-pace";

describe("computeHabits", () => {
  it("sin datos, todo null", () => {
    expect(computeHabits([])).toEqual({
      favoriteBand: null,
      favoriteWeekday: null,
      averageMinutes: null,
      sessions: 0,
      activeDays: 0,
    });
  });

  it("cuenta las sesiones TODAS y los días DISTINTOS", () => {
    const rows: HabitRow[] = [
      { session_date: "2026-07-11", duration_minutes: 30, started_at: null },
      // Segunda sesión del mismo día: suma sesión, no suma día.
      { session_date: "2026-07-11", duration_minutes: null, started_at: null },
      { session_date: "2026-07-12", duration_minutes: 10, started_at: null },
    ];
    const h = computeHabits(rows);
    expect(h.sessions).toBe(3);
    expect(h.activeDays).toBe(2);
    // La media solo promedia las que traen duración: (30+10)/2, no /3.
    expect(h.averageMinutes).toBe(20);
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

describe("velocidad real: páginas por hora", () => {
  function row(over: Partial<SpeedRow>): SpeedRow {
    return {
      pass_id: "p",
      item_id: "libro",
      session_date: "2026-01-01",
      position: { page: 0 },
      duration_minutes: 60,
      ...over,
    };
  }

  it("divide por tiempo leído, no por días", () => {
    // 30 páginas de avance en la sesión de 45 minutos = 40 págs/hora. Dividido
    // por días serían 30 en un día, que es otra cosa y engorda la cifra.
    const v = computeReadingSpeed([
      row({ position: { page: 30 }, duration_minutes: 45 }),
      row({ position: { page: 60 }, duration_minutes: 45 }),
    ]);
    expect(v.pagesPerHour).toBe(40);
  });

  it("la PRIMERA sesión de un pase solo fija el cursor, no cuenta como avance", () => {
    // Es lo que separa una medida de velocidad de una inflada: quien empieza a
    // registrar por la página 300 no ha leído 300 páginas en esa sesión.
    // Mismo criterio que `computePagesPerDay`, y por el mismo motivo.
    expect(computeReadingSpeed([row({ position: { page: 300 } })]).pagesPerHour).toBeNull();
  });

  it("las sesiones sin duración no entran en la media, y se cuentan", () => {
    const v = computeReadingSpeed([
      row({ position: { page: 30 } }),
      row({ position: { page: 90 }, duration_minutes: null }),
    ]);
    expect(v.pagesPerHour).toBeNull();
    expect(v.withoutDuration).toBe(1);
  });

  it("cada relectura arranca su cursor en cero", () => {
    // Mismo libro, dos pases: el avance del segundo no se mide contra el primero.
    const v = computeReadingSpeed([
      row({ pass_id: "a", position: { page: 300 }, duration_minutes: 60 }),
      row({ pass_id: "b", position: { page: 60 }, duration_minutes: 60 }),
      row({ pass_id: "b", position: { page: 120 }, duration_minutes: 60 }),
    ]);
    // Solo el segundo tramo del pase b es avance: 60 páginas en 60 minutos.
    expect(v.pagesPerHour).toBe(60);
  });

  it("desglosa por obra, de más rápida a más lenta", () => {
    const v = computeReadingSpeed([
      row({ pass_id: "a", item_id: "lenta", position: { page: 10 } }),
      row({ pass_id: "a", item_id: "lenta", position: { page: 30 } }),
      row({ pass_id: "b", item_id: "rapida", position: { page: 10 } }),
      row({ pass_id: "b", item_id: "rapida", position: { page: 90 } }),
    ]);
    expect(v.works.map((w) => w.itemId)).toEqual(["rapida", "lenta"]);
    expect(v.works[0].pagesPerHour).toBe(80);
  });

  it("un retroceso no es un avance negativo: se ignora sin restar", () => {
    const v = computeReadingSpeed([
      row({ position: { page: 100 } }),
      row({ position: { page: 40 } }),
      row({ position: { page: 160 } }),
    ]);
    // Solo cuenta 40→160 (+120) en una sesión de 60 minutos.
    expect(v.pagesPerHour).toBe(120);
  });
});
