import { describe, expect, it, vi } from 'vitest';
import type { Palette, PaintView } from './atlas-palette';
import { toScreen } from '@/lib/comparisons/atlas/camera';
import { ratingX } from '@/lib/comparisons/atlas/opinion';
import { paintOpinionBack, type OpinionLabels } from './paint-opinion';

const palette: Palette = { fg: 'FG', muted: 'MUTED', line: 'LINE', glow: 'GLOW', cream: 'CREAM', faint: 'FAINT', clash: 'CLASH', font: 'sans',
  type: { book: 'BOOK', movie: 'MOVIE', series: 'SERIES' } };
const labels: OpinionLabels = { axisRef: 'Tu nota →', axisOthers: 'Media del resto →', loved: 'Os encantó', meh: 'Ni fu ni fa',
  refYes: 'Tú sí, ellos no', othersYes: 'Ellos sí, tú no' };

const rect = vi.fn<(x: number, y: number, w: number, h: number) => void>();
function paint(withLabels?: OpinionLabels) {
  rect.mockClear();
  const noop = () => {};
  const ctx = { fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, fill: noop,
    strokeRect: rect, setLineDash: noop, stroke: noop, save: noop, translate: noop, rotate: noop, restore: noop } as unknown as CanvasRenderingContext2D;
  const text = vi.fn<PaintView['text']>();
  paintOpinionBack({ ctx, cam: { x: 0, y: 0, k: 0.5 }, vp: { width: 800, height: 800 }, palette, text }, withLabels);
  return text;
}
const call = (text: ReturnType<typeof paint>, value: string) => text.mock.calls.find(([v]) => v === value);

describe('paintOpinionBack', () => {
  it('pads the frame by half a point so ratings 1 and 10 lie strictly inside it', () => {
    paint();
    const [x, y, w, h] = rect.mock.calls[0];
    const cam = { x: 0, y: 0, k: 0.5 }, vp = { width: 800, height: 800 };
    const [top, height] = h < 0 ? [y + h, -h] : [y, h];
    for (const rating of [1, 10]) for (const other of [1, 10]) {
      const at = toScreen(cam, vp, { x: ratingX(rating), y: -ratingX(other) });
      expect(at.x).toBeGreaterThan(x); expect(at.x).toBeLessThan(x + w);
      expect(at.y).toBeGreaterThan(top); expect(at.y).toBeLessThan(top + height);
    }
    expect(w).toBeCloseTo(10 * 170 * 0.5); // ratings 0.5–10.5 = 10 points wide
  });
  it('names each corner in its place, alignment and colour', () => {
    const text = paint(labels);
    const centre = 400;
    const [, lx, ly, , lc, la] = call(text, 'Os encantó')!;
    expect([lx > centre, ly < centre, lc, la]).toEqual([true, true, 'GLOW', 'right']);
    const [, mx, my, , mc, ma] = call(text, 'Ni fu ni fa')!;
    expect([mx < centre, my > centre, mc, ma]).toEqual([true, true, 'FG', 'left']);
    const [, rx, ry, , rc, ra] = call(text, 'Tú sí, ellos no')!;
    expect([rx > centre, ry > centre, rc, ra]).toEqual([true, true, 'CLASH', 'right']);
    const [, ox, oy, , oc, oa] = call(text, 'Ellos sí, tú no')!;
    expect([ox < centre, oy < centre, oc, oa]).toEqual([true, true, 'CLASH', 'left']);
    expect(call(text, 'Tu nota →')).toBeTruthy();
    expect(call(text, 'Media del resto →')).toBeTruthy();
  });
  it('without labels draws only the ticks', () => {
    const text = paint();
    const corner = new Set(Object.values(labels));
    expect(text.mock.calls.some(([value]) => corner.has(value))).toBe(false);
    expect(text.mock.calls.map(([value]) => value).sort()).toEqual(['1', '1', '10', '10', '5', '5']);
  });
});
