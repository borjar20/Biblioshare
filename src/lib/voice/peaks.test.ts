import { describe, expect, it } from "vitest";
import { condensePeaks, resamplePeaks, sanitizePeaks } from "./peaks";

describe("resamplePeaks", () => {
  it("sin muestras devuelve vacío", () => {
    expect(resamplePeaks([])).toEqual([]);
  });
  it("menos muestras que cubos: devuelve las que hay, escaladas a 0..100", () => {
    expect(resamplePeaks([0, 0.5, 1], 64)).toEqual([0, 50, 100]);
  });
  it("re-muestrea por máximo del cubo y nunca pasa de `count`", () => {
    const samples = Array.from({ length: 640 }, (_, i) => (i % 10 === 3 ? 0.8 : 0.1));
    const out = resamplePeaks(samples, 64);
    expect(out).toHaveLength(64);
    expect(Math.max(...out)).toBe(80);
  });
  it("acota los valores fuera de rango", () => {
    expect(resamplePeaks([-0.5, 1.5], 64)).toEqual([0, 100]);
  });
});

describe("condensePeaks", () => {
  it("con hueco de sobra devuelve los picos tal cual (misma referencia no exigida, mismo contenido sí)", () => {
    expect(condensePeaks([10, 50, 90], 64)).toEqual([10, 50, 90]);
  });
  it("reduce por máximo del cubo SIN reescalar (ya son 0..100)", () => {
    // 8 picos → 4 cubos de 2: gana el máximo de cada par
    expect(condensePeaks([10, 90, 20, 30, 100, 5, 0, 60], 4)).toEqual([90, 30, 100, 60]);
  });
  it("nunca devuelve más de `count` ni menos de 1 con entrada no vacía", () => {
    const sixtyFour = Array.from({ length: 64 }, (_, i) => i);
    expect(condensePeaks(sixtyFour, 16)).toHaveLength(16);
    expect(condensePeaks(sixtyFour, 1)).toEqual([63]);
  });
  it("entrada vacía o count inválido: vacío / tal cual", () => {
    expect(condensePeaks([], 8)).toEqual([]);
    expect(condensePeaks([1, 2], 0)).toEqual([1, 2]);
  });
});

describe("sanitizePeaks", () => {
  it("acepta un array de números y lo redondea/acota", () => {
    expect(sanitizePeaks([0, 33.4, 150, -2])).toEqual([0, 33, 100, 0]);
  });
  it("rechaza lo que no es un array de números finitos o pasa de 64", () => {
    expect(sanitizePeaks("nope")).toBeNull();
    expect(sanitizePeaks([1, "2"])).toBeNull();
    expect(sanitizePeaks([Infinity])).toBeNull();
    expect(sanitizePeaks(Array.from({ length: 65 }, () => 1))).toBeNull();
  });
});
