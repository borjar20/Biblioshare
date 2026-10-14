import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork, Extent, Point } from './types';

export const POLE_RADIUS = 900;
export const SPIRAL_STEP = 12;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Shared groups with fewer works draw no count nor thread (6–10 people would saturate the centre). */
const LABEL_MIN = 3;
/** Room (world units) a shared group keeps from the pole ring: avatar plus name/count labels. */
export const POLE_CLEARANCE = 300;
/** Gap (world units) between a pole and its own single-owner group, which sits outward: avatar plus name/count. */
export const POLE_LABEL = 120;
/** Air between two groups after the separation pass: room for the count drawn over a group (screen px at map zoom). */
const CLUSTER_GAP = 120;
const SEPARATION_PASSES = 80;

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

/**
 * The name and count go on the side away from the pole's own group: below the avatar, except when that group hangs
 * below the pole (the bottom pole, or the only person), where they go above.
 */
export function poleLabelAbove(pole: Point): boolean {
  const d = Math.hypot(pole.x, pole.y);
  return d === 0 || pole.y / d > 0.5;
}

/** Selected owners define each visible group; works with none keep their original, faint group and position. */
export function layoutQuien(people: AtlasPerson[], works: AtlasWork[], active = people.map(person => person.id)): QuienLayout {
  const base = polePositions(people.map(person => person.id));
  const at = new Map(base.map(pole => [pole.userId, pole]));
  const poles: Pole[] = base.map(pole => ({ ...pole, count: works.filter(work => work.owners.some(owner => owner.userId === pole.userId)).length }));
  const selected = new Set(active);
  // Only a partial selection needs the original layout: its inactive groups are fixed obstacles for the new groups.
  const original = people.some(person => !selected.has(person.id)) ? layoutQuien(people, works) : null;
  const fixed = new Map(original?.clusters.filter(cluster => !cluster.owners.some(owner => selected.has(owner))).map(cluster => [cluster.id, cluster]));
  const groups = new Map<string, { owners: string[]; keys: WorkKey[] }>();
  for (const work of works) {
    // The people order defines group identity, regardless of selection or incoming owners order (and duplicates).
    const allOwners = people.filter(person => work.owners.some(owner => owner.userId === person.id)).map(person => person.id);
    const activeOwners = allOwners.filter(owner => selected.has(owner));
    const owners = activeOwners.length ? activeOwners : allOwners; const id = owners.join(',');
    const group = groups.get(id) ?? { owners, keys: [] };
    group.keys.push(work.key); groups.set(id, group);
  }
  const clusters: Cluster[] = [...groups].map(([id, { owners, keys }]) => {
    const inactive = fixed.get(id); if (inactive) return inactive;
    const r = SPIRAL_STEP * Math.sqrt(keys.length) + 8;
    if (owners.length === 1) {
      // Outward, beyond its own pole, so the pole and its name/count stay visible (below it with one person).
      const pole = at.get(owners[0])!, d = Math.hypot(pole.x, pole.y);
      const [ux, uy] = d > 0 ? [pole.x / d, pole.y / d] : [0, 1];
      return { id, owners, keys, x: pole.x + ux * (POLE_LABEL + r), y: pole.y + uy * (POLE_LABEL + r), r };
    }
    const cx = owners.reduce((sum, owner) => sum + at.get(owner)!.x, 0) / owners.length;
    const cy = owners.reduce((sum, owner) => sum + at.get(owner)!.y, 0) / owners.length;
    const d = Math.hypot(cx, cy);
    // Shared groups sit slightly inside the centroid, but never so far out that they cover a pole's label.
    const f = d > 0 ? Math.max(0, Math.min(0.92, (POLE_RADIUS - POLE_CLEARANCE - r) / d)) : 1;
    return { id, owners, keys, x: cx * f, y: cy * f, r };
  });
  separate(clusters, base, at, new Set(fixed.keys()));
  const positions = new Map<WorkKey, Point>();
  for (const cluster of clusters) cluster.keys.forEach((key, i) => {
    const offset = spiral(i, SPIRAL_STEP); positions.set(key, { x: cluster.x + offset.x, y: cluster.y + offset.y });
  });
  // Empty group (no available members): keep the extent finite so the camera fit does not become NaN.
  const empty = poles.length === 0 && clusters.length === 0;
  const xs = empty ? [0] : [...poles.map(p => p.x), ...clusters.flatMap(c => [c.x - c.r, c.x + c.r])];
  const ys = empty ? [0] : [...poles.map(p => p.y), ...clusters.flatMap(c => [c.y - c.r, c.y + c.r])];
  // Room for pole avatars and their name/count labels below.
  const extent = { minX: Math.min(...xs) - 180, maxX: Math.max(...xs) + 180, minY: Math.min(...ys) - 150, maxY: Math.max(...ys) + 170 };
  return { poles, clusters, positions, extent };
}

