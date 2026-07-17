import { describe, expect, it } from "vitest";
import {
  availableYears,
  inPeriod,
  periodParam,
  resolvePeriod,
  yearBounds,
} from "./period";

const NOW = new Date("2026-07-17T00:00:00Z");

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
