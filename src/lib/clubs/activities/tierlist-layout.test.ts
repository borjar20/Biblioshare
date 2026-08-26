import { describe, it, expect } from "vitest";
import { layoutForTiers } from "./tierlist-types";

// El tablero de tierlist tenía la etiqueta del nivel en una columna de 44px de
// ancho FIJA. Con niveles con nombre ("Perezón histórico") el texto salía de la
// caja y lo cortaba el `overflow-hidden` de la fila: se leía media palabra. El
// arreglo cambia el layout de la fila entera, y esta es la regla que lo decide.
describe("layoutForTiers", () => {
  it("mantiene la columna de color con etiquetas de una letra (S/A/B/C/D)", () => {
    expect(layoutForTiers(["S", "A", "B", "C", "D"])).toBe("column");
  });

  it("aguanta tres caracteres: es lo que cabe justo en los 44px", () => {
    expect(layoutForTiers(["PEC", "OK", "S"])).toBe("column");
  });

  it("pasa a banda superior en cuanto una etiqueta pasa de tres", () => {
    expect(layoutForTiers(["S", "Perezón histórico"])).toBe("banner");
  });

  it("es del TABLERO, no de la fila: una sola etiqueta larga arrastra a todas", () => {
    // Mezclar filas de columna y filas de banda en el mismo tablero se lee como
    // un fallo de maquetación. Por eso la decisión mira todas las etiquetas.
    expect(layoutForTiers(["S", "A", "Ni fu ni fa (como dirían los entendidos)"])).toBe(
      "banner",
    );
  });

  it("sin niveles no hay nada que no quepa", () => {
    expect(layoutForTiers([])).toBe("column");
  });
});
