import type { WorkKey } from '../types';
import type { Lens, SceneLayouts } from './scene';
import type { AtlasWork } from './types';

export type ListHeading = { kind: 'owners'; ids: string[] } | { kind: 'island'; islandId: string } | { kind: 'plain' };
export type ListSection = { id: string; heading: ListHeading; keys: WorkKey[] };

const byKey = (a: WorkKey, b: WorkKey) => a < b ? -1 : a > b ? 1 : 0;

/**
 * «Ver como lista» (spec §7): what each lens draws, as ordered sections. It only reads the layouts the view already
 * computed, so the list and the canvas never disagree. Works that touch no active face are left out in every lens.
 */
export function listSections(lens: Lens, works: AtlasWork[], active: string[], layouts: SceneLayouts): ListSection[] {
  const touching = new Set(works.filter(work => work.owners.some(owner => active.includes(owner.userId))).map(work => work.key));
  const keep = (keys: WorkKey[]) => keys.filter(key => touching.has(key));
  if (lens === 'quien') {
    // Common to every active face first, then by active owners and by size; the spiral order inside each group.
    const rank = (owners: string[]) => {
      const on = owners.filter(id => active.includes(id)).length;
      return { common: on === active.length ? 1 : 0, exact: on === active.length && owners.length === active.length ? 1 : 0, on };
    };
    return layouts.quien.clusters.map(cluster => ({ cluster, rank: rank(cluster.owners), keys: keep(cluster.keys) }))
      .filter(item => item.rank.on > 0 && item.keys.length > 0)
      .toSorted((a, b) => b.rank.common - a.rank.common || b.rank.exact - a.rank.exact || b.rank.on - a.rank.on
        || b.keys.length - a.keys.length || (a.cluster.id < b.cluster.id ? -1 : a.cluster.id > b.cluster.id ? 1 : 0))
      .map(({ cluster, keys }): ListSection => ({ id: `owners:${cluster.id}`, heading: { kind: 'owners', ids: cluster.owners }, keys }));
  }
  if (lens === 'islas') return layouts.islas.islands.map((island): ListSection => ({ id: `island:${island.id}`, heading: { kind: 'island', islandId: island.id }, keys: keep(island.keys) }))
    .filter(section => section.keys.length > 0);
  const keys = lens === 'opinion'
    ? [...layouts.opinion.positions].toSorted(([ka, a], [kb, b]) => b.diff - a.diff || byKey(ka, kb)).map(([key]) => key)
    : [...firstYears(layouts.tiempo.instances)].toSorted(([ka, a], [kb, b]) => a - b || byKey(ka, kb)).map(([key]) => key);
  const kept = keep(keys);
  return kept.length ? [{ id: lens, heading: { kind: 'plain' }, keys: kept }] : [];
}

/** Earliest active appearance (fractional year) per work in Tiempo; undated works have no instance. */
export function firstYears(instances: SceneLayouts['tiempo']['instances']): Map<WorkKey, number> {
  const first = new Map<WorkKey, number>();
  for (const item of instances) first.set(item.key, Math.min(first.get(item.key) ?? Infinity, item.year));
  return first;
}
