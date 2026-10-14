import type { WorkKey } from '../types';
import { jitter } from './opinion';
import type { AtlasPerson, AtlasWork, Extent, Point } from './types';

export const LANE_GAP = 230;
export const YEAR_STEP = 270;
const LANE_SPREAD = 75;

export type TiempoInstance = Point & { key: WorkKey; userId: string; year: number };
/** `gap` is the world distance between lanes (`laneGap`), so the painter can size each lane's band and avatar. */
export type TiempoLayout = { lanes: { userId: string; y: number }[]; instances: TiempoInstance[]; startYear: number; endYear: number; gap: number; extent: Extent };
export type TiempoSummary = { kind: 'first'; first: number; total: number; undated: number } | { kind: 'lanes'; names: string[] };

/** `YYYY-MM-DD` as a fractional year, taken at the middle of the day. */
export function yearOf(date: string): number {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  return y + (Date.UTC(y, m - 1, d) - start + 43_200_000) / (end - start);
}

/**
 * The fractional year of a date the timeline can place, or null: unreadable, or implausible for something read or
 * watched (before 1900 or past next year — a typo like `0202` or `2302`) would stretch the axis over centuries.
 */
export function datedYear(date: string | null): number | null {
  if (!date) return null;
  const year = yearOf(date);
  return Number.isFinite(year) && year >= 1900 && year < new Date().getUTCFullYear() + 2 ? year : null;
}

/**
 * Up to 4 lanes keep the full gap; beyond that they get closer (never under 110). With many people on a wide
 * screen the fit is limited by height, and a full gap left the chart a narrow strip. A tall screen is limited by
 * width instead, so there (`compress` false) closer lanes would only shrink them: they keep the full gap.
 */
export const laneGap = (count: number, compress = true) => !compress || count <= 4 ? LANE_GAP : Math.max(110, LANE_GAP * 4 / count);
export const laneY = (index: number, count: number, compress = true) => (index - (count - 1) / 2) * laneGap(count, compress);

export function layoutTiempo(people: AtlasPerson[], works: AtlasWork[], active: string[], compress = true): TiempoLayout {
  const activePeople = people.filter(person => active.includes(person.id));
  const lanes = activePeople.map((person, index) => ({ userId: person.id, y: laneY(index, activePeople.length, compress) }));
  const gap = laneGap(activePeople.length, compress);
  const laneOf = new Map(lanes.map(lane => [lane.userId, lane.y]));
  const dated = works.flatMap(work => work.owners.flatMap(owner => {
    const year = laneOf.has(owner.userId) ? datedYear(owner.date) : null;
    return year === null ? [] : [{ key: work.key, userId: owner.userId, year }];
  }));
  let low = Infinity, high = -Infinity;
  for (const item of dated) { low = Math.min(low, item.year); high = Math.max(high, item.year); }
  const startYear = dated.length ? Math.floor(low) : new Date().getUTCFullYear();
  const endYear = dated.length ? Math.max(Math.ceil(high), startYear + 1) : startYear + 1;
  const mid = (startYear + endYear) / 2;
  const instances = dated.map(item => ({ ...item, x: (item.year - mid) * YEAR_STEP,
    y: laneOf.get(item.userId)! + jitter(`${item.key}@${item.userId}`, 1) / 13 * LANE_SPREAD * gap / LANE_GAP }));
  const half = (Math.max(1, lanes.length) - 1) / 2 * gap;
  return { lanes, instances, startYear, endYear, gap,
    extent: { minX: (startYear - mid) * YEAR_STEP - 260, maxX: (endYear - mid) * YEAR_STEP + 60, minY: -half - 150, maxY: half + 150 } };
}

/** Counts exactly what the Tiempo lens can compare: shared works dated for every active owner. */
export function summarizeTiempo(people: AtlasPerson[], works: AtlasWork[], active: string[]): TiempoSummary {
  const me = people.find(person => person.isMe && active.includes(person.id));
  if (!me || active.length < 2) return { kind: 'lanes', names: people.filter(person => active.includes(person.id)).map(person => person.name) };
  let first = 0, total = 0, undated = 0;
  for (const work of works) {
    const owners = work.owners.filter(owner => active.includes(owner.userId));
    if (owners.length < 2 || !owners.some(owner => owner.userId === me.id)) continue;
    if (owners.some(owner => datedYear(owner.date) === null)) { undated++; continue; }
    total++;
    const mine = owners.find(owner => owner.userId === me.id)!.date!;
    if (owners.every(owner => mine <= owner.date!)) first++;
  }
  return { kind: 'first', first, total, undated };
}
