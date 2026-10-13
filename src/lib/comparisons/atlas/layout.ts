import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork, Extent, Point } from './types';

export const POLE_RADIUS = 900;
export const SPIRAL_STEP = 12;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Shared groups with fewer works draw no count nor thread (6–10 people would saturate the centre). */
const LABEL_MIN = 3;

export type Pole = Point & { userId: string; count: number };
export type Cluster = Point & { id: string; owners: string[]; r: number; keys: WorkKey[] };
export type QuienLayout = { poles: Pole[]; clusters: Cluster[]; positions: Map<WorkKey, Point>; extent: Extent };

export function spiral(i: number, step: number): Point {
  const r = step * Math.sqrt(i + 0.5), t = i * GOLDEN;
  return { x: Math.cos(t) * r, y: Math.sin(t) * r };
}

export function polePositions(ids: string[]): (Point & { userId: string })[] {
  if (ids.length === 1) return [{ userId: ids[0], x: 0, y: 0 }];
  return ids.map((userId, i) => {
    const angle = ids.length === 2 ? Math.PI * (1 - i) : -Math.PI / 2 + i * 2 * Math.PI / ids.length;
    return { userId, x: Math.cos(angle) * POLE_RADIUS, y: Math.sin(angle) * POLE_RADIUS };
  });
}

export function layoutQuien(people: AtlasPerson[], works: AtlasWork[]): QuienLayout {
  const base = polePositions(people.map(person => person.id));
  const at = new Map(base.map(pole => [pole.userId, pole]));
  const poles: Pole[] = base.map(pole => ({ ...pole, count: works.filter(work => work.owners.some(owner => owner.userId === pole.userId)).length }));
  const groups = new Map<string, { owners: string[]; keys: WorkKey[] }>();
  for (const work of works) {
    const owners = work.owners.map(owner => owner.userId); const id = owners.join(',');
    const group = groups.get(id) ?? { owners, keys: [] };
    group.keys.push(work.key); groups.set(id, group);
  }
  const positions = new Map<WorkKey, Point>();
  const clusters: Cluster[] = [...groups].map(([id, { owners, keys }]) => {
    const f = owners.length > 1 ? 0.92 : 1;
    const x = owners.reduce((sum, owner) => sum + at.get(owner)!.x, 0) / owners.length * f;
    const y = owners.reduce((sum, owner) => sum + at.get(owner)!.y, 0) / owners.length * f;
    keys.forEach((key, i) => { const offset = spiral(i, SPIRAL_STEP); positions.set(key, { x: x + offset.x, y: y + offset.y }); });
    return { id, owners, keys, x, y, r: SPIRAL_STEP * Math.sqrt(keys.length) + 8 };
  });
  const xs = [...poles.map(p => p.x), ...clusters.flatMap(c => [c.x - c.r, c.x + c.r])];
  const ys = [...poles.map(p => p.y), ...clusters.flatMap(c => [c.y - c.r, c.y + c.r])];
  // Room for pole avatars and their name/count labels below.
  const extent = { minX: Math.min(...xs) - 180, maxX: Math.max(...xs) + 180, minY: Math.min(...ys) - 150, maxY: Math.max(...ys) + 170 };
  return { poles, clusters, positions, extent };
}

export function workState(work: AtlasWork, active: string[]): { alpha: number; glow: boolean; shared: boolean } {
  const touches = work.owners.some(owner => active.includes(owner.userId));
  const glow = active.length > 1 && active.every(id => work.owners.some(owner => owner.userId === id));
  return { alpha: touches ? 1 : 0.06, glow, shared: work.owners.length > 1 };
}

export function clusterState(cluster: Cluster, active: string[]): { on: boolean; common: boolean; labelled: boolean } {
  return { on: cluster.owners.every(owner => active.includes(owner)),
    common: active.length > 1 && active.every(id => cluster.owners.includes(id)),
    labelled: cluster.owners.length > 1 && cluster.keys.length >= LABEL_MIN };
}
