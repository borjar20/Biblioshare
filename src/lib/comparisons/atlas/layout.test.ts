import { describe, expect, it } from 'vitest';
import type { Snapshot, WorkKey } from '../types';
import { regions } from '../derive';
import { atlasModel } from './model';
import { clusterState, layoutQuien, polePositions, POLE_CLEARANCE, POLE_RADIUS, workState } from './layout';
import { summarizeQuien } from './summary';

const member = (id: string) => ({ slotId: id, userId: id, name: id.toUpperCase(), avatarUrl: null, available: true });
const owned: Record<string, string[]> = {
  a: ['book:1', 'book:2', 'book:3', 'book:4', 'movie:1', 'series:1'],
  b: ['book:1', 'book:2', 'book:3', 'book:5', 'movie:1'],
  c: ['book:1', 'book:2', 'book:6', 'series:1'],
};
const snapshot: Snapshot = { group: { id: 'g', name: 'G', revision: 1, members: ['a', 'b', 'c'].map(member) }, format: 'all', excludedSeriesWithoutEpisodes: 0,
  catalog: [], works: Object.entries(owned).flatMap(([userId, keys]) => keys.map(key => ({ userId, key: key as WorkKey, rating: null, date: null, orderUnknown: false, progress: null }))) };
const { people, works } = atlasModel(snapshot, 'a', 'Tú');

describe('layoutQuien', () => {
  it('cada grupo tiene las mismas obras que la región exacta del Venn', () => {
    const layout = layoutQuien(people, works);
    for (const region of regions(snapshot, ['a', 'b', 'c'])) {
      const cluster = layout.clusters.find(c => [...c.owners].sort().join() === [...region.people].sort().join());
      if (region.keys.length === 0) { expect(cluster).toBeUndefined(); continue; }
      expect(cluster?.keys.toSorted()).toEqual(region.keys.toSorted());
    }
  });
  it('coloca polos en el círculo y grupos en el centroide (×0,92 si son varios)', () => {
    const layout = layoutQuien(people, works);
    for (const pole of layout.poles) expect(Math.hypot(pole.x, pole.y)).toBeCloseTo(POLE_RADIUS);
    const ab = layout.clusters.find(c => c.id === 'a,b')!;
    const [pa, pb] = ['a', 'b'].map(id => layout.poles.find(p => p.userId === id)!);
    expect(ab.x).toBeCloseTo((pa.x + pb.x) / 2 * 0.92); expect(ab.y).toBeCloseTo((pa.y + pb.y) / 2 * 0.92);
    expect(layout.poles.map(p => p.count)).toEqual([6, 5, 4]);
  });
  it('con muchas personas, los grupos compartidos dejan libre el anillo de polos', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const many: Record<string, string[]> = Object.fromEntries(ids.map(id => [id, []]));
    for (let i = 0; i < 30; i++) for (const id of ids.slice(0, 3)) many[id].push(`book:${i}`);
    for (let i = 30; i < 32; i++) for (const id of ids.slice(0, 2)) many[id].push(`book:${i}`);
    const snap: Snapshot = { group: { id: 'g', name: 'G', revision: 1, members: ids.map(member) }, format: 'all', excludedSeriesWithoutEpisodes: 0,
      catalog: [], works: Object.entries(many).flatMap(([userId, keys]) => keys.map(key => ({ userId, key: key as WorkKey, rating: null, date: null, orderUnknown: false, progress: null }))) };
    const model = atlasModel(snap, 'p0', 'Tú');
    const layout = layoutQuien(model.people, model.works);
    const shared = layout.clusters.filter(c => c.owners.length > 1);
    expect(shared.length).toBe(2);
    for (const cluster of shared) for (const pole of layout.poles)
      expect(Math.hypot(cluster.x - pole.x, cluster.y - pole.y)).toBeGreaterThanOrEqual(POLE_CLEARANCE + cluster.r);
  });
  it('con dos personas, polos en horizontal', () => {
    const [left, right] = polePositions(['x', 'y']);
    expect(left.y).toBeCloseTo(0); expect(right.y).toBeCloseTo(0); expect(left.x).toBeLessThan(right.x);
  });
  it('es determinista y da una posición a cada obra', () => {
    const first = layoutQuien(people, works), second = layoutQuien(people, works);
    expect([...first.positions]).toEqual([...second.positions]);
    expect(first.positions.size).toBe(works.length);
  });
  it('la extensión contiene polos y grupos con margen', () => {
    const { extent, poles } = layoutQuien(people, works);
    for (const p of poles) { expect(p.x).toBeGreaterThan(extent.minX); expect(p.x).toBeLessThan(extent.maxX); expect(p.y).toBeLessThan(extent.maxY - 100); }
  });
  it('sin personas ni obras la extensión sigue siendo finita', () => {
    const { poles, clusters, extent } = layoutQuien([], []);
    expect(poles).toEqual([]); expect(clusters).toEqual([]);
    for (const value of [extent.minX, extent.maxX, extent.minY, extent.maxY]) expect(Number.isFinite(value)).toBe(true);
    expect(extent.minX).toBeLessThan(extent.maxX); expect(extent.minY).toBeLessThan(extent.maxY);
  });
});

describe('estado por caras', () => {
  const key = (k: string) => works.find(w => w.key === k)!;
  it('brilla lo común a todas las activas y se atenúa lo que no toca a ninguna', () => {
    expect(workState(key('book:1'), ['a', 'b', 'c'])).toEqual({ alpha: 1, glow: true, shared: true });
    expect(workState(key('book:3'), ['a', 'b', 'c']).glow).toBe(false);
    expect(workState(key('book:6'), ['a', 'b']).alpha).toBe(0.06);
    expect(workState(key('book:4'), ['a']).glow).toBe(false);
  });
  it('grupo encendido si todos sus dueños están activos; con cifra solo si es compartido y tiene ≥3', () => {
    const layout = layoutQuien(people, works);
    const ab = layout.clusters.find(c => c.id === 'a,b')!; const abc = layout.clusters.find(c => c.id === 'a,b,c')!;
    expect(clusterState(ab, ['a', 'b'])).toEqual({ on: true, common: true, labelled: false });
    expect(clusterState(abc, ['a', 'b'])).toEqual({ on: false, common: true, labelled: false });
    expect(clusterState(layout.clusters.find(c => c.id === 'a')!, ['a']).labelled).toBe(false);
  });
});

describe('summarizeQuien', () => {
  it('cuenta lo común a todas las activas', () => {
    expect(summarizeQuien(people, works, ['a', 'b', 'c'])).toEqual({ kind: 'common', count: 2, names: ['Tú', 'B', 'C'] });
    expect(summarizeQuien(people, works, ['a', 'b'])).toEqual({ kind: 'common', count: 4, names: ['Tú', 'B'] });
  });
  it('con una sola cara cuenta sus obras', () => {
    expect(summarizeQuien(people, works, ['c'])).toEqual({ kind: 'solo', count: 4, name: 'C' });
  });
});
