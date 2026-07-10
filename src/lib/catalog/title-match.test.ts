import { describe, it, expect } from "vitest";
import { normalizeTitle, isSameTitle } from "./title-match";

describe("normalizeTitle", () => {
  it("quita acentos, mayúsculas y puntuación", () => {
    expect(normalizeTitle("La Casa de los Espíritus")).toBe("la casa de los espiritus");
    expect(normalizeTitle("¿Quién?  ¡Sí!")).toBe("quien si");
  });
});

describe("isSameTitle", () => {
  it("iguala variantes de acento/puntuación", () => {
    expect(isSameTitle("La casa de los espíritus", "La Casa De Los Espiritus")).toBe(true);
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
