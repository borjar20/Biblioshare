import { describe, expect, it, vi } from 'vitest';
import type { QuienLayout } from '@/lib/comparisons/atlas/layout';
import type { AtlasPerson } from '@/lib/comparisons/atlas/types';
import type { PaintView } from './atlas-palette';
import { paintQuienBack, paintQuienFront } from './paint-quien';

const people = ['a', 'b', 'c'].map(id => ({ id, name: id.toUpperCase(), color: '#abcdef', avatarUrl: null, isMe: false })) as AtlasPerson[];
const layout: QuienLayout = {
  poles: [{ userId: 'a', x: -250, y: 0, count: 3 }, { userId: 'b', x: 250, y: 0, count: 1 }, { userId: 'c', x: 0, y: 250, count: 2 }],
  clusters: [
    { id: 'a,b', owners: ['a', 'b'], keys: ['book:1'], x: 0, y: 0, r: 20 },
    { id: 'a,c', owners: ['a', 'c'], keys: ['book:2', 'book:3'], x: -100, y: 125, r: 25 },
  ], positions: new Map(), extent: { minX: -300, maxX: 300, minY: -100, maxY: 300 },
};
function view() {
  const ctx = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    moveTo: vi.fn(), quadraticCurveTo: vi.fn(), stroke: vi.fn(), createRadialGradient: () => ({ addColorStop: vi.fn() }) };
  const text = vi.fn<PaintView['text']>();
  return { ctx, text, paint: { ctx: ctx as unknown as CanvasRenderingContext2D, cam: { x: 0, y: 0, k: 0.4 }, vp: { width: 800, height: 600 },
    palette: { font: 'sans', line: '#333', fg: '#eee', muted: '#999', glow: '#ffd080' } as PaintView['palette'], text } };
}

describe('grupos pequeños de Quién', () => {
  it('identifica los cruces de una y dos obras con cifra y un hilo por dueño', () => {
    const { ctx, text, paint } = view();
    const props = { layout, active: ['a', 'b', 'c'], people, countLabel: (count: number) => `${count} obras` };
    paintQuienBack(paint, props); paintQuienFront(paint, props);
    expect(ctx.quadraticCurveTo).toHaveBeenCalledTimes(4);
    expect(text.mock.calls.map(([value]) => value)).toEqual(expect.arrayContaining(['1', '2']));
  });
  it('conserva los hilos y cifras tenues cuando el grupo queda apagado', () => {
    const { ctx, text, paint } = view();
    const alphas: number[] = [];
    ctx.stroke.mockImplementation(() => { alphas.push(ctx.globalAlpha); });
    const props = { layout: { ...layout, clusters: [layout.clusters[1]] }, active: ['a', 'b'], people, countLabel: String };
    paintQuienBack(paint, props); paintQuienFront(paint, props);
    expect(alphas.slice(0, 2)).toEqual([0.22, 0.22]);
    expect(text.mock.calls.some(([value]) => value === '2')).toBe(true);
    expect(ctx.globalAlpha).toBe(1);
  });
});
