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

  // #135: iso.split("-") sin comprobar longitud dejaba `day` en `undefined`
  // (coaccionado a la cadena "undefined" por el template literal de abajo).
  it("cadena vacía no revienta: día y mes vuelven vacíos", () => {
    expect(formatDayMonth("")).toEqual({ day: "", month: "" });
  });

  it("cadena malformada (sin los tres tramos) también vuelve vacía", () => {
    expect(formatDayMonth("2026-07")).toEqual({ day: "", month: "" });
  });
});

describe("formatEventDate", () => {
  it("junta día y mes en una línea", () => {
    expect(formatEventDate("2026-07-18")).toBe("18 jul");
  });

  // #135: antes de la validación de longitud, esto devolvía el texto literal
  // "undefined " en vez de una cadena vacía.
  it("cadena vacía devuelve cadena vacía, no 'undefined '", () => {
    expect(formatEventDate("")).toBe("");
  });
});
