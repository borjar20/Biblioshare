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
    // One section per set of ACTIVE owners (with a face off, {a,b} and {a,b,c} read the same): the set shared by every
    // active face first, then by active owners and by size. Inside, the exact group first, each in its spiral order.
    const groups = new Map<string, { ids: string[]; parts: { exact: boolean; keys: WorkKey[] }[] }>();
    for (const cluster of layouts.quien.clusters) {
      const ids = cluster.owners.filter(id => active.includes(id)), keys = keep(cluster.keys);
      if (!ids.length || !keys.length) continue;
      const group = groups.get(ids.join(',')) ?? { ids, parts: [] };
      group.parts.push({ exact: ids.length === cluster.owners.length, keys }); groups.set(ids.join(','), group);
    }
    return [...groups].map(([id, { ids, parts }]) => ({ id, ids,
      keys: parts.toSorted((a, b) => Number(b.exact) - Number(a.exact) || b.keys.length - a.keys.length).flatMap(part => part.keys) }))
      .toSorted((a, b) => Number(b.ids.length === active.length) - Number(a.ids.length === active.length) || b.ids.length - a.ids.length
        || b.keys.length - a.keys.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(({ id, ids, keys }): ListSection => ({ id: `owners:${id}`, heading: { kind: 'owners', ids }, keys }));
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
