import { describe, expect, it } from "vitest";
import {
  availablePeriods,
  availableYears,
  inPeriod,
  periodBounds,
  periodParam,
  previousBounds,
  resolvePeriod,
  yearBounds,
} from "./period";

const NOW = new Date("2026-07-17T00:00:00Z");
// Los límites de semana y mes se calculan en hora LOCAL (como `session_date`),
// así que su fecha de referencia se construye en local, no en UTC: con un `Z`,
// la prueba diría un día distinto según el huso de quien la ejecute.
const LOCAL = new Date(2026, 6, 17);

describe("resolvePeriod", () => {
  it("'todo' es all-time", () => {
    expect(resolvePeriod("todo", NOW)).toBe("all");
  });

  it("un año ofrecido se respeta", () => {
    expect(resolvePeriod("2026", NOW)).toBe(2026);
    expect(resolvePeriod("2025", NOW)).toBe(2025);
  });

  it("un año no ofrecido o basura cae en el año en curso", () => {
    expect(resolvePeriod("2019", NOW)).toBe(2026);
    expect(resolvePeriod(undefined, NOW)).toBe(2026);
    expect(resolvePeriod("xyz", NOW)).toBe(2026);
  });
});

describe("availableYears", () => {
  it("año en curso y anterior", () => {
    expect(availableYears(NOW)).toEqual([2026, 2025]);
  });
});

describe("periodParam", () => {
  it("all → todo, año → el año", () => {
    expect(periodParam("all")).toBe("todo");
    expect(periodParam(2025)).toBe("2025");
  });
});

describe("yearBounds", () => {
  it("límites [inicio, finExclusivo)", () => {
    expect(yearBounds(2026)).toEqual({
      start: "2026-01-01",
      endExclusive: "2027-01-01",
    });
  });
});

describe("resolvePeriod: ventanas cortas", () => {
  it("semana y mes tienen su propio valor de URL", () => {
    expect(resolvePeriod("semana", NOW)).toBe("week");
    expect(resolvePeriod("mes", NOW)).toBe("month");
    expect(periodParam("week")).toBe("semana");
    expect(periodParam("month")).toBe("mes");
  });

  it("el fallback es de cada vista: el muro cae en el año, el perfil en 'all'", () => {
    expect(resolvePeriod(undefined, NOW)).toBe(2026);
    expect(resolvePeriod(undefined, NOW, "all")).toBe("all");
  });
});

describe("availablePeriods", () => {
  it("semana, mes, dos años y todo", () => {
    expect(availablePeriods(NOW)).toEqual(["week", "month", 2026, 2025, "all"]);
  });
});

describe("periodBounds", () => {
  it("'todo' no acota nada", () => {
    expect(periodBounds("all", LOCAL)).toBeNull();
  });

  it("la semana son 7 días CONTANDO hoy, no los 7 anteriores", () => {
    expect(periodBounds("week", LOCAL)).toEqual({
      start: "2026-07-11",
      endExclusive: "2026-07-18",
    });
  });

  it("el mes es el natural en curso", () => {
    expect(periodBounds("month", LOCAL)).toEqual({
      start: "2026-07-01",
      endExclusive: "2026-08-01",
    });
  });

  it("un año son sus límites naturales", () => {
    expect(periodBounds(2025, LOCAL)).toEqual({
      start: "2025-01-01",
      endExclusive: "2026-01-01",
    });
  });
});

describe("previousBounds", () => {
  it("el anterior es del MISMO tamaño y termina donde empieza el actual", () => {
    expect(previousBounds("week", LOCAL)).toEqual({
      start: "2026-07-04",
      endExclusive: "2026-07-11",
    });
    expect(previousBounds("month", LOCAL)).toEqual({
      start: "2026-06-01",
      endExclusive: "2026-07-01",
    });
    expect(previousBounds(2026, LOCAL)).toEqual({
      start: "2025-01-01",
      endExclusive: "2026-01-01",
    });
  });

  it("enero retrocede de año, no de mes 0", () => {
    expect(previousBounds("month", new Date(2026, 0, 9))).toEqual({
      start: "2025-12-01",
      endExclusive: "2026-01-01",
    });
  });

  it("'todo' no tiene un 'antes' con el que comparar", () => {
    expect(previousBounds("all", LOCAL)).toBeNull();
  });
});

describe("inPeriod", () => {
  it("all acepta cualquier fecha, incluso null", () => {
    expect(inPeriod("2020-03-01", "all")).toBe(true);
    expect(inPeriod(null, "all")).toBe(true);
  });

  it("un año solo acepta las fechas de ese año; null no cuenta", () => {
    expect(inPeriod("2026-12-31T22:00:00Z", 2026)).toBe(true);
    expect(inPeriod("2025-12-31", 2026)).toBe(false);
    expect(inPeriod(null, 2026)).toBe(false);
  });
});
