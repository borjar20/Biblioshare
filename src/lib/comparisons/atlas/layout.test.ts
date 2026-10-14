import { describe, expect, it } from 'vitest';
import type { Snapshot, WorkKey } from '../types';
import { regions } from '../derive';
import { atlasModel } from './model';
import { clusterState, layoutQuien, poleLabelAbove, polePositions, POLE_CLEARANCE, POLE_RADIUS, workState } from './layout';
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
  it('con cuatro personas en cuadrado, ningún grupo se solapa con otro ni tapa un polo', () => {
    // T arriba, L derecha, M abajo, F izquierda: {T,M}, {L,F} y {T,L,M,F} caen los tres en el centro.
    const ids = ['t', 'l', 'm', 'f'];
    const sets: [string[], number][] = [[['t', 'm'], 77], [['l', 'f'], 40], [['t', 'l', 'm', 'f'], 60], [['t', 'l'], 25], [['t', 'f'], 20],
      [['l', 'm'], 15], [['t'], 830], [['l'], 400], [['m'], 300], [['f'], 120]];
    const keysOf: Record<string, string[]> = Object.fromEntries(ids.map(id => [id, []]));
    let n = 0;
    for (const [owners, count] of sets) for (let i = 0; i < count; i++, n++) for (const id of owners) keysOf[id].push(`book:${n}`);
    const snap: Snapshot = { group: { id: 'g', name: 'G', revision: 1, members: ids.map(member) }, format: 'all', excludedSeriesWithoutEpisodes: 0,
      catalog: [], works: Object.entries(keysOf).flatMap(([userId, keys]) => keys.map(key => ({ userId, key: key as WorkKey, rating: null, date: null, orderUnknown: false, progress: null }))) };
    const model = atlasModel(snap, 't', 'Tú');
    const layout = layoutQuien(model.people, model.works);
    const { clusters, poles } = layout;
    expect(clusters).toHaveLength(sets.length);
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i], b = clusters[j];
      expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id} / ${b.id}`).toBeGreaterThan(a.r + b.r);
    }
    for (const cluster of clusters) for (const pole of poles)
      expect(Math.hypot(cluster.x - pole.x, cluster.y - pole.y), `${cluster.id} / ${pole.userId}`).toBeGreaterThanOrEqual(cluster.r + 80);
    // Single-owner groups sit outward, beyond their own pole.
    for (const cluster of clusters.filter(c => c.owners.length === 1)) {
      const pole = poles.find(p => p.userId === cluster.owners[0])!;
      expect(Math.hypot(cluster.x, cluster.y)).toBeGreaterThan(Math.hypot(pole.x, pole.y) + cluster.r);
    }
    // Every work stays inside its group's disc, and the extent holds every group.
    for (const cluster of clusters) for (const key of cluster.keys) {
      const p = layout.positions.get(key)!;
      expect(Math.hypot(p.x - cluster.x, p.y - cluster.y)).toBeLessThanOrEqual(cluster.r);
    }
    for (const c of clusters) {
      expect(c.x - c.r).toBeGreaterThanOrEqual(layout.extent.minX); expect(c.x + c.r).toBeLessThanOrEqual(layout.extent.maxX);
      expect(c.y - c.r).toBeGreaterThanOrEqual(layout.extent.minY); expect(c.y + c.r).toBeLessThanOrEqual(layout.extent.maxY);
    }
    const again = layoutQuien(model.people, model.works);
    expect(again.clusters.map(c => [c.id, c.x, c.y])).toEqual(clusters.map(c => [c.id, c.x, c.y]));
  });
  it('con una sola persona, su grupo queda debajo del polo sin taparlo', () => {
    const solo = atlasModel({ ...snapshot, group: { ...snapshot.group, members: [member('a')] } }, 'a', 'Tú');
    const [cluster] = layoutQuien(solo.people, solo.works).clusters;
    expect(cluster.x).toBeCloseTo(0); expect(cluster.y).toBeGreaterThanOrEqual(cluster.r + 80);
  });
  it('con dos personas, lo de cada una queda hacia fuera, a izquierda y derecha', () => {
    const two = atlasModel({ ...snapshot, group: { ...snapshot.group, members: [member('a'), member('b')] } }, 'a', 'Tú');
    const layout = layoutQuien(two.people, two.works);
    for (const id of ['a', 'b']) {
      const pole = layout.poles.find(p => p.userId === id)!, cluster = layout.clusters.find(c => c.id === id)!;
      expect(cluster.y).toBeCloseTo(0);
      expect(Math.sign(cluster.x)).toBe(Math.sign(pole.x));
      expect(Math.abs(cluster.x) - cluster.r).toBeGreaterThanOrEqual(Math.abs(pole.x) + 80);
    }
  });
  it('el nombre del polo va al lado contrario de su grupo propio: encima si el grupo cae debajo', () => {
    const [top, right, bottom, left] = polePositions(['t', 'l', 'm', 'f']);
    expect([top, right, bottom, left].map(poleLabelAbove)).toEqual([false, false, true, false]);
    expect(poleLabelAbove(polePositions(['solo'])[0])).toBe(true);
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
  it('al seleccionar A y B reúne AB y ABC en un solo grupo y conserva todos los polos', () => {
    const original = layoutQuien(people, works);
    const selected = layoutQuien(people, works, ['a', 'b']);
    const ab = selected.clusters.find(cluster => cluster.id === 'a,b')!;
    expect(ab.owners).toEqual(['a', 'b']);
    expect(ab.keys.toSorted()).toEqual(['book:1', 'book:2', 'book:3', 'movie:1']);
    expect(selected.clusters.find(cluster => cluster.id === 'a,b,c')).toBeUndefined();
    expect(selected.poles).toEqual(original.poles);
    expect(selected.positions.size).toBe(works.length);
    // The shared works travel to the selected cluster; Carla's own work keeps its original faint place.
    for (const key of ab.keys) {
      const point = selected.positions.get(key)!;
      expect(Math.hypot(point.x - ab.x, point.y - ab.y)).toBeLessThan(ab.r);
    }
    expect(selected.clusters.find(cluster => cluster.id === 'c')).toEqual(original.clusters.find(cluster => cluster.id === 'c'));
    expect(selected.positions.get('book:6')).toEqual(original.positions.get('book:6'));
    expect(workState(works.find(work => work.key === 'book:6')!, ['a', 'b']).alpha).toBe(0.06);
    expect(selected.positions.get('book:1')).not.toEqual(original.positions.get('book:1'));
  });
  it('con una persona activa reúne todo lo suyo y deja lo ajeno en su grupo original', () => {
    const original = layoutQuien(people, works);
    const selected = layoutQuien(people, works, ['a']);
    expect(selected.clusters.find(cluster => cluster.id === 'a')?.keys.toSorted()).toEqual([
      'book:1', 'book:2', 'book:3', 'book:4', 'movie:1', 'series:1',
    ]);
    expect(selected.clusters.map(cluster => cluster.id).toSorted()).toEqual(['a', 'b', 'c']);
    for (const key of ['book:5', 'book:6'] as WorkKey[]) expect(selected.positions.get(key)).toEqual(original.positions.get(key));
  });
  it('un grupo compartido apagado conserva su posición y no se mezcla con el grupo visible', () => {
    const ownership: [string, string[]][] = [['book:1', ['a', 'c']], ['book:2', ['a', 'b', 'c', 'd']],
      ['book:3', ['b', 'd']], ['book:4', ['b', 'd']], ['book:5', ['b', 'd']]];
    const four = atlasModel({ ...snapshot, group: { ...snapshot.group, members: ['a', 'b', 'c', 'd'].map(member) },
      works: ownership.flatMap(([key, ids]) => ids.map(userId => ({ userId, key: key as WorkKey,
        rating: null, date: null, orderUnknown: false, progress: null }))),
    }, 'a', 'Tú');
    const original = layoutQuien(four.people, four.works), selected = layoutQuien(four.people, four.works, ['a', 'c']);
    const off = selected.clusters.find(cluster => cluster.id === 'b,d')!, on = selected.clusters.find(cluster => cluster.id === 'a,c')!;
    expect(on.keys).toEqual(['book:1', 'book:2']);
    expect(off).toEqual(original.clusters.find(cluster => cluster.id === 'b,d'));
    for (const key of off.keys) expect(selected.positions.get(key)).toEqual(original.positions.get(key));
    expect(Math.hypot(on.x - off.x, on.y - off.y)).toBeGreaterThan(on.r + off.r);
  });
  it('el orden de personas define los dueños del grupo aunque lleguen desordenados o repetidos', () => {
    const shuffled = works.map(work => ({ ...work, owners: [...work.owners].reverse().concat(work.owners[0]) }));
    const selected = layoutQuien(people, shuffled, ['b', 'a']);
    expect(selected.clusters.find(cluster => cluster.id === 'a,b')?.keys.toSorted()).toEqual(['book:1', 'book:2', 'book:3', 'movie:1']);
    expect(selected.clusters.some(cluster => cluster.id === 'b,a')).toBe(false);
    expect(selected.poles.map(pole => pole.count)).toEqual([6, 5, 4]);
  });
  it('sin selección conserva todos los grupos originales tenues y restaurar todas las caras restaura el mapa', () => {
    const original = layoutQuien(people, works);
    const off = layoutQuien(people, works, []);
    expect(off.clusters).toEqual(original.clusters);
    expect([...off.positions]).toEqual([...original.positions]);
    for (const work of works) expect(workState(work, []).alpha).toBe(0.06);
    layoutQuien(people, works, ['a', 'b']);
    const restored = layoutQuien(people, works, ['c', 'b', 'a']);
    expect(restored.clusters).toEqual(original.clusters);
    expect([...restored.positions]).toEqual([...original.positions]);
    const empty = layoutQuien([], [], []);
    expect(empty.positions.size).toBe(0);
    expect(Object.values(empty.extent).every(Number.isFinite)).toBe(true);
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
  it('grupo encendido si todos sus dueños están activos; todo grupo compartido tiene cifra e hilos', () => {
    const layout = layoutQuien(people, works);
    const ab = layout.clusters.find(c => c.id === 'a,b')!; const abc = layout.clusters.find(c => c.id === 'a,b,c')!;
    expect(clusterState(ab, ['a', 'b'])).toEqual({ on: true, common: true, labelled: true });
    expect(clusterState(abc, ['a', 'b'])).toEqual({ on: false, common: true, labelled: true });
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
