import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("csvCell", () => {
  it("deja pasar el texto simple sin tocarlo", () => {
    expect(csvCell("Dune")).toBe("Dune");
  });

  it("devuelve celda vacía para null y undefined", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("entrecomilla por RFC 4180 y duplica las comillas internas", () => {
    expect(csvCell("Dune, la novela")).toBe('"Dune, la novela"');
    expect(csvCell('El "Mesías"')).toBe('"El ""Mesías"""');
    expect(csvCell("2020-01-01..2020-02-01;2021-01-01")).toBe(
      '"2020-01-01..2020-02-01;2021-01-01"'
    );
    expect(csvCell("línea\nsiguiente")).toBe('"línea\nsiguiente"');
  });

  // Issue #681: el CSV lo abre una hoja de cálculo, que ejecuta como fórmula
  // toda celda que empiece por uno de estos caracteres.
  it.each(["=", "+", "-", "@", "\t", "\r"])(
    "neutraliza la celda que empieza por %j",
    (trigger) => {
      expect(csvCell(`${trigger}HYPERLINK("http://malo")`)).toBe(
        `"'${trigger}HYPERLINK(""http://malo"")"`
      );
    }
  );

  it("neutraliza sin entrecomillar cuando no hay separadores que escapar", () => {
    expect(csvCell("=cmd")).toBe("'=cmd");
  });

  it("solo mira el PRIMER carácter: un guion a mitad de título no se toca", () => {
    expect(csvCell("Spider-Man")).toBe("Spider-Man");
    expect(csvCell("correo@ejemplo.com")).toBe("correo@ejemplo.com");
  });

  it("no prefija los números: un negativo es un número, no una fórmula", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(8.5)).toBe("8.5");
  });
});
