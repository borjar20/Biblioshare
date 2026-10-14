import { describe, expect, it, vi } from 'vitest';
import type { Palette, PaintView } from './atlas-palette';
import type { Island, IslandsLayout } from '@/lib/comparisons/atlas/islands';
import type { AtlasPerson } from '@/lib/comparisons/atlas/types';
import { islandLabelRoom, paintIslasBack, type IslandText } from './paint-islas';

const palette: Palette = { fg: 'FG', muted: 'MUTED', line: 'LINE', glow: 'GLOW', cream: 'CREAM', faint: 'FAINT', clash: 'CLASH', font: 'sans',
  type: { book: 'BOOK', movie: 'MOVIE', series: 'SERIES' } };
const people = [{ id: 'a', name: 'Ana Ruiz', color: '#111111' }, { id: 'b', name: 'Beto', color: '#222222' }, { id: 'c', name: 'Cora', color: '#333333' }] as AtlasPerson[];
const island = (over: Partial<Island>): Island => ({ id: 'book', label: null, x: 0, y: 0, r: 100, core: 0, keys: [], common: 0, shared: 0, means: [], ...over });
const words: IslandText = { title: i => `T:${i.id}`, common: n => `${n} en común`, ratingValue: mean => mean.toFixed(1).replace('.', ',') };

