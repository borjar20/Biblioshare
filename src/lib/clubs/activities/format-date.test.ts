import { describe, expect, it } from "vitest";
import { formatDayMonth, formatEventDate } from "./format-date";

describe("formatDayMonth", () => {
  it("parte la cadena ISO sin pasar por Date", () => {
    expect(formatDayMonth("2026-07-18")).toEqual({ day: "18", month: "jul" });
  });

  it("enero y diciembre caen en los extremos del array", () => {
    expect(formatDayMonth("2026-01-01").month).toBe("ene");
    expect(formatDayMonth("2026-12-31").month).toBe("dic");
  });

  // Esta es la razón de existir del helper: `new Date("2026-01-01")` se
  // interpreta como UTC, y en cualquier zona al oeste de Greenwich
  // .getDate() devuelve 31 de diciembre. Partir la cadena no puede fallar así.
  it("no retrocede un día en el primero de enero", () => {
    expect(formatDayMonth("2026-01-01").day).toBe("01");
  });
});

describe("formatEventDate", () => {
  it("junta día y mes en una línea", () => {
    expect(formatEventDate("2026-07-18")).toBe("18 jul");
  });
});
