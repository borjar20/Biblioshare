import type { WorkKey } from '../types';
import { comparable, spiral, workState } from './layout';
import type { AtlasPerson, AtlasWork, Extent, Point } from './types';

export type IslandMode = 'type' | 'genre' | 'creator';
export const ISLAND_LIMIT = 10;
export const ISLAND_STEP = 11;
export const OTHER_ISLAND = 'other';
const TYPE_ORDER = ['book', 'movie', 'series'] as const;
const GAP = 160;          // between island discs
const LABEL_ROOM = 110;   // world gap between rows for the next row's title + «n en común» + means strip

export type Island = Point & { id: string; label: string | null; r: number; core: number; keys: WorkKey[]; common: number; shared: number; means: { userId: string; mean: number }[] };
export type IslandInstance = Point & { key: WorkKey; island: string };
export type IslandsLayout = { mode: IslandMode; islands: Island[]; instances: IslandInstance[]; extent: Extent };
export type IslandsSummary = { kind: 'solo'; name: string } | { kind: 'none' } | { kind: 'onlyOther'; count: number } | { kind: 'best'; island: Island; count: number };

export function categoriesOf(work: AtlasWork, mode: IslandMode): { id: string; label: string | null }[] {
  if (mode === 'type') return [{ id: work.itemType, label: null }];
  if (mode === 'genre') return [...new Set(work.genres.filter(Boolean))].map(genre => ({ id: `g:${genre}`, label: genre }));
  const role = work.itemType === 'book' ? 'author' : work.itemType === 'movie' ? 'director' : null;
  return role ? work.creators.filter(creator => creator.role === role && creator.id && creator.name)
    .map(creator => ({ id: `c:${creator.id}`, label: creator.name })) : [];
}

export function layoutIslands(people: AtlasPerson[], works: AtlasWork[], active: string[], mode: IslandMode): IslandsLayout {
  // With two or more faces, only what at least two of them share; with one, everything of hers.
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
  const groups: { id: string; label: string | null; works: AtlasWork[] }[] = chosen.map(id => ({ id, label: buckets.get(id)!.label, works: buckets.get(id)!.works }));
  const rest = touching.filter(work => !categoriesOf(work, mode).some(category => drawn.has(category.id)));
  if (rest.length) groups.push({ id: OTHER_ISLAND, label: null, works: rest });

  const sized = groups.map(group => {
    const keys = group.works.toSorted((a, b) => rank(a) - rank(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map(work => work.key);
    const common = count(group.works, 0), shared = count(group.works, 1);
    const means = people.filter(person => active.includes(person.id)).flatMap(person => {
      const notes = group.works.flatMap(work => { const r = work.owners.find(owner => owner.userId === person.id)?.rating; return r === null || r === undefined ? [] : [r]; });
      return notes.length >= 3 ? [{ userId: person.id, mean: notes.reduce((sum, value) => sum + value, 0) / notes.length }] : [];
    });
    return { id: group.id, label: group.label, keys, common, shared, means,
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
  return { mode, islands, instances, extent };
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
