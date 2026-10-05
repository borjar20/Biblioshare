import { describe, expect, it } from "vitest";
import type { FeedEpisode } from "@/lib/social/feed";
import { curveGeometry } from "./curve-geometry";

const ep = (episode: number, rating: number | null, season = 1): FeedEpisode => ({ season, episode, title: null, rating });
const opts = { width: 320, height: 120, labels: true };

describe("curveGeometry", () => {
  it("eje 1-5 siempre, de abajo arriba", () => {
    const g = curveGeometry([ep(1, 8), ep(2, 6), ep(3, 7), ep(4, 9)], { ...opts, labels: false });
    expect(g.ticks.map((t) => t.value)).toEqual([1, 2, 3, 4, 5]);
    expect(g.ticks[0].y).toBeGreaterThan(g.ticks[4].y);
  });

  it("un punto por episodio, de izquierda a derecha; la nota 10 arriba del todo", () => {
    const g = curveGeometry([ep(1, 10), ep(2, 2), ep(3, 6), ep(4, 4)], opts);
    expect(g.points).toHaveLength(4);
    expect(g.points[0].x).toBeLessThan(g.points[3].x);
    expect(g.points[0].y).toBeCloseTo(g.ticks[4].y);
    expect(g.points[1].y).toBeCloseTo(g.ticks[0].y);
  });

  it("sin nota: punto hueco en la base y el tramo que lo salta, discontinuo", () => {
    const g = curveGeometry([ep(1, 8), ep(2, null), ep(3, 6), ep(4, 7)], opts);
    expect(g.points[1].rated).toBe(false);
    expect(g.points[1].y).toBe(g.plotBottom);
    expect(g.segments.map((s) => s.dashed)).toEqual([true, false]);
  });

  it("mejor episodio marcado (con la regla de empates)", () => {
    const g = curveGeometry([ep(1, 8), ep(2, 10), ep(3, 6), ep(4, 10)], opts);
    expect(g.points.map((p) => p.best)).toEqual([false, true, false, true]);
  });

  it("separador al cambiar de temporada, entre los dos puntos", () => {
    const g = curveGeometry([ep(25, 8, 1), ep(26, 7, 1), ep(1, 6, 2), ep(2, 9, 2)], opts);
    expect(g.seasonBreaks).toHaveLength(1);
    expect(g.seasonBreaks[0].season).toBe(2);
    expect(g.seasonBreaks[0].x).toBeGreaterThan(g.points[1].x);
    expect(g.seasonBreaks[0].x).toBeLessThan(g.points[2].x);
  });

  it("relleno solo con 2 o más notas", () => {
    expect(curveGeometry([ep(1, 8), ep(2, 7), ep(3, 6), ep(4, 5)], opts).area).toMatch(/^M.*Z$/);
    expect(curveGeometry([ep(1, 8), ep(2, null), ep(3, null), ep(4, null)], opts).area).toBeNull();
  });

  it("con etiquetas deja más margen arriba y abajo", () => {
    const eps = [ep(1, 8), ep(2, 7), ep(3, 6), ep(4, 5)];
    const a = curveGeometry(eps, { ...opts, labels: true });
    const b = curveGeometry(eps, { ...opts, labels: false });
    expect(a.plotTop).toBeGreaterThan(b.plotTop);
    expect(a.plotBottom).toBeLessThan(b.plotBottom);
  });

  it("deja sitio para el rótulo de temporada y las notas sin recortarse", () => {
    const eps = [ep(1, 10), ep(2, 7), ep(3, 6), ep(4, 5)];
    const a = curveGeometry(eps, { ...opts, labels: true });
    const b = curveGeometry(eps, { ...opts, labels: false });
    expect(a.plotTop - 9).toBeGreaterThan(12);
    expect(b.plotTop).toBeGreaterThanOrEqual(16);
  });
});
