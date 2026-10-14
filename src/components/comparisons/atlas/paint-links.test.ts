import { describe, expect, it, vi } from 'vitest';
import type { Palette } from './atlas-palette';
import { paintLinks } from './paint-links';

const palette: Palette = { fg: 'FG', muted: 'MUTED', line: 'LINE', glow: 'GLOW', cream: 'CREAM', faint: 'FAINT', clash: 'CLASH', font: 'sans',
  type: { book: 'BOOK', movie: 'MOVIE', series: 'SERIES' } };
type Point = { x: number; y: number; a: number };

function paint(links: string[][], points: Record<string, Point>, glowing: string[] = []) {
  const strokes: { style: string; alpha: number; width: number }[] = [];
  const ctx = { strokeStyle: '', lineWidth: 1, globalAlpha: 1, beginPath: vi.fn(), moveTo: vi.fn(), bezierCurveTo: vi.fn(),
    stroke() { strokes.push({ style: ctx.strokeStyle as string, alpha: ctx.globalAlpha, width: ctx.lineWidth }); } };
  paintLinks({ ctx: ctx as unknown as CanvasRenderingContext2D, cam: { x: 0, y: 0, k: 1 }, vp: { width: 800, height: 600 }, palette, text: vi.fn() },
    links, id => points[id] ?? null, id => glowing.includes(id));
  return { strokes, ctx };
}

describe('paintLinks', () => {
  it('no dibuja un hilo con menos de dos apariciones visibles', () => {
    const { strokes, ctx } = paint([['a', 'a@b'], ['c', 'c@b']], { a: { x: 0, y: 0, a: 1 }, 'a@b': { x: 10, y: 50, a: 0.01 }, c: { x: 0, y: 0, a: 1 } });
    expect(strokes).toEqual([]);
    expect(ctx.globalAlpha).toBe(1);
  });
  it('crema y tenue (mínima alfa × 0.18) sin brillo; dorado y más fuerte (× 0.55) con brillo', () => {
    const points = { a: { x: 0, y: 0, a: 0.8 }, 'a@b': { x: 10, y: 50, a: 0.5 }, g: { x: 0, y: 0, a: 1 }, 'g@b': { x: 10, y: 50, a: 1 } };
    const { strokes, ctx } = paint([['a', 'a@b'], ['g', 'g@b']], points, ['g']);
    expect(strokes[0]).toEqual({ style: 'CREAM', alpha: expect.closeTo(0.5 * 0.18), width: 1 });
    expect(strokes[1]).toEqual({ style: 'GLOW', alpha: expect.closeTo(0.55), width: 1.6 });
    expect(ctx.bezierCurveTo).toHaveBeenCalledTimes(2);
    expect(ctx.globalAlpha).toBe(1);
  });
  it('los hilos crema asentados van en un solo trazo con alfa 0.18; los que están en transición, aparte', () => {
    const points = { a: { x: 0, y: 0, a: 1 }, 'a@b': { x: 10, y: 50, a: 0.99 }, c: { x: 20, y: 0, a: 1 }, 'c@b': { x: 30, y: 50, a: 1 },
      t: { x: 40, y: 0, a: 1 }, 't@b': { x: 50, y: 50, a: 0.6 } };
    const { strokes, ctx } = paint([['a', 'a@b'], ['c', 'c@b'], ['t', 't@b']], points);
    expect(strokes).toEqual([{ style: 'CREAM', alpha: expect.closeTo(0.18), width: 1 }, { style: 'CREAM', alpha: expect.closeTo(0.6 * 0.18), width: 1 }]);
    expect(ctx.beginPath).toHaveBeenCalledTimes(2);
    expect(ctx.moveTo).toHaveBeenCalledTimes(3);
    expect(ctx.bezierCurveTo).toHaveBeenCalledTimes(3);
  });
  it('descarta los hilos cuya caja de pantalla queda entera fuera (margen de 80 px)', () => {
    // Camera at the origin, viewport 800×600: world (0,0) is screen (400,300); the screen spans world x -400…400, y -300…300.
    const points = {
      out: { x: -490, y: 0, a: 1 }, 'out@b': { x: -485, y: 100, a: 1 },       // screen x −90…−85: outside the 80 px margin
      edge: { x: -470, y: 0, a: 1 }, 'edge@b': { x: -470, y: 100, a: 1 },    // screen x −70: inside the margin
      cross: { x: -900, y: 0, a: 1 }, 'cross@b': { x: 900, y: 0, a: 1 },     // both ends off screen, the thread crosses it
      below: { x: 0, y: 390, a: 1 }, 'below@b': { x: 50, y: 500, a: 1 },     // screen y 690…800: under the bottom margin
    };
    const { ctx } = paint([['out', 'out@b'], ['edge', 'edge@b'], ['cross', 'cross@b'], ['below', 'below@b']], points);
    expect(ctx.moveTo.mock.calls).toEqual([[-70, 300], [-500, 300]]);
  });
});
