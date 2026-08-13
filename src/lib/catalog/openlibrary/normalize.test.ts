import { describe, expect, it } from "vitest";
import { acceptEditionTitle, normalizeTitleForComparison } from "./normalize";

describe("normalizeTitleForComparison", () => {
  it("iguala mayúsculas, acentos y puntuación", () => {
    expect(normalizeTitleForComparison("Duckling ugly")).toBe(
      normalizeTitleForComparison("Duckling Ugly")
    );
    expect(normalizeTitleForComparison("It's O.K. to say no!")).toBe(
      normalizeTitleForComparison("It's Ok to Say No!")
    );
    expect(normalizeTitleForComparison("En llamas")).toBe(
      normalizeTitleForComparison("  EN  LLAMAS  ")
    );
  });

  it("no confunde dos títulos distintos de la misma saga", () => {
    expect(normalizeTitleForComparison("Fundación")).not.toBe(
      normalizeTitleForComparison("Fundación e Imperio")
    );
  });
});

describe("acceptEditionTitle", () => {
  it("acepta el título de la edición en el idioma pedido", () => {
    expect(acceptEditionTitle("Fatta Eld", "En llamas", ["spa"], "spa")).toBe("En llamas");
  });

  it("rechaza una edición en otro idioma aunque venga primera", () => {
    // `lang=es` devuelve la MEJOR edición disponible, no necesariamente en
    // español: sin esta comprobación se cuelan títulos en alemán y turco, que
    // son peores que el título inglés de la obra.
    expect(
      acceptEditionTitle("Gregor and the Marks of Secret", "Gregor Und Der Fluch DES Unterlandes", ["ger"], "spa")
    ).toBeNull();
  });

  it("rechaza un título de edición que pierde información respecto al de la obra", () => {
    // El work «Gregor and the Code of Claw» no puede quedarse en «Gregor».
    expect(acceptEditionTitle("Gregor and the Code of Claw", "Gregor", ["eng"], "eng")).toBeNull();
  });

  it("acepta un título más largo o distinto, aunque comparta prefijo", () => {
    expect(acceptEditionTitle("Gregor", "Gregor the Overlander", ["eng"], "eng")).toBe(
      "Gregor the Overlander"
    );
    expect(acceptEditionTitle("The Hunger Games", "Los juegos del hambre", ["spa"], "spa")).toBe(
      "Los juegos del hambre"
    );
  });

  it("tolera edición ausente o sin idiomas", () => {
    expect(acceptEditionTitle("Scythe", undefined, ["spa"], "spa")).toBeNull();
    expect(acceptEditionTitle("Scythe", "Siega", undefined, "spa")).toBeNull();
    expect(acceptEditionTitle("Scythe", "", ["spa"], "spa")).toBeNull();
  });
});
