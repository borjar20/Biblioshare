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

  it("ningún panel se queda en `ranking`: una lista de texto no es un gráfico", () => {
    // Eran SIETE en ejecución (`ratedGroupPanel` se llama tres veces) y tres de
    // ellos iban seguidos en la misma sección. Esa fila de listas idénticas era
    // la mitad de la repetición que se veía en el muro.
    expect(allPanels().filter((p) => p.viz === "ranking")).toHaveLength(0);
  });

  it("los siete rankings son lollipop", () => {
    const ids = [
      "nota-generos",
      "nota-autores",
      "nota-directores",
      "directores",
      "editoriales",
      "mejor-valoradas",
      "autores",
    ];
    const lollipops = allPanels().filter((p) => p.viz === "lollipop");
    expect(lollipops.map((p) => p.id).sort()).toEqual([...ids].sort());
  });

  it("ningún reparto se queda en anillo: el principio 3 prohíbe medir un ángulo", () => {
    // `donut` sigue en `PanelViz` como referencia del arco, pero sin consumidor.
    expect(allPanels().filter((p) => p.viz === "donut")).toHaveLength(0);
    const waffles = allPanels().filter((p) => p.viz === "waffle");
    expect(waffles.map((p) => p.id).sort()).toEqual(["estados", "pila", "por-tipo"]);
  });

  it("todo waffle trae `series`: sin ellas la leyenda pierde el nombre, y ahí vive su dato", () => {
    for (const p of allPanels().filter((x) => x.viz === "waffle")) {
      expect(p.series?.length, `panel ${p.id}`).toBeGreaterThan(0);
    }
  });

  it("la racha se dibuja contra tu mejor marca, no como tres cifras sueltas", () => {
    const racha = allPanels().find((p) => p.id === "racha");
    expect(racha?.viz).toBe("bullet");
    // La marca es la mejor racha; sin ella no se dibuja ninguna.
    expect(racha?.data[0]?.target).toBe(27);
  });

  it("sin mejor racha todavía, el bullet no inventa una marca en cero", () => {
    const sinRacha = input({ streaks: { current: 0, best: 0, activeDays: 0 } });
    const racha = buildStatsSections(sinRacha)
      .flatMap((s) => s.panels)
      .find((p) => p.id === "racha");
    expect(racha?.data[0]?.target).toBeUndefined();
  });

  it("los tres rankings de nota NO van seguidos: en fila se leen como una repetición", () => {
    // Son el mismo panel tres veces: mismo título, misma forma, misma frase de
    // vacío. Intercalados entre paneles de otra forma, cada uno se lee por lo
    // que dice. Colapsarlos en uno choca con «nunca hay un filtro por panel».
    const NOTA = ["nota-generos", "nota-autores", "nota-directores"];
    for (const section of buildStatsSections(input())) {
      const ids = section.panels.map((p) => p.id);
      for (let i = 0; i < ids.length - 1; i++) {
        const seguidos = NOTA.includes(ids[i]) && NOTA.includes(ids[i + 1]);
        expect(seguidos, `${ids[i]} justo antes de ${ids[i + 1]}`).toBe(false);
      }
    }
  });

  it("más de la mitad del muro DIBUJA: era el problema de partida", () => {
    const TEXTO = ["kpi", "ranking", "table"];
    const panels = allPanels();
    const dibujan = panels.filter((p) => !TEXTO.includes(p.viz));
    expect(dibujan.length).toBeGreaterThan(panels.length / 2);
  });
});
