import type { WorkKey } from '../types';
import { comparable, spiral, workState } from './layout';
import { MIN_ZOOM } from './camera';
import type { AtlasPerson, AtlasWork, Camera, Extent, Point, Viewport } from './types';

export type IslandMode = 'type' | 'genre' | 'creator';
export const ISLAND_LIMIT = 10;
export const ISLAND_STEP = 11;
export const OTHER_ISLAND = 'other';
const TYPE_ORDER = ['book', 'movie', 'series'] as const;
const GAP = 160;          // between island discs
const LABEL_ROOM = 110;   // world gap between rows for the next row's title + «n en común» + means strip
export const ISLAND_HEADER_WIDTH = 148;
export const ISLAND_TITLE_MAX_PX = 20;
const HEADER_GUTTER = 12;

/** Header geometry stays in screen pixels, including when the discs zoom out. */
export function islandHeaderGeometry(meanCount: number, summary = true) {
  const rows = Math.ceil(meanCount / 3);
  const commonGap = rows ? 18 + 29 + (rows - 1) * 16 + 7 + 7 : 16;
  const titleGap = summary ? rows ? commonGap + 20 : 36 : 12;
  return { rows, commonGap, titleGap, room: titleGap + ISLAND_TITLE_MAX_PX };
}

export type IslandFrame = { viewport: Viewport; insets: { top: number; bottom: number } };
type IslandFraming = IslandFrame & { camera: Camera; ratingZoom: number; summaryZoom: number; titleZoom: number; contentKey: string };

export type Island = Point & { id: string; label: string | null; r: number; core: number; keys: WorkKey[]; common: number; shared: number; means: { userId: string; mean: number; count?: number }[];
  otherReasons?: { overflow: number; missing: number; unsupported: number } };
export type IslandInstance = Point & { key: WorkKey; island: string };
export type IslandsLayout = { mode: IslandMode; islands: Island[]; instances: IslandInstance[]; extent: Extent; framing?: IslandFraming };
export type IslandsSummary = { kind: 'solo'; name: string } | { kind: 'none' } | { kind: 'onlyOther'; count: number } | { kind: 'best'; island: Island; count: number };

export function categoriesOf(work: AtlasWork, mode: IslandMode): { id: string; label: string | null }[] {
  if (mode === 'type') return [{ id: work.itemType, label: null }];
  if (mode === 'genre') return [...new Set(work.genres.filter(Boolean))].map(genre => ({ id: `g:${genre}`, label: genre }));
  const role = work.itemType === 'book' ? 'author' : work.itemType === 'movie' ? 'director' : null;
  return role ? work.creators.filter(creator => creator.role === role && creator.id && creator.name)
    .map(creator => ({ id: `c:${creator.id}`, label: creator.name })) : [];
}