function paint(islands: Island[], text?: IslandText, faces = people, zoom = 1, framing?: IslandsLayout['framing']) {
  const arcs: { x: number; y: number; r: number; fill: string; stroke: string; dash: number[] }[] = [], dashes: number[][] = [];
  let dash: number[] = [];
  const ctx: Record<string, unknown> & { fillStyle: string; strokeStyle: string } = { fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, fill: () => {},
    setLineDash: (d: number[]) => { dash = d; dashes.push(d); },
    arc(x: number, y: number, r: number) { arcs.push({ x, y, r, fill: ctx.fillStyle, stroke: ctx.strokeStyle, dash }); },
    stroke: () => {}, measureText: (value: string) => ({ width: value.length * 12 }) };
  const spy = vi.fn<PaintView['text']>();
  const layout: IslandsLayout = { mode: 'type', islands, instances: [], extent: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, framing };
  paintIslasBack({ ctx: ctx as unknown as CanvasRenderingContext2D, cam: { x: 0, y: 0, k: zoom }, vp: { width: 800, height: 800 }, palette, text: spy }, { layout, people: faces, text });
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
  it('identifies every known mean with its face, numeric value and an explicit 1–10 scale', () => {
    const { arcs, text } = paint([island({ means: [{ userId: 'a', mean: 2 }, { userId: 'b', mean: 9 }, { userId: 'ghost', mean: 5 }] })], words);
    expect(arcs.filter(a => a.r === 7).map(d => d.fill)).toEqual(['#111111', '#222222']);
    const labels = text.mock.calls.map(([value]) => value);
    expect(labels).toEqual(expect.arrayContaining(['AR', 'B', '2,0', '9,0', '1', '5', '10']));
    expect(labels).not.toContain('5,0');
  });
  it('without texts draws only the discs', () => {
    const { text } = paint([island({ core: 10, means: [{ userId: 'a', mean: 5 }] })]);
    expect(text).not.toHaveBeenCalled();
  });
  it('keeps the title and common count above all numeric badges when means coincide', () => {
    const { arcs, text } = paint([island({ means: [{ userId: 'a', mean: 9 }, { userId: 'b', mean: 9.04 }, { userId: 'c', mean: 9 }] })], words);
    const dots = arcs.filter(a => a.r === 7);
    expect(new Set(dots.map(d => `${d.x}:${d.y}`)).size).toBe(3);
    const top = Math.min(...dots.map(d => d.y)) - 7;
    const common = text.mock.calls.find(([v]) => v === '0 en común')!, title = text.mock.calls.find(([v]) => v === 'T:book')!;
    expect(common[2]).toBeLessThanOrEqual(top - 4);
    expect(title[2]).toBeLessThan(common[2] - 13);
  });
  it('separates close scale markers (8.9 and 9) and preserves both readable decimals', () => {
    const { arcs, text } = paint([island({ means: [{ userId: 'a', mean: 8.9 }, { userId: 'b', mean: 9 }] })], words);
    const marks = arcs.filter(a => a.r < 7);
    expect(marks).toHaveLength(2);
    expect(marks[1].x - marks[0].x).toBeCloseTo(0.1 / 9 * 132);
    expect(marks[1].y).not.toBe(marks[0].y);
    expect(text.mock.calls.map(([value]) => value)).toEqual(expect.arrayContaining(['8,9', '9,0']));
  });
  it('ten coinciding faces keep every numeric value and initial without collapsing into +n', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `P${i} Q`, color: `#00000${i}` })) as AtlasPerson[];
    const means = many.map(p => ({ userId: p.id, mean: 9 }));
    const subject = island({ means });
    const { arcs, text } = paint([subject], words, many);
    const dots = arcs.filter(a => a.r === 7);
    expect(dots).toHaveLength(10);
    expect(text.mock.calls.filter(([v]) => v === '9,0')).toHaveLength(10);
    expect(text.mock.calls.some(([v]) => v.startsWith('+'))).toBe(false);
    expect(new Set(dots.map(d => d.y)).size).toBeLessThanOrEqual(4);
    const common = text.mock.calls.find(([v]) => v === '0 en común')!;
    expect(common[2]).toBeLessThan(Math.min(...dots.map(d => d.y - d.r)) - 4);
    const layout: IslandsLayout = { mode: 'type', islands: [subject], instances: [], extent: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
    const title = text.mock.calls.find(([v]) => v === 'T:book')!;
    expect(islandLabelRoom(layout, many)).toBeCloseTo(300 - title[2] + 20);
    expect(islandLabelRoom(layout, many)).toBeLessThanOrEqual(160);
  });
  it('keeps far apart means on the same scale level', () => {
    const { arcs } = paint([island({ means: [{ userId: 'a', mean: 2 }, { userId: 'b', mean: 9 }] })], words);
    const marks = arcs.filter(a => a.r < 7);
    expect(marks[0].y).toBe(marks[1].y);
  });
  it('does not draw a scale or manufacture values with no qualifying mean', () => {
    const { text } = paint([island({ means: [] })], words);
    expect(text.mock.calls.map(([value]) => value)).toEqual(['T:book', '0 en común']);
  });
  it('limits a long island title to its column without squeezing numeric fonts', () => {
    const { text } = paint([island({})], { ...words, title: () => 'Ciencia ficción y aventuras' });
    const title = text.mock.calls[0];
    expect(title[0]).toMatch(/…$/);
    expect(title[0].length * 12).toBeLessThanOrEqual(148);
    expect(Number(/(\d+)px/.exec(title[3])![1])).toBeLessThanOrEqual(20);
  });
  it('shows readable means again after zooming into an overview whose headers cannot all fit', () => {
    const framing: IslandsLayout['framing'] = { viewport: { width: 800, height: 800 }, insets: { top: 100, bottom: 100 },
      camera: { x: 0, y: 0, k: 0.3 }, ratingZoom: 0.8, summaryZoom: 0.3, titleZoom: 0.1, contentKey: 'same' };
    const subject = island({ means: [{ userId: 'a', mean: 9 }] });
    expect(paint([subject], words, people, 0.3, framing).text.mock.calls.map(([value]) => value)).not.toContain('9,0');
    const close = paint([subject], words, people, 0.8, framing).text.mock.calls;
    expect(close.map(([value]) => value)).toContain('9,0');
    expect(close.find(([value]) => value === '9,0')![3]).toContain('11px');
  });
  it('al alejar limita los títulos a sus columnas comprimidas y los oculta si ya no caben verticalmente', () => {
    const framing: IslandsLayout['framing'] = { viewport: { width: 800, height: 800 }, insets: { top: 100, bottom: 100 },
      camera: { x: 0, y: 0, k: 1 }, ratingZoom: 1, summaryZoom: 1, titleZoom: 0.25, contentKey: 'same' };
    const subjects = [island({ id: 'g:A', x: -80 }), island({ id: 'g:B', x: 80 })];
    const titles = { ...words, title: () => 'Ciencia ficción y aventuras' };
    const away = paint(subjects, titles, people, 0.5, framing).text.mock.calls;
    expect(away).toHaveLength(2);
    for (const [value] of away) expect(value.length * 12).toBeLessThanOrEqual(74);
    expect(paint(subjects, titles, people, 0.1, framing).text).not.toHaveBeenCalled();
  });
});
