import { describe, expect, it } from "vitest";
import { validateActivityDetails } from "./activity-details";

const base = { title: "Salitre y Cenizas", description: "", startsOn: "", endsOn: "" };

describe("validateActivityDetails", () => {
  it("lo válido no da error", () => {
    expect(validateActivityDetails(base)).toBeNull();
  });

  it("el título vacío no vale", () => {
    expect(validateActivityDetails({ ...base, title: "" })).toBe("title_required");
  });

  it("un título de solo espacios tampoco: se recorta antes de mirar", () => {
    expect(validateActivityDetails({ ...base, title: "   " })).toBe("title_required");
  });

  it("la ventana invertida no vale", () => {
    expect(
      validateActivityDetails({ ...base, startsOn: "2026-09-01", endsOn: "2026-08-01" }),
    ).toBe("invalid_range");
  });

  it("mismo día de inicio y fin SÍ vale: una actividad de un día", () => {
    expect(
      validateActivityDetails({ ...base, startsOn: "2026-08-01", endsOn: "2026-08-01" }),
    ).toBeNull();
  });

  it("solo una de las dos fechas vale: no hay rango que invertir", () => {
    expect(validateActivityDetails({ ...base, endsOn: "2026-08-01" })).toBeNull();
    expect(validateActivityDetails({ ...base, startsOn: "2026-08-01" })).toBeNull();
  });

  it("una fecha de fin en el PASADO vale: cerrar algo con la fecha en que terminó", () => {
    expect(
      validateActivityDetails({ ...base, startsOn: "2020-01-01", endsOn: "2020-02-01" }),
    ).toBeNull();
  });
});
