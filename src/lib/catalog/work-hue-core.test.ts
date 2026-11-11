import { describe, expect, it } from "vitest";
import { hashTitleHue, hueFromPixels } from "./work-hue-core";

function solid(r: number, g: number, b: number, n = 864) {
  const d = new Uint8Array(n * 3);
  for (let i = 0; i < d.length; i += 3) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
  return d;
}

describe("hueFromPixels", () => {
  it("devuelve un tono en la familia del color dominante", () => {
    const red = hueFromPixels(solid(190, 30, 30))!;
    expect(red).toBeGreaterThanOrEqual(15);
    expect(red).toBeLessThanOrEqual(40);
    const blue = hueFromPixels(solid(30, 60, 200))!;
    expect(blue).toBeGreaterThanOrEqual(255);
    expect(blue).toBeLessThanOrEqual(280);
  });
  it("una portada gris, negra o blanca no tiene tono fiable", () => {
    expect(hueFromPixels(solid(128, 128, 128))).toBeNull();
    expect(hueFromPixels(solid(5, 5, 5))).toBeNull();
    expect(hueFromPixels(solid(252, 252, 252))).toBeNull();
  });
  it("muy poco color sobre un fondo gris tampoco cuenta", () => {
    const d = solid(120, 120, 120);
    for (let i = 0; i < 12; i += 3) { d[i] = 200; d[i + 1] = 20; d[i + 2] = 20; }
    expect(hueFromPixels(d)).toBeNull();
  });
  it("gana el tono con más presencia, no el primero", () => {
    const d = solid(30, 60, 200);
    for (let i = 0; i < 300; i += 3) { d[i] = 190; d[i + 1] = 30; d[i + 2] = 30; }
    expect(hueFromPixels(d)!).toBeGreaterThanOrEqual(255);
  });
});

describe("hashTitleHue", () => {
  it("es estable y está en 0–359", () => {
    expect(hashTitleHue("Tress")).toBe(hashTitleHue("Tress"));
    for (const t of ["Tress", "", "חוק ומסג", "Dune"]) {
      const h = hashTitleHue(t);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
      expect(Number.isInteger(h)).toBe(true);
    }
  });
  it("ignora mayúsculas y espacios de los extremos", () => {
    expect(hashTitleHue(" dune ")).toBe(hashTitleHue("Dune"));
  });
  it("títulos distintos reparten tonos distintos", () => {
    const hues = new Set(["Dune", "Tress", "Rayuela", "Elantris", "Mitosis"].map(hashTitleHue));
    expect(hues.size).toBeGreaterThan(3);
  });
});
