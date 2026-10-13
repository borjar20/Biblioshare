import { workState } from './layout';
import type { AtlasPerson, AtlasWork } from './types';

export type AtlasSummary = { kind: 'solo'; count: number; name: string } | { kind: 'common'; count: number; names: string[] };

/** Counts exactly what the Quién lens highlights. */
export function summarizeQuien(people: AtlasPerson[], works: AtlasWork[], active: string[]): AtlasSummary {
  const names = people.filter(person => active.includes(person.id)).map(person => person.name);
  if (active.length < 2) return { kind: 'solo', name: names[0] ?? '',
    count: works.filter(work => work.owners.some(owner => owner.userId === active[0])).length };
  return { kind: 'common', names, count: works.filter(work => workState(work, active).glow).length };
}
