import type { CatalogWork, Format, PersonWork, Region, Snapshot, WorkKey } from './types';

function validatePeople(snapshot: Snapshot, people: string[], max: number): void {
  const available = new Set(snapshot.group.members
    .filter((member) => member.available && member.userId !== null)
    .map((member) => member.userId));
  if (people.length < 2 || people.length > max || new Set(people).size !== people.length ||
    people.some((userId) => !available.has(userId))) {
    throw new RangeError(`Expected 2–${max} distinct available participants`);
  }
}

function catalogByKey(snapshot: Snapshot): Map<WorkKey, CatalogWork> {
  return new Map(snapshot.catalog.map((item) => [item.key, item]));
}

function compareKeys(catalog: Map<WorkKey, CatalogWork>, a: WorkKey, b: WorkKey): number {
  return (catalog.get(a)?.title ?? a).localeCompare(catalog.get(b)?.title ?? b) || a.localeCompare(b);
}

function worksByPerson(snapshot: Snapshot, people: string[]): Map<string, Map<WorkKey, PersonWork>> {
  const result = new Map(people.map((userId) => [userId, new Map<WorkKey, PersonWork>()]));
  for (const work of snapshot.works) {
    const owned = result.get(work.userId);
    if (owned && !owned.has(work.key)) owned.set(work.key, work);
  }
  return result;
}

/**
 * The Venn regions of 2–3 people: which works each exact subset shares. No screen uses it
 * since the atlas replaced the old canvas; it stays as the reference implementation that
 * `atlas/layout.test.ts` checks the Quién lens against.
 */
export function regions(snapshot: Snapshot, people: string[]): Region[] {
  validatePeople(snapshot, people, 3);
  const byPerson = worksByPerson(snapshot, people);
  const catalog = catalogByKey(snapshot);
  const allKeys = new Set([...byPerson.values()].flatMap((works) => [...works.keys()]));
  const keysByMask = new Map<number, WorkKey[]>();
  for (const key of allKeys) {
    const mask = people.reduce((bits, userId, index) =>
      bits | (byPerson.get(userId)?.has(key) ? 1 << index : 0), 0);
    const keys = keysByMask.get(mask) ?? [];
    keys.push(key);
    keysByMask.set(mask, keys);
  }
  return Array.from({ length: (1 << people.length) - 1 }, (_, index) => {
    const mask = index + 1;
    return { mask, people: people.filter((_, slot) => mask & (1 << slot)),
      keys: (keysByMask.get(mask) ?? []).toSorted((a, b) => compareKeys(catalog, a, b)) };
  });
}

/**
 * A single-format snapshot from an `all` snapshot. Normalisation groups per person and
 * work, so books and movies come only from their own passes and series only from series
 * passes and episode watches: filtering by key prefix equals asking the server for that
 * format. Only the excluded-series count is format-scoped (0 for books and movies).
 */
export function forFormat(all: Snapshot, format: Format): Snapshot {
  if (all.format !== 'all') throw new RangeError('Formats derive from an all-format snapshot');
  if (format === 'all') return all;
  const inFormat = (key: WorkKey) => key.startsWith(`${format}:`);
  return { group: all.group, format, works: all.works.filter(work => inFormat(work.key)),
    catalog: all.catalog.filter(work => inFormat(work.key)),
    excludedSeriesWithoutEpisodes: format === 'series' ? all.excludedSeriesWithoutEpisodes : 0 };
}
