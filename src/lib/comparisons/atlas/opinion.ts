import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork, Extent, Point } from './types';

export const RATING_STEP = 170;
/** Same thresholds as «Notas parecidas» (≤1) and «Diferencia de opinión» (≥3). */
export const AGREE_MAX = 1;
export const CLASH_MIN = 3;
const JITTER = 26;
/** Frame spans ratings 0.5–10.5 (±850); the rest is room for the y-axis title (left) and the x-axis title and ticks (below). */
export const OPINION_EXTENT: Extent = { minX: -1080, minY: -920, maxX: 920, maxY: 1020 };
/** Half a point of padding so ratings 1 and 10 sit inside the frame, not on its edge. */
export const FRAME_MIN = 0.5;
export const FRAME_MAX = 10.5;

export type OpinionPoint = Point & { ref: number; others: number; diff: number };
export type OpinionLayout = { reference: string | null; positions: Map<WorkKey, OpinionPoint>; extent: Extent };
export type OpinionSummary = { kind: 'needsTwo' } | { kind: 'empty'; ref: string; isMe: boolean }
  | { kind: 'counts'; agree: number; clash: number; total: number; ref: string; isMe: boolean };

/** «Tú» when active, otherwise the first active face in people order; none below two faces. */
export function opinionReference(people: AtlasPerson[], active: string[]): string | null {
  if (active.length < 2) return null;
  return people.find(person => person.isMe && active.includes(person.id))?.id
    ?? people.find(person => active.includes(person.id))?.id ?? null;
}

/** Deterministic spread in [−13, 13] per key and axis (FNV-1a), so equal integer notes don't stack. */
export function jitter(key: string, axis: 0 | 1): number {
  let hash = 2166136261 ^ axis;
  for (let i = 0; i < key.length; i++) { hash ^= key.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return ((hash >>> 0) % 1000 / 1000 - 0.5) * JITTER;
}

export const ratingX = (rating: number) => (rating - 5.5) * RATING_STEP;

export function layoutOpinion(people: AtlasPerson[], works: AtlasWork[], active: string[]): OpinionLayout {
  const reference = opinionReference(people, active);
  const positions = new Map<WorkKey, OpinionPoint>();
  if (reference) for (const work of works) {
    const own = work.owners.find(owner => owner.userId === reference)?.rating;
    if (own === null || own === undefined) continue;
    const others = work.owners.filter(owner => owner.userId !== reference && active.includes(owner.userId) && owner.rating !== null)
      .map(owner => owner.rating as number);
    if (!others.length) continue;
    const mean = others.reduce((sum, value) => sum + value, 0) / others.length;
    positions.set(work.key, { x: ratingX(own) + jitter(work.key, 0), y: -ratingX(mean) + jitter(work.key, 1),
      ref: own, others: mean, diff: Math.abs(own - mean) });
  }
  return { reference, positions, extent: OPINION_EXTENT };
}

/** 0 = agreement colour (|dif| ≤ 1), 1 = clash colour (|dif| ≥ 4), linear in between. */
export function diffMix(diff: number): number { return Math.min(1, Math.max(0, (diff - 1) / 3)); }

/** Counts exactly what the Opinión lens draws. */
export function summarizeOpinion(people: AtlasPerson[], layout: OpinionLayout): OpinionSummary {
  const reference = people.find(person => person.id === layout.reference);
  if (!reference) return { kind: 'needsTwo' };
  const diffs = [...layout.positions.values()].map(point => point.diff);
  if (!diffs.length) return { kind: 'empty', ref: reference.name, isMe: reference.isMe };
  return { kind: 'counts', ref: reference.name, isMe: reference.isMe, total: diffs.length,
    agree: diffs.filter(diff => diff <= AGREE_MAX).length, clash: diffs.filter(diff => diff >= CLASH_MIN).length };
}