/** Deterministic angle per id (FNV-1a), for groups whose owners' poles cancel out (opposite pairs, everyone). */
function hashAngle(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) { hash ^= id.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 4294967296 * Math.PI * 2;
}

/** Unit direction a group drifts to: the mean of its owners' poles, or a hashed angle when they cancel out. */
function driftOf(cluster: Cluster, at: Map<string, Point>): Point {
  const x = cluster.owners.reduce((sum, owner) => sum + at.get(owner)!.x, 0), y = cluster.owners.reduce((sum, owner) => sum + at.get(owner)!.y, 0);
  const d = Math.hypot(x, y);
  if (d > 1e-6 * POLE_RADIUS) return { x: x / d, y: y / d };
  const angle = hashAngle(cluster.id);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/**
 * Shared groups whose centroids coincide (with 4 people on a square, both diagonals and everyone fall on the centre)
 * would overlap: a fixed number of passes pushes every overlapping pair apart, the bigger group moving less, and keeps
 * each shared group clear of every pole. Single-owner groups (outward, past their pole) stay put and only push.
 * Deterministic: fixed order and passes, no randomness.
 */
function separate(clusters: Cluster[], poles: Point[], at: Map<string, Point>, fixed: Set<string>) {
  const drift = new Map(clusters.map(cluster => [cluster.id, driftOf(cluster, at)]));
  const movable = (cluster: Cluster) => cluster.owners.length > 1 && !fixed.has(cluster.id);
  for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i], b = clusters[j];
      if (!movable(a) && !movable(b)) continue;
      const min = a.r + b.r + CLUSTER_GAP;
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d < 1e-6) {
        const da = drift.get(a.id)!, db = drift.get(b.id)!;
        dx = db.x - da.x; dy = db.y - da.y; d = Math.hypot(dx, dy);
        if (d < 1e-6) { const angle = hashAngle(`${a.id}|${b.id}`); dx = Math.cos(angle); dy = Math.sin(angle); d = 1; }
        dx /= d; dy /= d; d = 0;
      } else { dx /= d; dy /= d; }
      const push = min - d, wa = a.r * a.r, wb = b.r * b.r;
      // Share of the push each one takes: the bigger group moves less; a fixed (single-owner) group does not move.
      const shareA = !movable(a) ? 0 : !movable(b) ? 1 : wb / (wa + wb), shareB = 1 - shareA;
      a.x -= dx * push * shareA; a.y -= dy * push * shareA;
      b.x += dx * push * shareB; b.y += dy * push * shareB;
    }
    for (const cluster of clusters) {
      if (!movable(cluster)) continue;
      for (const pole of poles) {
        const min = POLE_CLEARANCE + cluster.r;
        let dx = cluster.x - pole.x, dy = cluster.y - pole.y; const d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 1e-6) { const own = drift.get(cluster.id)!; dx = -own.x; dy = -own.y; } else { dx /= d; dy /= d; }
        cluster.x = pole.x + dx * min; cluster.y = pole.y + dy * min;
      }
    }
  }
}

/**
 * Tiempo and Islas compare: with two or more active faces they draw only what at least two of them share; with one
 * face, everything of hers. (Quién keeps everything: it is where each person's own works live.)
 */
export function comparable(work: AtlasWork, active: string[]): boolean {
  const owners = work.owners.filter(owner => active.includes(owner.userId)).length;
  return active.length < 2 ? owners > 0 : owners > 1;
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
