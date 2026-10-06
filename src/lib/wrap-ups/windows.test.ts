import { describe, expect, it } from "vitest";
import { madridToday, wrapUpWindow } from "./windows";

describe("madridToday", () => {
  it("usa la fecha de Madrid, no la UTC", () => {
    // 23:30 UTC del 31-dic = 00:30 del 1-ene en Madrid (invierno, UTC+1)
    expect(madridToday(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    // 22:30 UTC del 24-oct = 00:30 del 25-oct en Madrid (verano, UTC+2)
    expect(madridToday(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
  });
});

describe("wrapUpWindow", () => {
  it("semana: la ISO anterior completa, lunes a domingo", () => {
    const w = wrapUpWindow("week", new Date("2026-10-05T07:00:00Z")); // lunes 09:00 Madrid
    expect(w).toMatchObject({ start: "2026-09-28", endExclusive: "2026-10-05", end: "2026-10-04", grain: "day" });
    expect(w.previous).toEqual({ start: "2026-09-21", endExclusive: "2026-09-28" });
  });
  it("semana que cruza el año", () => {
    const w = wrapUpWindow("week", new Date("2027-01-04T08:00:00Z"));
    expect(w).toMatchObject({ start: "2026-12-28", endExclusive: "2027-01-04" });
  });
  it("semana con cambio de hora de octubre dentro", () => {
    const w = wrapUpWindow("week", new Date("2026-10-26T08:00:00Z"));
    expect(w).toMatchObject({ start: "2026-10-19", endExclusive: "2026-10-26" });
  });
  it("semana pedida a mitad de semana (Actualizar) sigue siendo la anterior", () => {
    const w = wrapUpWindow("week", new Date("2026-10-08T10:00:00Z")); // jueves
    expect(w).toMatchObject({ start: "2026-09-28", endExclusive: "2026-10-05" });
  });
  it("mes: el natural anterior y su anterior", () => {
    const w = wrapUpWindow("month", new Date("2026-10-01T07:00:00Z"));
    expect(w).toMatchObject({ start: "2026-09-01", endExclusive: "2026-10-01", end: "2026-09-30", grain: "day" });
    expect(w.previous).toEqual({ start: "2026-08-01", endExclusive: "2026-09-01" });
  });
  it("mes de enero mira a diciembre", () => {
    const w = wrapUpWindow("month", new Date("2027-01-01T08:00:00Z"));
    expect(w).toMatchObject({ start: "2026-12-01", endExclusive: "2027-01-01" });
  });
  it("año: desde el 26-dic, 1-ene → 25-dic del año en curso", () => {
    const w = wrapUpWindow("year", new Date("2026-12-26T09:00:00Z"));
    expect(w).toMatchObject({ start: "2026-01-01", endExclusive: "2026-12-26", end: "2026-12-25", grain: "month" });
    expect(w.previous).toEqual({ start: "2025-01-01", endExclusive: "2025-12-26" });
  });
  it("año: antes del 26-dic sigue siendo el del año pasado", () => {
    expect(wrapUpWindow("year", new Date("2027-01-03T10:00:00Z"))).toMatchObject({ start: "2026-01-01" });
    expect(wrapUpWindow("year", new Date("2026-12-25T10:00:00Z"))).toMatchObject({ start: "2025-01-01" });
  });
});
