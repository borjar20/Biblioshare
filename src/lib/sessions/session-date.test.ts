import { describe, expect, it } from "vitest";
import { durationLabel, monthLabel, sessionDateLabel } from "./session-date";

describe("sessionDateLabel", () => {
  it("sin año en el año en curso, con año si es otro", () => {
    expect(sessionDateLabel("2026-11-09", 2026)).toBe("9 nov");
    expect(sessionDateLabel("2025-11-09", 2026)).toBe("9 nov 2025");
  });
  it("no se mueve de día por la zona horaria", () => {
    expect(sessionDateLabel("2026-01-01", 2026)).toBe("1 ene");
  });
});

describe("monthLabel", () => {
  it("mes con mayúscula y año solo si no es el actual", () => {
    expect(monthLabel("2026-08", 2026)).toBe("Agosto");
    expect(monthLabel("2025-08", 2026)).toBe("Agosto de 2025");
  });
});

describe("durationLabel", () => {
  it("minutos, horas y minutos, u horas justas", () => {
    expect(durationLabel(25)).toBe("25 min");
    expect(durationLabel(85)).toBe("1 h 25 min");
    expect(durationLabel(120)).toBe("2 h");
  });
});
