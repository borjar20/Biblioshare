import { describe, expect, it } from "vitest";
import { normalizeTags } from "./tags";

describe("normalizeTags", () => {
  it("parte por comas y limpia los extremos", () => {
    expect(normalizeTags(" personaje , estilo ")).toEqual(["personaje", "estilo"]);
  });

  it("quita la almohadilla: el # es presentación, no dato", () => {
    expect(normalizeTags("#final,##doble")).toEqual(["final", "doble"]);
  });

  it("normaliza a minúsculas", () => {
    expect(normalizeTags("Final,ESTILO")).toEqual(["final", "estilo"]);
  });

  it("descarta vacías y duplicadas conservando el primer orden", () => {
    expect(normalizeTags("final,,final,  ,estilo")).toEqual(["final", "estilo"]);
  });

  it("corta a 8 etiquetas", () => {
    expect(normalizeTags("a,b,c,d,e,f,g,h,i,j")).toEqual([
      "a", "b", "c", "d", "e", "f", "g", "h",
    ]);
  });

  it("una entrada vacía no produce etiquetas", () => {
    expect(normalizeTags("")).toEqual([]);
    expect(normalizeTags("   ")).toEqual([]);
    expect(normalizeTags(",,,")).toEqual([]);
  });

  it("colapsa los espacios interiores en guiones", () => {
    expect(normalizeTags("final feliz")).toEqual(["final-feliz"]);
  });
});
