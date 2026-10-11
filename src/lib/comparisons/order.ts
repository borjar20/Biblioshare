import type { Group } from './types';

/** Saved groups read alphabetically; the id breaks ties so the order never depends on reads. */
export function sortGroups(groups: Group[]): Group[] {
  return groups.toSorted((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id));
}
