import { describe, expect, it } from "vitest";
import { clampPage, readProgress } from "./page-stepper";

describe("clampPage", () => {
  it("no baja de cero", () => {
    expect(clampPage(-5, 300)).toBe(0);
  });

  it("no pasa del total de la edición", () => {
    expect(clampPage(400, 300)).toBe(300);
  });

  it("deja pasar cualquier valor si no se conoce el total", () => {
    expect(clampPage(9000, null)).toBe(9000);
  });

  it("redondea a entero", () => {
    expect(clampPage(12.7, 300)).toBe(12);
  });
});

describe("readProgress", () => {
  it("calcula delta y restante", () => {
    const r = readProgress(180, 240, 662);
    expect(r.delta).toBe(60);
    expect(r.remaining).toBe(422);
  });

  it("reparte el rail entre lo ya leido y este tramo", () => {
    const r = readProgress(180, 240, 600);
    expect(r.readPct).toBeCloseTo(30);
    expect(r.sessionPct).toBeCloseTo(10);
  });

  // Una sesión de solo tiempo es válida: no se ha tocado la página.
  it("sin pagina final no hay delta", () => {
    const r = readProgress(180, null, 662);
    expect(r.delta).toBeNull();
    expect(r.remaining).toBeNull();
    expect(r.sessionPct).toBe(0);
  });

  // Corregir a la baja es legítimo (te habías pasado apuntando).
  it("admite delta negativo sin romper el rail", () => {
    const r = readProgress(240, 180, 600);
    expect(r.delta).toBe(-60);
    expect(r.sessionPct).toBe(0);
  });

  it("sin total no hay porcentajes ni restante", () => {
    const r = readProgress(180, 240, null);
    expect(r.delta).toBe(60);
    expect(r.remaining).toBeNull();
    expect(r.readPct).toBe(0);
  });
});
