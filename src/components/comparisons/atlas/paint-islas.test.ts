import { describe, expect, it, vi } from 'vitest';
import type { Palette, PaintView } from './atlas-palette';
import type { Island, IslandsLayout } from '@/lib/comparisons/atlas/islands';
import type { AtlasPerson } from '@/lib/comparisons/atlas/types';
import { paintIslasBack, type IslandText } from './paint-islas';

const palette: Palette = { fg: 'FG', muted: 'MUTED', line: 'LINE', glow: 'GLOW', cream: 'CREAM', faint: 'FAINT', clash: 'CLASH', font: 'sans',
  type: { book: 'BOOK', movie: 'MOVIE', series: 'SERIES' } };
const people = [{ id: 'a', name: 'Ana Ruiz', color: '#111111' }, { id: 'b', name: 'Beto', color: '#222222' }, { id: 'c', name: 'Cora', color: '#333333' }] as AtlasPerson[];
const island = (over: Partial<Island>): Island => ({ id: 'book', label: null, x: 0, y: 0, r: 100, core: 0, keys: [], common: 0, shared: 0, means: [], ...over });
const words: IslandText = { title: i => `T:${i.id}`, common: n => `${n} en común` };

function paint(islands: Island[], text?: IslandText) {
  const arcs: { x: number; y: number; r: number; fill: string; stroke: string; dash: number[] }[] = [], dashes: number[][] = [];
  let dash: number[] = [];
  const ctx: Record<string, unknown> & { fillStyle: string; strokeStyle: string } = { fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, fill: () => {},
    setLineDash: (d: number[]) => { dash = d; dashes.push(d); },
    arc(x: number, y: number, r: number) { arcs.push({ x, y, r, fill: ctx.fillStyle, stroke: ctx.strokeStyle, dash }); },
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
  it('stacks faces with the same mean upwards and lifts the texts above the stack', () => {
    const { arcs, text } = paint([island({ means: [{ userId: 'a', mean: 9 }, { userId: 'b', mean: 9.04 }, { userId: 'c', mean: 9 }] })], words);
    const dots = arcs.slice(1);
    expect(new Set(dots.map(d => d.x)).size).toBe(1);
    expect(dots.map(d => d.y)).toEqual([dots[0].y, dots[0].y - 14, dots[0].y - 28]);
    const top = Math.min(...dots.map(d => d.y)) - 7;
    const common = text.mock.calls.find(([v]) => v === '0 en común')!, title = text.mock.calls.find(([v]) => v === 'T:book')!;
    expect(common[2]).toBeLessThanOrEqual(top - 4);
    expect(title[2]).toBeLessThan(common[2] - 13);
  });
  it('also stacks close means whose dots would touch (8.9 and 9)', () => {
    const { arcs } = paint([island({ means: [{ userId: 'a', mean: 8.875 }, { userId: 'b', mean: 9 }] })], words);
    expect(arcs[2].y).toBe(arcs[1].y - 14);
  });
  it('a stack is at most 4 high: the 4th dot and up fold into «+n»', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `P${i} Q`, color: `#00000${i}` })) as AtlasPerson[];
    const means = many.map(p => ({ userId: p.id, mean: 9 }));
    const arcs: { y: number; fill: string }[] = [];
    const ctx = { fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, beginPath() {}, moveTo() {}, lineTo() {}, fill() {}, stroke() {}, setLineDash() {},
      arc(_x: number, y: number) { arcs.push({ y, fill: ctx.fillStyle }); } };
    const spy = vi.fn<PaintView['text']>();
    const layout: IslandsLayout = { mode: 'type', islands: [island({ means })], instances: [], extent: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
    paintIslasBack({ ctx: ctx as unknown as CanvasRenderingContext2D, cam: { x: 0, y: 0, k: 1 }, vp: { width: 800, height: 800 }, palette, text: spy }, { layout, people: many, text: words });
    const dots = arcs.slice(1);
    expect(dots).toHaveLength(4);
    expect(dots.at(-1)!.fill).toBe('MUTED');
    expect(spy.mock.calls.some(([v]) => v === '+7')).toBe(true);
    expect(Math.max(...dots.map(d => d.y)) - Math.min(...dots.map(d => d.y))).toBe(42);
  });
  it('keeps different means on the strip line', () => {
    const { arcs } = paint([island({ means: [{ userId: 'a', mean: 2 }, { userId: 'b', mean: 9 }] })], words);
    expect(arcs[1].y).toBe(arcs[2].y);
  });
});
