import { describe, expect, it } from 'vitest';
import { approach, fit, MAX_ZOOM, MIN_ZOOM, panBy, stepCamera, toScreen, toWorld, zoomAt, zoomToward } from './camera';
import { nearest } from './hit';

const vp = { width: 800, height: 600 };
const cam = { x: 120, y: -40, k: 0.7 };

describe('cámara', () => {
  it('toWorld deshace toScreen', () => {
    const p = { x: 333, y: -77 };
    const back = toWorld(cam, vp, toScreen(cam, vp, p));
    expect(back.x).toBeCloseTo(p.x); expect(back.y).toBeCloseTo(p.y);
  });
  it('zoomAt deja fijo el punto bajo el cursor y respeta los límites', () => {
    const s = { x: 610, y: 120 };
    const before = toWorld(cam, vp, s); const next = zoomAt(cam, vp, s, 2.5);
    const after = toWorld(next, vp, s);
    expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y);
    expect(zoomAt(cam, vp, s, 1e6).k).toBe(MAX_ZOOM); expect(zoomAt(cam, vp, s, 1e-6).k).toBe(MIN_ZOOM);
  });
  it('panBy mueve la cámara en sentido contrario al arrastre, en unidades de mundo', () => {
    expect(panBy(cam, 70, -14)).toEqual({ x: 20, y: -20, k: 0.7 });
  });
  it('fit centra la extensión y la hace caber con el margen', () => {
    const extent = { minX: -1000, minY: -500, maxX: 1000, maxY: 700 };
    const c = fit(extent, vp, { x: 0, y: 150 });
    expect(c.x).toBe(0); expect(c.y).toBe(100);
    expect(c.k).toBeCloseTo(Math.min(800 / 2000, 450 / 1200));
    const tl = toScreen(c, vp, { x: extent.minX, y: extent.minY });
    expect(tl.x).toBeGreaterThanOrEqual(-0.001);
  });
  it('fit con un eje casi sin hueco encaja por el otro eje en vez de hundirse al zoom mínimo', () => {
    const extent = { minX: -500, minY: -300, maxX: 500, maxY: 300 };
    const short = { width: 400, height: 200 };
    const flat = fit(extent, short, { x: 32, y: 224 });
    expect(Number.isFinite(flat.k)).toBe(true);
    expect(flat.k).toBeCloseTo((400 - 32) / 1000);
    expect(flat.k).toBeGreaterThan(MIN_ZOOM);
    // Hueco vertical por debajo del 40 %: tampoco manda ese eje.
    expect(fit(extent, { width: 800, height: 600 }, { x: 32, y: 400 }).k).toBeCloseTo((800 - 32) / 1000);
  });
  it('zoomToward centra el punto tocado y multiplica el zoom con tope', () => {
    const next = zoomToward(cam, vp, { x: 400, y: 300 }, 2.6);
    expect(next).toEqual({ x: 120, y: -40, k: 0.7 * 2.6 });
    expect(zoomToward({ ...cam, k: 10 }, vp, { x: 400, y: 300 }, 2.6).k).toBe(14);
  });
  it('stepCamera converge y termina exactamente en el objetivo', () => {
    let current = cam; const target = { x: 0, y: 0, k: 2 }; let done = false; let steps = 0;
    while (!done && steps < 500) { ({ camera: current, done } = stepCamera(current, target, 0.16)); steps++; }
    expect(done).toBe(true); expect(current).toEqual(target);
    expect(stepCamera(cam, target, 1)).toEqual({ camera: target, done: true });
  });
  it('approach interpola y se asienta en el objetivo', () => {
    expect(approach(0, 10, 0.1, 0.3)).toEqual({ value: 1, settled: false });
    expect(approach(9.8, 10, 0.1, 0.3)).toEqual({ value: 10, settled: true });
  });
});

describe('nearest', () => {
  it('devuelve el más cercano dentro del radio, o null', () => {
    const items = [{ x: 0, y: 0, id: 'a' }, { x: 5, y: 0, id: 'b' }];
    expect(nearest(items, { x: 4, y: 0 }, 3)?.id).toBe('b');
    expect(nearest(items, { x: 40, y: 0 }, 3)).toBeNull();
  });
});
