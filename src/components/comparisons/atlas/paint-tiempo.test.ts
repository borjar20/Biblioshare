import { describe, expect, it, vi } from 'vitest';
import type { Palette, PaintView } from './atlas-palette';
import type { TiempoLayout } from '@/lib/comparisons/atlas/tiempo';
import type { AtlasPerson } from '@/lib/comparisons/atlas/types';
import { paintTiempoBack } from './paint-tiempo';

const palette: Palette = { fg: 'FG', muted: 'MUTED', line: 'LINE', glow: 'GLOW', cream: 'CREAM', faint: 'FAINT', clash: 'CLASH', font: 'sans',
  type: { book: 'BOOK', movie: 'MOVIE', series: 'SERIES' } };
const people = [{ id: 'a', name: 'Ana Ruiz', color: '#111111' }, { id: 'b', name: 'Beto', color: '#222222' }] as AtlasPerson[];
const layout: TiempoLayout = { lanes: [{ userId: 'a', y: -115 }, { userId: 'b', y: 115 }, { userId: 'ghost', y: 400 }], instances: [],
  startYear: 2020, endYear: 2023, gap: 230, extent: { minX: -500, maxX: 500, minY: -265, maxY: 265 } };
// 10 lanes, compressed to 110 apart (laneGap(10)).
const crowd = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Persona ${i} QA`, color: `#00000${i}` })) as AtlasPerson[];
const crowded: TiempoLayout = { lanes: crowd.map((p, i) => ({ userId: p.id, y: (i - 4.5) * 110 })), instances: [], gap: 110,
  startYear: 2021, endYear: 2027, extent: { minX: -1070, maxX: 870, minY: -645, maxY: 645 } };

function paint(vp = { width: 1200, height: 800 }, cam = { x: 0, y: 0, k: 1 }, data = { layout, people }) {
  const bands: number[] = [];
  const moves: [number, number][] = [], lines: [number, number][] = [], arcs: { x: number; y: number; r: number; fill: string }[] = [], fills: string[] = [];
  const strokes: string[] = [];
  const ctx: Record<string, unknown> & { fillStyle: string; strokeStyle: string } = { fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, beginPath: () => {}, moveTo: (x: number, y: number) => moves.push([x, y]),
    lineTo: (x: number, y: number) => lines.push([x, y]), stroke() { strokes.push(ctx.strokeStyle); }, fillRect(_x: number, _y: number, _w: number, h: number) { fills.push(ctx.fillStyle); bands.push(h); },
    arc(x: number, y: number, r: number) { arcs.push({ x, y, r, fill: ctx.fillStyle }); }, fill: () => {},
    font: '', measureText: (value: string) => ({ width: value.length * 7 }) };
  const text = vi.fn<PaintView['text']>();
  paintTiempoBack({ ctx: ctx as unknown as CanvasRenderingContext2D, cam, vp, palette, text }, data);
  return { moves, lines, arcs, fills, strokes, text, bands };
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
  it('keeps the last year and a long name inside a narrow screen', () => {
    // 3 years at k = 0.2 span 162 px; a 200 px screen leaves the 2023 label (28 px) no room on the right.
    const { moves, text } = paint({ width: 200, height: 800 }, { x: 0, y: 0, k: 0.2 });
    expect(moves).toHaveLength(4);
    expect(text.mock.calls.filter(([v]) => /^\d{4}$/.test(v)).map(([v]) => v)).toEqual(['2020', '2021', '2022']);
    const first = text.mock.calls.find(([v]) => v === '2020')!;
    expect(first[1]).toBeGreaterThan(moves[0][0]);
    // «Ana Ruiz» is 56 px wide: its centre must be at least 28 + 4 px from the left edge.
    const name = text.mock.calls.find(([v]) => v === 'Ana Ruiz')!;
    expect(name[1] - 28).toBeGreaterThanOrEqual(4);
  });
  it.each([['escritorio', { width: 1280, height: 800 }, 0.4], ['móvil', { width: 412, height: 800 }, 0.21]] as const)(
    'with 10 compressed lanes (%s) avatars and names stay in their own lane', (_, vp, k) => {
      const { arcs, bands, text } = paint(vp, { x: -100, y: 0, k }, { layout: crowded, people: crowd });
      const pitch = 110 * k;
      bands.forEach(h => expect(h).toBeCloseTo(170 * k * 110 / 230));
      expect(arcs).toHaveLength(10);
      arcs.forEach((a, i) => {
        // Avatars never touch the next one.
        if (i) expect(a.y - arcs[i - 1].y - a.r - arcs[i - 1].r).toBeGreaterThanOrEqual(2);
        const [, nx, ny, , , align] = text.mock.calls.find(([v]) => v === crowd[i].name)!;
        // The name sits above the next lane's avatar and below the previous lane's one.
        expect(ny).toBeLessThanOrEqual(a.y + pitch - a.r - 2);
        expect(ny - 10).toBeGreaterThanOrEqual(a.y - pitch + a.r);
        // Beside the avatar it does not cover it, and it stays on screen.
        if (align === 'left') { expect(nx).toBeGreaterThan(a.x + a.r); expect(nx + 7 * crowd[i].name.length).toBeLessThanOrEqual(vp.width); }
        if (align === 'right') { expect(nx).toBeLessThan(a.x - a.r); expect(nx - 7 * crowd[i].name.length).toBeGreaterThanOrEqual(0); }
      });
      // One placement for every lane, so the names read as a column.
      expect(new Set(crowd.map(p => text.mock.calls.find(([v]) => v === p.name)![5])).size).toBe(1);
    });
  it('on a tall screen with 10 full-gap lanes, the name goes under a smaller avatar, clear of the next lane', () => {
    const full = { ...crowded, gap: 230, lanes: crowded.lanes.map((l, i) => ({ ...l, y: (i - 4.5) * 230 })) };
    const k = 0.2, pitch = 230 * k;
    const { arcs, text } = paint({ width: 412, height: 800 }, { x: -100, y: 0, k }, { layout: full, people: crowd });
    arcs.forEach((a, i) => {
      const [, , ny, , , align] = text.mock.calls.find(([v]) => v === crowd[i].name)!;
      expect(align).toBe('center');
      expect(a.r).toBeGreaterThanOrEqual(10);
      expect(ny + 4).toBeLessThanOrEqual(a.y + pitch - a.r);
    });
  });
});
