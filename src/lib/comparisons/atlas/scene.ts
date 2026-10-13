import type { WorkKey } from '../types';
import { workState, type QuienLayout } from './layout';
import type { OpinionLayout } from './opinion';
import type { TiempoLayout } from './tiempo';
import type { IslandsLayout } from './islands';
import type { AtlasWork, Extent, Point } from './types';

export type Lens = 'quien' | 'opinion' | 'tiempo' | 'islas';
export type SceneTarget = Point & { key: WorkKey; alpha: number; glow: boolean; diff: number | null };
/**
 * Targets are keyed by sprite id: the work key for its main appearance, `${key}@${userId}` (Tiempo) or
 * `${key}#${islandId}` (Islas) for the extra ones. `links` lists the ids of every appearance of one work.
 */
export type Scene = { lens: Lens; extent: Extent; targets: Map<string, SceneTarget>; links: string[][] };
export type SceneLayouts = { quien: QuienLayout; opinion: OpinionLayout; tiempo: TiempoLayout; islas: IslandsLayout };

/** Where each work goes under a lens. Works a lens leaves out fade at their Quién place instead of vanishing. */
export function buildScene(lens: Lens, works: AtlasWork[], active: string[], layouts: SceneLayouts): Scene {
  const targets = new Map<string, SceneTarget>(); const links: string[][] = [];
  const multi = lens === 'tiempo' ? groupBy(layouts.tiempo.instances, i => i.key, i => `@${i.userId}`)
    : lens === 'islas' ? groupBy(layouts.islas.instances, i => i.key, i => `#${i.island}`) : null;
  for (const work of works) {
    const home = layouts.quien.positions.get(work.key);
    const state = workState(work, active);
    if (lens === 'quien') { if (home) targets.set(work.key, { key: work.key, x: home.x, y: home.y, alpha: state.alpha, glow: state.glow, diff: null }); continue; }
    if (lens === 'opinion') {
      const point = layouts.opinion.positions.get(work.key);
      if (point) targets.set(work.key, { key: work.key, x: point.x, y: point.y, alpha: 1, glow: false, diff: point.diff });
      else if (home) targets.set(work.key, { key: work.key, x: home.x, y: home.y, alpha: 0, glow: false, diff: null });
      continue;
    }
    const places = multi!.get(work.key) ?? [];
    if (!places.length) { if (home) targets.set(work.key, { key: work.key, x: home.x, y: home.y, alpha: 0, glow: false, diff: null }); continue; }
    const ids = places.map((place, index) => index === 0 ? work.key : `${work.key}${place.suffix}`);
    places.forEach((place, index) => targets.set(ids[index], { key: work.key, x: place.x, y: place.y, alpha: 1, glow: state.glow, diff: null }));
    if (ids.length > 1) links.push(ids);
  }
  const extent = lens === 'quien' ? layouts.quien.extent : lens === 'opinion' ? layouts.opinion.extent : lens === 'tiempo' ? layouts.tiempo.extent : layouts.islas.extent;
  return { lens, extent, targets, links };
}

function groupBy<T extends Point>(items: T[], keyOf: (item: T) => WorkKey, suffixOf: (item: T) => string) {
  const map = new Map<WorkKey, (Point & { suffix: string })[]>();
  for (const item of items) { const list = map.get(keyOf(item)) ?? []; list.push({ x: item.x, y: item.y, suffix: suffixOf(item) }); map.set(keyOf(item), list); }
  return map;
}
