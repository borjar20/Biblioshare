import type {
  CatalogWork, Facet, FacetKind, Finding, PersonWork, Region, Snapshot, WorkKey,
} from './types';

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

export function findings(snapshot: Snapshot, people: string[]): Finding[] {
  validatePeople(snapshot, people, 10);
  const byPerson = worksByPerson(snapshot, people);
  const catalog = catalogByKey(snapshot);
  const keys = [...new Set([...byPerson.values()].flatMap((works) => [...works.keys()]))]
    .toSorted((a, b) => compareKeys(catalog, a, b));
  const result: Finding[] = [];
  for (const key of keys) {
    const notes = people.map((userId) => byPerson.get(userId)?.get(key)?.rating);
    if (notes.some((note) => note === null || note === undefined)) continue;
    const ratings = notes as number[];
    const min = Math.min(...ratings);
    const max = Math.max(...ratings);
    if (min >= 8) result.push({ key, people: [...people], notes: ratings, kind: 'loved' });
    if (max - min <= 1) result.push({ key, people: [...people], notes: ratings, kind: 'similar' });
    if (max - min >= 3) result.push({ key, people: [...people], notes: ratings, kind: 'different' });
  }
  return result;
}

function facetCategories(work: CatalogWork, kind: FacetKind): { id: string; label: string }[] {
  if (kind === 'genre') return [...new Set(work.genres.filter(Boolean))]
    .map((genre) => ({ id: genre, label: genre }));
  return work.creators.filter((creator) => creator.role === kind && creator.id && creator.name)
    .map((creator) => ({ id: creator.id, label: creator.name }));
}

export function facets(snapshot: Snapshot, people: string[], kind: FacetKind,
  signal: 'consumed' | 'rated' = 'consumed'): Facet[] {
  validatePeople(snapshot, people, 10);
  const catalog = catalogByKey(snapshot);
  const byPerson = worksByPerson(snapshot, people);
  const categories = new Map<string, { label: string; perPerson: Map<string, Map<WorkKey, number | null>> }>();

  for (const userId of people) {
    for (const work of byPerson.get(userId)?.values() ?? []) {
      const metadata = catalog.get(work.key);
      if (!metadata) continue;
      for (const category of facetCategories(metadata, kind)) {
        const item = categories.get(category.id) ?? { label: category.label,
          perPerson: new Map<string, Map<WorkKey, number | null>>() };
        const owned = item.perPerson.get(userId) ?? new Map<WorkKey, number | null>();
        owned.set(work.key, work.rating);
        item.perPerson.set(userId, owned);
        categories.set(category.id, item);
      }
    }
  }

  return [...categories].map(([id, category]): Facet => ({
    id, label: category.label, people: people.map((userId) => {
      const works = category.perPerson.get(userId) ?? new Map<WorkKey, number | null>();
      const consumed = [...works.keys()].toSorted((a, b) => compareKeys(catalog, a, b));
      const rated = consumed.filter((key) => works.get(key) !== null);
      const notes = rated.map((key) => works.get(key) as number);
      return { userId, consumed, rated, mean: notes.length ?
        notes.reduce((sum, note) => sum + note, 0) / notes.length : null,
      min: notes.length ? Math.min(...notes) : null,
      max: notes.length ? Math.max(...notes) : null,
      eligibleTotal: byPerson.get(userId)?.size ?? 0 };
    }),
  })).toSorted((a, b) => {
    const participation = (facet: Facet) => facet.people.filter((person) => person[signal].length > 0).length;
    const minimum = (facet: Facet) => Math.min(...facet.people.map((person) => person[signal].length));
    return participation(b) - participation(a) || minimum(b) - minimum(a) ||
      a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
  });
}
