import { describe, it, expect } from "vitest";
import { tierColumnWidth } from "./tierlist-types";

// El tablero de tierlist tenía la etiqueta del nivel en una columna de 44px de
// ancho FIJA. Con niveles con nombre ("Perezón histórico") el texto salía de la
// caja y lo cortaba el `overflow-hidden` de la fila: se leía media palabra.
// Ahora la columna tiene dos anchos, y esta es la regla que elige.
describe("tierColumnWidth", () => {
  it("deja la columna estrecha con etiquetas de una letra (S/A/B/C/D)", () => {
    expect(tierColumnWidth(["S", "A", "B", "C", "D"])).toBe("narrow");
  });

  it("aguanta tres caracteres: es lo que cabe justo en los 44px", () => {
    expect(tierColumnWidth(["PEC", "OK", "S"])).toBe("narrow");
  });

  it("ensancha en cuanto una etiqueta pasa de tres", () => {
    expect(tierColumnWidth(["S", "Perezón histórico"])).toBe("wide");
  });

  it("es del TABLERO, no de la fila: una sola etiqueta larga ensancha todas", () => {
    // Con el ancho por fila, las portadas de cada tier arrancarían en una
    // vertical distinta y la retícula dejaría de leerse como una tabla.
    expect(tierColumnWidth(["S", "A", "Ni fu ni fa (como dirían los entendidos)"])).toBe("wide");
  });

  it("sin niveles no hay nada que no quepa", () => {
    expect(tierColumnWidth([])).toBe("narrow");
  });
});
