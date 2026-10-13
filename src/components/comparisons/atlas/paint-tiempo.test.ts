import { describe, expect, it, vi } from 'vitest';
import type { Palette, PaintView } from './atlas-palette';
import type { TiempoLayout } from '@/lib/comparisons/atlas/tiempo';
import type { AtlasPerson } from '@/lib/comparisons/atlas/types';
import { paintTiempoBack } from './paint-tiempo';

const palette: Palette = { fg: 'FG', muted: 'MUTED', line: 'LINE', glow: 'GLOW', cream: 'CREAM', faint: 'FAINT', clash: 'CLASH', font: 'sans',
  type: { book: 'BOOK', movie: 'MOVIE', series: 'SERIES' } };
const people = [{ id: 'a', name: 'Ana Ruiz', color: '#111111' }, { id: 'b', name: 'Beto', color: '#222222' }] as AtlasPerson[];
const layout: TiempoLayout = { lanes: [{ userId: 'a', y: -115 }, { userId: 'b', y: 115 }, { userId: 'ghost', y: 400 }], instances: [],
  startYear: 2020, endYear: 2023, extent: { minX: -500, maxX: 500, minY: -265, maxY: 265 } };

function paint() {
  const moves: [number, number][] = [], lines: [number, number][] = [], arcs: { x: number; r: number; fill: string }[] = [], fills: string[] = [];
  const strokes: string[] = [];
  const ctx: Record<string, unknown> & { fillStyle: string; strokeStyle: string } = { fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, beginPath: () => {}, moveTo: (x: number, y: number) => moves.push([x, y]),
    lineTo: (x: number, y: number) => lines.push([x, y]), stroke() { strokes.push(ctx.strokeStyle); }, fillRect() { fills.push(ctx.fillStyle); },
    arc(x: number, _y: number, r: number) { arcs.push({ x, r, fill: ctx.fillStyle }); }, fill: () => {} };
  const text = vi.fn<PaintView['text']>();
  paintTiempoBack({ ctx: ctx as unknown as CanvasRenderingContext2D, cam: { x: 0, y: 0, k: 1 }, vp: { width: 1200, height: 800 }, palette, text }, { layout, people });
  return { moves, lines, arcs, fills, strokes, text };
}

describe('paintTiempoBack', () => {
  it('draws one vertical line and one label per whole year, both ends included', () => {
    const { moves, lines, strokes, text } = paint();
    expect(moves).toHaveLength(4);
    moves.forEach(([x, y], i) => { expect(lines[i][0]).toBe(x); expect(lines[i][1]).not.toBe(y); });
    expect(strokes).toEqual(Array(4).fill('LINE'));
    const xs = moves.map(([x]) => x);
    expect(xs[1] - xs[0]).toBeCloseTo(270);
    const years = text.mock.calls.filter(([v]) => /^\d{4}$/.test(v));
    expect(years.map(([v]) => v)).toEqual(['2020', '2021', '2022', '2023']);
    years.forEach(([, x], i) => expect(x).toBeGreaterThan(xs[i]));
  });
  it('gives each known lane an avatar with initials and the name, and skips unknown people', () => {
    const { arcs, fills, text } = paint();
    expect(arcs.map(a => a.fill)).toEqual(['#111111', '#222222']);
    expect(fills).toEqual(['#111111', '#222222']);
    const [, ix, , , ic] = text.mock.calls.find(([v]) => v === 'AR')!;
    expect(ic).toBe('#fff');
    expect(ix).toBe(arcs[0].x);
    expect(text.mock.calls.find(([v]) => v === 'Ana Ruiz')).toBeTruthy();
    expect(text.mock.calls.find(([v]) => v === 'B')).toBeTruthy();
    expect(text.mock.calls.find(([v]) => v === 'Beto')).toBeTruthy();
    expect(text.mock.calls.some(([v]) => v === 'ghost')).toBe(false);
  });
});
