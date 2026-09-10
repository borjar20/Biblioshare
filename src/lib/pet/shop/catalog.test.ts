import { statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACORN_EPOCH, ACORN_RATES, CAMP_SCENES, DEFAULT_SCENE_ID, isCampSceneId, scenePrice } from "./catalog";

describe("catálogo de la tienda", () => {
  it("tiene la escena de siempre gratis y cuatro de pago", () => {
    expect(CAMP_SCENES[0].id).toBe(DEFAULT_SCENE_ID);
    expect(scenePrice(DEFAULT_SCENE_ID)).toBe(0);
    expect(CAMP_SCENES.filter(scene => scene.price > 0)).toHaveLength(4);
    // Fija los precios exactos en orden: camp, creek, autumn, night, snow
    expect(CAMP_SCENES.map(s => [s.id, s.price])).toEqual([
      ["camp", 0],
      ["creek", 100],
      ["autumn", 150],
      ["night", 150],
      ["snow", 150],
    ]);
  });
  it("cuesta una semana de uso normal llegar al primero", () => {
    // ~90 bellotas/semana con la calibración de la spec §3.
    const semana = ACORN_RATES.day * 4 + ACORN_RATES.mission * 6 + ACORN_RATES.achievement;
    expect(semana).toBeGreaterThanOrEqual(90);
    expect(scenePrice("creek")).toBeLessThanOrEqual(semana + ACORN_RATES.welcome);
  });
  it("no acepta ids inventados", () => {
    expect(isCampSceneId("creek")).toBe(true);
    expect(isCampSceneId("../../etc/passwd")).toBe(false);
    expect(() => scenePrice("no-existe")).toThrow();
  });
  it("fija la época en una fecha ISO", () => {
    expect(ACORN_EPOCH).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  // Un `file` que no existe en disco no rompe nada en test ni en build: sale en
  // producción como un rectángulo verde vacío detrás de la ardilla. Y cada
  // escena declara su tamaño NATIVO, del que depende la escala entera del CSS.
  it("cada escena del catálogo existe en disco", () => {
    for (const scene of CAMP_SCENES) {
      const stat = statSync(new URL(`../../../../public/pet/scenes/${scene.file}`, import.meta.url));
      expect(stat.size, `${scene.id} → ${scene.file}`).toBeGreaterThan(0);
    }
  });
  it("no reutiliza el mismo fichero en dos escenas", () => {
    // Mientras faltó el arte, las cuatro de pago apuntaban a `camp-portrait.webp`.
    expect(new Set(CAMP_SCENES.map(scene => scene.file)).size).toBe(CAMP_SCENES.length);
  });
});
