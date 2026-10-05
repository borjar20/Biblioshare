import { describe, expect, it } from "vitest";
import { isRatioReached, marginUnlockRatio, unlockPageHint } from "./threshold";

describe("marginUnlockRatio", () => {
  it("añade el 3 % en libros largos", () => {
    expect(marginUnlockRatio(0.535, 400)).toBeCloseTo(0.565, 6);
  });
  it("usa el mínimo de 5 páginas en libros cortos", () => {
    // 5/100 = 0.05 > 0.03
    expect(marginUnlockRatio(0.5, 100)).toBeCloseTo(0.55, 6);
  });
});

describe("isRatioReached", () => {
  it("no abre en la página exacta de la nota", () => {
    expect(isRatioReached(214, 400, 214 / 400)).toBe(false);
  });
  it("abre pasado el margen en la misma edición", () => {
    expect(isRatioReached(226, 400, 214 / 400)).toBe(true);
    expect(isRatioReached(225, 400, 214 / 400)).toBe(false);
  });
  it("compara por proporción entre ediciones distintas", () => {
    // Nota al 53,5 % de 400. Edición de 600: umbral 0.565 → p. 339.
    expect(isRatioReached(338, 600, 0.535)).toBe(false);
    expect(isRatioReached(339, 600, 0.535)).toBe(true);
  });
  it("sin páginas conocidas nunca abre por progreso", () => {
    expect(isRatioReached(500, null, 0.1)).toBe(false);
    expect(isRatioReached(500, 0, 0.1)).toBe(false);
  });
  it("una nota pegada al final solo se abre al terminar", () => {
    expect(isRatioReached(400, 400, 0.99)).toBe(false);
  });
});

describe("unlockPageHint", () => {
  it("redondea hacia arriba la página de apertura", () => {
    expect(unlockPageHint(0.535, 600)).toBe(339);
  });
  it("null si solo se abre al terminar", () => {
    expect(unlockPageHint(0.99, 400)).toBeNull();
    expect(unlockPageHint(0.5, null)).toBeNull();
  });
});