export function layoutIslands(people: AtlasPerson[], works: AtlasWork[], active: string[], mode: IslandMode, frame?: IslandFrame): IslandsLayout {
  // With two or more faces, only what every selected person has; with one, everything of hers.
  const touching = works.filter(work => comparable(work, active));
  const ranks = new Map<WorkKey, number>(touching.map(work => [work.key,
    workState(work, active).glow ? 0 : work.owners.filter(owner => active.includes(owner.userId)).length > 1 ? 1 : 2]));
  const rank = (work: AtlasWork) => ranks.get(work.key)!;
  const buckets = new Map<string, { label: string | null; works: AtlasWork[] }>();
  for (const work of touching) for (const category of categoriesOf(work, mode)) {
    const bucket = buckets.get(category.id) ?? { label: category.label, works: [] };
    bucket.works.push(work); buckets.set(category.id, bucket);
  }
  const count = (list: AtlasWork[], r: number) => list.filter(work => rank(work) <= r).length;
  let chosen: string[];
  if (mode === 'type') chosen = TYPE_ORDER.filter(type => buckets.has(type));
  else {
    const tally = new Map([...buckets].map(([id, bucket]) => [id, { common: count(bucket.works, 0), shared: count(bucket.works, 1), total: bucket.works.length }]));
    chosen = [...buckets].toSorted(([aId, a], [bId, b]) => { const ta = tally.get(aId)!, tb = tally.get(bId)!;
      return tb.common - ta.common || tb.shared - ta.shared || tb.total - ta.total || (a.label ?? aId).localeCompare(b.label ?? bId) || aId.localeCompare(bId); })
      .slice(0, ISLAND_LIMIT).map(([id]) => id);
  }
  const drawn = new Set(chosen);
  const groups: { id: string; label: string | null; works: AtlasWork[]; otherReasons?: Island['otherReasons'] }[] = chosen.map(id => ({ id, label: buckets.get(id)!.label, works: buckets.get(id)!.works }));
  const rest = touching.filter(work => !categoriesOf(work, mode).some(category => drawn.has(category.id)));
  if (rest.length) {
    const otherReasons = { overflow: 0, missing: 0, unsupported: 0 };
    // Each work contributes once, even if several of its categories fall outside the ten drawn islands.
    for (const work of rest) {
      if (mode === 'creator' && work.itemType === 'series') otherReasons.unsupported++;
      else if (!categoriesOf(work, mode).length) otherReasons.missing++;
      else otherReasons.overflow++;
    }
    groups.push({ id: OTHER_ISLAND, label: null, works: rest, otherReasons });
  }

  const sized = groups.map(group => {
    const keys = group.works.toSorted((a, b) => rank(a) - rank(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map(work => work.key);
    const common = count(group.works, 0), shared = count(group.works, 1);
    const means = people.filter(person => active.includes(person.id)).flatMap(person => {
      const notes = group.works.flatMap(work => { const r = work.owners.find(owner => owner.userId === person.id)?.rating; return r === null || r === undefined ? [] : [r]; });
      return notes.length >= 3 ? [{ userId: person.id, mean: notes.reduce((sum, value) => sum + value, 0) / notes.length, count: notes.length }] : [];
    });
    return { id: group.id, label: group.label, keys, common, shared, means, ...(group.otherReasons ? { otherReasons: group.otherReasons } : {}),
      r: ISLAND_STEP * Math.sqrt(keys.length) + 18, core: common ? ISLAND_STEP * Math.sqrt(common) + 14 : 0 };
  });

  // Shelf packing: rows of ⌈√n⌉ discs, each row centred; rows stacked downwards, whole layout centred on 0.
  const perRow = Math.max(1, Math.ceil(Math.sqrt(sized.length)));
  const rows: (typeof sized)[] = [];
  for (let i = 0; i < sized.length; i += perRow) rows.push(sized.slice(i, i + perRow));
  const islands: Island[] = []; let y = 0;
  for (const row of rows) {
    const height = Math.max(...row.map(item => item.r));
    const width = row.reduce((sum, item) => sum + item.r * 2, 0) + GAP * (row.length - 1);
    let x = -width / 2; y += LABEL_ROOM + height;
    for (const item of row) { islands.push({ ...item, x: x + item.r, y }); x += item.r * 2 + GAP; }
    y += height + GAP / 2;
  }
  const shift = islands.length ? (Math.min(...islands.map(i => i.y - i.r - LABEL_ROOM)) + Math.max(...islands.map(i => i.y + i.r))) / 2 : 0;
  for (const island of islands) island.y -= shift;

  const instances: IslandInstance[] = islands.flatMap(island => island.keys.map((key, index) => {
    const offset = spiral(index, ISLAND_STEP);
    return { key, island: island.id, x: island.x + offset.x, y: island.y + offset.y };
  }));
  const extent = islands.length
    ? { minX: Math.min(...islands.map(i => i.x - i.r)) - 60, maxX: Math.max(...islands.map(i => i.x + i.r)) + 60,
        // The texts above the top row are screen px (they do not scale with the zoom): the engine reserves them
        // as a top inset (islandLabelRoom), so the extent stops at the discs.
        minY: Math.min(...islands.map(i => i.y - i.r)) - 20, maxY: Math.max(...islands.map(i => i.y + i.r)) + 60 }
    : { minX: -300, maxX: 300, minY: -300, maxY: 300 };
  const layout = { mode, islands, instances, extent };
  return frame ? frameIslands(layout, people, frame) : layout;
}

/**
 * Pack before building the scene so discs, hit targets and cross-island links all use the same positions.
 * Try all readable means first. If fixed-size headers cannot fit, the overview progressively shows summary
 * or title only; zooming restores detail as soon as the enlarged row gaps can hold it. The list keeps it all.
 */
function frameIslands(layout: IslandsLayout, people: AtlasPerson[], frame: IslandFrame): IslandsLayout {
  const { viewport: vp, insets } = frame;
  if (!layout.islands.length || vp.width <= 32 || vp.height <= insets.top + insets.bottom + 24) return layout;
  const width = vp.width - 32, height = vp.height - insets.top - insets.bottom - 24;
  const known = new Set(people.map(person => person.id));
  const rooms = layout.islands.map(island => islandHeaderGeometry(island.means.filter(mean => known.has(mean.userId)).length).room);
  type Packing = { rows: Island[][]; headers: number[]; k: number; level: number };
  let best: Packing | null = null;
  // Never squeeze numeric fonts. Each successive level removes detail instead of shrinking its pixel size.
  for (const level of [2, 1, 0]) {
    for (let columns = 1; columns <= layout.islands.length; columns++) {
      const rows: Island[][] = [], headers: number[] = [];
      for (let start = 0; start < layout.islands.length; start += columns) {
        rows.push(layout.islands.slice(start, start + columns));
        headers.push(level === 2 ? Math.max(...rooms.slice(start, start + columns)) : islandHeaderGeometry(0, level > 0).room);
      }
      if (columns * ISLAND_HEADER_WIDTH + (columns - 1) * HEADER_GUTTER > width) continue;
      const discHeight = rows.reduce((sum, row) => sum + Math.max(...row.map(island => island.r * 2)), 0);
      const headerHeight = headers.reduce((sum, room) => sum + room, 0) + (rows.length - 1) * HEADER_GUTTER;
      let k = Math.min(4, (height - headerHeight) / discHeight);
      if (k < MIN_ZOOM) continue;
      const rowWidth = (row: Island[], zoom: number) => row.reduce((sum, island) => sum + Math.max(ISLAND_HEADER_WIDTH, island.r * 2 * zoom), 0) + (row.length - 1) * HEADER_GUTTER;
      if (rows.some(row => rowWidth(row, k) > width)) {
        let low = 0, high = k;
        for (let step = 0; step < 40; step++) {
          const mid = (low + high) / 2;
          if (rows.every(row => rowWidth(row, mid) <= width)) low = mid; else high = mid;
        }
        k = low;
      }
      if (k >= MIN_ZOOM && (!best || k > best.k)) best = { rows, headers, k, level };
    }
    if (best) break;
  }
  if (!best) return layout;
  const { rows, headers, k, level } = best;
  const totalHeight = rows.reduce((sum, row, index) => sum + headers[index] + Math.max(...row.map(island => island.r * 2 * k)), 0) + (rows.length - 1) * HEADER_GUTTER;
  const islands: Island[] = []; let y = -totalHeight / 2;
  rows.forEach((row, index) => {
    const radius = Math.max(...row.map(island => island.r * k));
    const rowWidth = row.reduce((sum, island) => sum + Math.max(ISLAND_HEADER_WIDTH, island.r * 2 * k), 0) + (row.length - 1) * HEADER_GUTTER;
    let x = -rowWidth / 2; y += headers[index] + radius;
    for (const island of row) {
      const cellWidth = Math.max(ISLAND_HEADER_WIDTH, island.r * 2 * k);
      islands.push({ ...island, x: (x + cellWidth / 2) / k, y: y / k }); x += cellWidth + HEADER_GUTTER;
    }
    y += radius + HEADER_GUTTER;
  });
  const moved = new Map(islands.map(island => [island.id, island]));
  const previous = new Map(layout.islands.map(island => [island.id, island]));
  const instances = layout.instances.map(instance => {
    const from = previous.get(instance.island)!, to = moved.get(instance.island)!;
    return { ...instance, x: instance.x + to.x - from.x, y: instance.y + to.y - from.y };
  });
  const baseRoom = level === 2 ? 0 : islandHeaderGeometry(0, level > 0).room;
  return { ...layout, islands, instances,
    extent: { minX: Math.min(...islands.map(island => island.x - Math.max(island.r, ISLAND_HEADER_WIDTH / 2 / k))),
      maxX: Math.max(...islands.map(island => island.x + Math.max(island.r, ISLAND_HEADER_WIDTH / 2 / k))),
      minY: Math.min(...islands.map(island => island.y - island.r)), maxY: Math.max(...islands.map(island => island.y + island.r)) },
    framing: { ...frame, camera: { x: 0, y: -(insets.top - insets.bottom) / 2 / k, k },
      ratingZoom: level === 2 ? k : k * Math.max(...rooms) / baseRoom,
      summaryZoom: level > 0 ? k : k * islandHeaderGeometry(0).room / baseRoom,
      titleZoom: k * islandHeaderGeometry(0, false).room / Math.min(...headers),
      contentKey: JSON.stringify(layout.islands.map(({ id, r, keys, means }) => [id, r, keys, means])) } };
}

export function summarizeIslands(people: AtlasPerson[], layout: IslandsLayout, active: string[]): IslandsSummary {
  if (active.length < 2) return { kind: 'solo', name: people.find(person => active.includes(person.id))?.name ?? '' };
  const best = layout.islands.filter(island => island.id !== OTHER_ISLAND && island.common > 0)
    .toSorted((a, b) => b.common - a.common || b.shared - a.shared || (a.label ?? a.id).localeCompare(b.label ?? b.id))[0];
  if (best) return { kind: 'best', island: best, count: best.common };
  // «Otros» is never the best island, but when it holds everything in common, «nothing in common» would contradict it.
  const other = layout.islands.find(island => island.id === OTHER_ISLAND)?.common ?? 0;
  return other > 0 ? { kind: 'onlyOther', count: other } : { kind: 'none' };
}
