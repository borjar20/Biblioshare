import { describe, expect, it, vi } from 'vitest';
import type { Palette, PaintView } from './atlas-palette';
import type { Island, IslandsLayout } from '@/lib/comparisons/atlas/islands';
import type { AtlasPerson } from '@/lib/comparisons/atlas/types';
import { paintIslasBack, type IslandText } from './paint-islas';

const palette: Palette = { fg: 'FG', muted: 'MUTED', line: 'LINE', glow: 'GLOW', cream: 'CREAM', faint: 'FAINT', clash: 'CLASH', font: 'sans',
  type: { book: 'BOOK', movie: 'MOVIE', series: 'SERIES' } };
const people = [{ id: 'a', name: 'Ana Ruiz', color: '#111111' }, { id: 'b', name: 'Beto', color: '#222222' }] as AtlasPerson[];
const island = (over: Partial<Island>): Island => ({ id: 'book', label: null, x: 0, y: 0, r: 100, core: 0, keys: [], common: 0, shared: 0, means: [], ...over });
const words: IslandText = { title: i => `T:${i.id}`, common: n => `${n} en común` };

function paint(islands: Island[], text?: IslandText) {
  const arcs: { r: number; fill: string; stroke: string; dash: number[] }[] = [], dashes: number[][] = [];
  let dash: number[] = [];
  const ctx: Record<string, unknown> & { fillStyle: string; strokeStyle: string } = { fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, fill: () => {},
    setLineDash: (d: number[]) => { dash = d; dashes.push(d); },
    arc(_x: number, _y: number, r: number) { arcs.push({ r, fill: ctx.fillStyle, stroke: ctx.strokeStyle, dash }); },
    stroke: () => {} };
  const spy = vi.fn<PaintView['text']>();
  const layout: IslandsLayout = { mode: 'type', islands, instances: [], extent: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
  paintIslasBack({ ctx: ctx as unknown as CanvasRenderingContext2D, cam: { x: 0, y: 0, k: 1 }, vp: { width: 800, height: 800 }, palette, text: spy }, { layout, people, text });
  return { arcs, dashes, text: spy };
}

describe('paintIslasBack', () => {
  it('tints type islands by type and others with cream', () => {
    const { arcs } = paint([island({ id: 'movie' }), island({ id: 'g:Drama' })]);
    expect(arcs.map(a => a.fill)).toEqual(['MOVIE', 'CREAM']);
  });
  it('writes the title and the common count above the disc', () => {
    const { text } = paint([island({ id: 'book', common: 3 })], words);
    const title = text.mock.calls.find(([v]) => v === 'T:book')!, common = text.mock.calls.find(([v]) => v === '3 en común')!;
    expect(title[2]).toBeLessThan(400 - 100); expect(common[2]).toBeLessThan(400 - 100);
    expect(common[4]).toBe('GLOW');
  });
  it('draws the dashed gold ring only when there is a common core', () => {
    const none = paint([island({ core: 0 })], words);
    expect(none.arcs).toHaveLength(1); expect(none.dashes).toEqual([]);
    const some = paint([island({ core: 40 })], words);
    expect(some.arcs).toHaveLength(2);
    expect(some.arcs[1]).toMatchObject({ r: 40, stroke: 'GLOW', dash: [3, 5] });
  });
  it('puts a dot with the initials of each known face mean on the strip, spaced by the mean', () => {
    const { arcs, text } = paint([island({ means: [{ userId: 'a', mean: 2 }, { userId: 'b', mean: 9 }, { userId: 'ghost', mean: 5 }] })], words);
    expect(arcs.slice(1).map(d => d.fill)).toEqual(['#111111', '#222222']);
    const ax = text.mock.calls.find(([v]) => v === 'AR')![1], bx = text.mock.calls.find(([v]) => v === 'B')![1];
    expect(bx - ax).toBeCloseTo(7 / 9 * 120);
  });
  it('without texts draws only the discs', () => {
    const { text } = paint([island({ core: 10, means: [{ userId: 'a', mean: 5 }] })]);
    expect(text).not.toHaveBeenCalled();
  });
});
