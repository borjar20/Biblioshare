import { describe, it, expect } from "vitest";
import { normalizeTitle, isSameTitle } from "./title-match";

describe("normalizeTitle", () => {
  it("quita acentos, mayúsculas y puntuación", () => {
    expect(normalizeTitle("La Casa de los Espíritus")).toBe("la casa de los espiritus");
    expect(normalizeTitle("¿Quién?  ¡Sí!")).toBe("quien si");
  });

  it("conserva letras y dígitos de alfabetos no latinos", () => {
    expect(normalizeTitle("Война и мир")).toBe("война и мир");
    expect(normalizeTitle("Ἰλιάς")).toBe("ἰλιάς");
    expect(normalizeTitle("הנסיך הקטן")).toBe("הנסיך הקטן");
    expect(normalizeTitle("こころ 3")).toBe("こころ 3");
  });

  it("unifica NFC y NFD sin confundir letras con marcas semánticas", () => {
    expect(normalizeTitle("Й")).toBe(normalizeTitle("И\u0306"));
    expect(normalizeTitle("Ἰλιάς")).toBe(normalizeTitle("Ι\u0313λια\u0301ς"));
    expect(normalizeTitle("й")).not.toBe(normalizeTitle("и"));
  });

  it("mantiene vacío un título compuesto solo por puntuación", () => {
    expect(normalizeTitle("— …")).toBe("");
  });
});

describe("isSameTitle", () => {
  it("iguala variantes de acento/puntuación", () => {
    expect(isSameTitle("La casa de los espíritus", "La Casa De Los Espiritus")).toBe(true);
  });

  it("iguala títulos idénticos en alfabetos no latinos", () => {
    expect(isSameTitle("Война и мир", "Война и мир")).toBe(true);
  });

  it("no iguala títulos distintos en alfabetos no latinos", () => {
    expect(isSameTitle("こころ", "三体")).toBe(false);
  });

  it("acepta contención cuando las longitudes son cercanas (subtítulo de edición)", () => {
    expect(isSameTitle("Dune", "Dune (edición especial)")).toBe(false); // demasiado corto vs largo
    expect(isSameTitle("El nombre del viento", "El nombre del viento — edición")).toBe(true);
  });

  it("rechaza coincidencias por substring casual", () => {
    expect(isSameTitle("1984", "Notas sobre 1984 y otros ensayos largos")).toBe(false);
  });

  it("rechaza títulos vacíos", () => {
    expect(isSameTitle("", "algo")).toBe(false);
  });
});
