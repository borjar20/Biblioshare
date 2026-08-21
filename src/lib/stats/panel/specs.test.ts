import { describe, it, expect } from "vitest";
import { buildStatsSections } from "./specs";
import { statsInput as input } from "./__fixtures__/stats-input";

/** Todos los paneles del muro, sin importar en qué sección caen. */
function allPanels() {
  return buildStatsSections(input()).flatMap((s) => s.panels);
}

/**
 * Invariantes del muro que no viven en ningún componente: se cumplen o no en la
 * forma de las secciones que `buildStatsSections` devuelve.
 *
 * Ojo con la tentación de escribir SOLO los invariantes negativos («como mucho
 * uno», «va primero»): sin datos, `buildStatsSections` devuelve secciones sin
 * paneles y esas dos afirmaciones se cumplen en vacío. Por eso hay un test que
 * afirma que un panel CONCRETO es el héroe, y otro que la fixture trae paneles
 * de verdad — vitest no typechequea, así que `spec.hero` sería `undefined` sin
 * que ninguna aserción se entere.
 */
describe("panel héroe", () => {
  it("el calendario anual preside «Actividad»: 53 semanas no caben en un tercio de tarjeta", () => {
    const seccion = buildStatsSections(input()).find((s) => s.id === "actividad");
    expect(seccion?.panels.find((p) => p.id === "calendario-anual")?.hero).toBe(true);
  });

  it("el ancho se reserva para lo que no cabe: la evolución de la pila NO es héroe", () => {
    // Doce puntos de línea se leen bien en un tercio de tarjeta. Y ser héroe
    // obliga a ir primero, lo que rompería el orden que promete la descripción
    // de «Biblioteca y estados».
    expect(allPanels().find((p) => p.id === "backlog")?.hero).toBeUndefined();
  });

  it("como mucho un héroe por sección", () => {
    for (const section of buildStatsSections(input())) {
      const heroes = section.panels.filter((p) => p.hero);
      expect(heroes.length, `sección ${section.id}`).toBeLessThanOrEqual(1);
    }
  });

  it("el héroe, si lo hay, es el primer panel de su sección", () => {
    for (const section of buildStatsSections(input())) {
      const i = section.panels.findIndex((p) => p.hero);
      if (i !== -1) expect(i, `sección ${section.id}`).toBe(0);
    }
  });

  it("la fixture no está vacía: si lo estuviera, los invariantes se cumplirían en vacío", () => {
    const sections = buildStatsSections(input());
    expect(sections.length).toBeGreaterThan(3);
    expect(sections.flatMap((s) => s.panels).length).toBeGreaterThan(10);
  });
});

describe("la forma sale de lo que mide el panel", () => {
  it("horas por mes es un área, no barras: es una serie temporal continua", () => {
    expect(allPanels().find((p) => p.id === "horas-por-mes")?.viz).toBe("area");
  });
});
