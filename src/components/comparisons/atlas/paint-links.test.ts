import { describe, expect, it, vi } from 'vitest';
import type { Palette } from './atlas-palette';
import { paintLinks } from './paint-links';

const palette: Palette = { fg: 'FG', muted: 'MUTED', line: 'LINE', glow: 'GLOW', cream: 'CREAM', faint: 'FAINT', clash: 'CLASH', font: 'sans',
  type: { book: 'BOOK', movie: 'MOVIE', series: 'SERIES' } };
type Point = { x: number; y: number; a: number };

function paint(links: string[][], points: Record<string, Point>, glowing: string[] = []) {
  const strokes: { style: string; alpha: number; width: number }[] = [];
  const noop = () => {};
  const ctx = { strokeStyle: '', lineWidth: 1, globalAlpha: 1, beginPath: noop, moveTo: noop, bezierCurveTo: vi.fn(),
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
});
