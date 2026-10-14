// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkKey } from '@/lib/comparisons/types';
import type { AtlasPerson, AtlasWork } from '@/lib/comparisons/atlas/types';
import { layoutQuien } from '@/lib/comparisons/atlas/layout';
import { layoutOpinion } from '@/lib/comparisons/atlas/opinion';
import { layoutTiempo } from '@/lib/comparisons/atlas/tiempo';
import { layoutIslands } from '@/lib/comparisons/atlas/islands';
import { buildScene } from '@/lib/comparisons/atlas/scene';
import { PERSON_COLORS } from '@/lib/comparisons/atlas/model';
import { createAtlasEngine, type EngineProps } from './atlas-engine';

/**
 * Budget of the atlas engine (spec §5.2: 60 fps with 1.000 works on a mid-range Android). jsdom and a no-op
 * context only measure the engine's own work (sync, interpolation, culling, links), not the GPU; a phone is a few
 * times slower than this machine, hence a budget well under 16 ms. Timing on shared CI runners is noise: skipped there.
 */
const noop = () => {};
const gradient = { addColorStop: noop };
const fakeCtx = {
  globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
  beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, bezierCurveTo: noop, quadraticCurveTo: noop, arc: noop,
  roundRect: noop, rect: noop, fill: noop, stroke: noop, clip: noop, save: noop, restore: noop, translate: noop, rotate: noop,
  setTransform: noop, clearRect: noop, fillRect: noop, strokeRect: noop, fillText: noop, drawImage: noop, setLineDash: noop,
  measureText: (value: string) => ({ width: value.length * 6 }), createRadialGradient: () => gradient,
};

function fixture() {
  const people: AtlasPerson[] = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Persona ${i}`, avatarUrl: null,
    color: PERSON_COLORS[i], isMe: i === 0 }));
  const works: AtlasWork[] = Array.from({ length: 1000 }, (_, i) => ({
    key: `book:${String(i).padStart(4, '0')}` as WorkKey, itemType: 'book', itemId: String(i), title: `Obra ${i}`, metadataMissing: false,
    coverUrl: null, genres: [], creators: [],
    owners: people.map((person, j) => ({ userId: person.id, rating: (i + j) % 10 + 1,
      date: `${2014 + (i * 7 + j * 3) % 11}-${String((i + j) % 12 + 1).padStart(2, '0')}-15` })),
  }));
  const active = people.map(person => person.id);
  const quien = layoutQuien(people, works), tiempo = layoutTiempo(people, works, active), islas = layoutIslands(people, works, active, 'type');
  const scene = buildScene('tiempo', works, active, { quien, opinion: layoutOpinion(people, works, active), tiempo, islas });
  const props: EngineProps = { people, works, active, scene, quien, tiempo, islas, countLabel: n => `${n} obras`,
    onTogglePerson: noop, onHover: noop, onActivate: noop };
  return props;
}

const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];

describe.skipIf(!!process.env.CI)('presupuesto del motor del atlas', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('1.000 obras de 10 dueños en Tiempo: sync inicial < 120 ms y mediana de frame < 12 ms', () => {
    const props = fixture();
    expect(props.scene.targets.size).toBeGreaterThan(9000);
    expect(props.scene.links.length).toBe(1000);
    let frame: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frame = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', noop);
    const host = document.createElement('div'); const canvas = document.createElement('canvas'); host.append(canvas);
    Object.defineProperty(host, 'clientWidth', { value: 1280 }); Object.defineProperty(host, 'clientHeight', { value: 800 });
    canvas.getContext = (() => fakeCtx) as unknown as HTMLCanvasElement['getContext'];
    const engine = createAtlasEngine(canvas, host, () => props);
    const t0 = performance.now(); engine.sync(); const syncMs = performance.now() - t0;
    expect(frame).not.toBeNull();
    const run = frame! as FrameRequestCallback;
    for (let i = 0; i < 3; i++) run(performance.now());   // warm-up (JIT)
    const times: number[] = [];
    for (let i = 0; i < 20; i++) { const start = performance.now(); run(start); times.push(performance.now() - start); }
    const frameMs = median(times);
    console.info(`[atlas perf] sync ${syncMs.toFixed(1)} ms · frame mediana ${frameMs.toFixed(2)} ms · sprites ${host.dataset.atlasSprites}`);
    engine.dispose();
    expect(syncMs).toBeLessThan(120);
    expect(frameMs).toBeLessThan(12);
  });
});
