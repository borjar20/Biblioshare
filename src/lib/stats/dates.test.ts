import { describe, it, expect } from "vitest";
import { toISODate, addDaysISO, daysInMonth, shiftMonth } from "./dates";

describe("toISODate", () => {
  it("formatea en hora local con ceros a la izquierda", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toISODate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("addDaysISO", () => {
  it("suma y resta días cruzando meses y años", () => {
    expect(addDaysISO("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("daysInMonth", () => {
  it("cuenta los días, incluidos febreros bisiestos", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2024-02")).toBe(29);
    expect(daysInMonth("2026-04")).toBe(30);
  });
});

describe("shiftMonth", () => {
  it("desplaza meses cruzando el año", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-06", 3)).toBe("2026-09");
  });
});
