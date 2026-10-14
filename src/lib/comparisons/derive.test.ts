import { describe, expect, it } from 'vitest';
import { regions } from './derive';
import type { CatalogWork, PersonWork, Snapshot, WorkKey } from './types';

function work(userId: string, key: WorkKey, rating: number | null = null): PersonWork {
  return { userId, key, rating, date: null, orderUnknown: false, progress: null };
}

function catalog(key: WorkKey, title: string, genres: string[] = [],
  creators: CatalogWork['creators'] = []): CatalogWork {
  return { key, title, coverUrl: null, genres, creators };
}

function snapshot(works: PersonWork[], catalogWorks: CatalogWork[] = [],
  ids = ['a', 'b', 'c']): Snapshot {
  return {
    group: { id: 'g', name: 'Friends', revision: 1, members: ids.map((userId) => ({
      slotId: userId, userId, name: userId, avatarUrl: null, available: true,
    })) },
    format: 'all', works, catalog: catalogWorks, excludedSeriesWithoutEpisodes: 0,
  };
}

describe('regions', () => {
  it('assigns each work to one exact mask and includes empty regions', () => {
    const data = snapshot([
      work('a', 'book:x', 8), work('a', 'book:y'),
      work('b', 'book:x'), work('b', 'book:z', 7),
      work('c', 'book:x', null),
    ]);
    expect(regions(data, ['a', 'b', 'c'])).toEqual([
      { mask: 1, people: ['a'], keys: ['book:y'] },
      { mask: 2, people: ['b'], keys: ['book:z'] },
      { mask: 3, people: ['a', 'b'], keys: [] },
      { mask: 4, people: ['c'], keys: [] },
      { mask: 5, people: ['a', 'c'], keys: [] },
      { mask: 6, people: ['b', 'c'], keys: [] },
      { mask: 7, people: ['a', 'b', 'c'], keys: ['book:x'] },
    ]);
  });

  it('uses caller order and media-qualified keys, with stable title/key ordering', () => {
    const data = snapshot([
      work('a', 'book:same'), work('b', 'book:same'),
      work('a', 'movie:same'), work('b', 'movie:same'),
      work('a', 'book:last'), work('b', 'book:last'),
    ], [
      catalog('book:same', 'Alpha'), catalog('movie:same', 'Alpha'),
      catalog('book:last', 'Zulu'),
    ]);
    expect(regions(data, ['b', 'a'])).toEqual([
      { mask: 1, people: ['b'], keys: [] },
      { mask: 2, people: ['a'], keys: [] },
      { mask: 3, people: ['b', 'a'], keys: ['book:same', 'movie:same', 'book:last'] },
    ]);
  });

  it('rejects invalid or unavailable Venn participants', () => {
    const data = snapshot([]);
    for (const ids of [[], ['a'], ['a', 'a'], ['a', 'missing'], ['a', 'b', 'c', 'd']]) {
      expect(() => regions(data, ids)).toThrow();
    }
    data.group.members[1].available = false;
    expect(() => regions(data, ['a', 'b'])).toThrow();
    expect(regions(data, ['a', 'c'])).toHaveLength(3);
  });

  it('returns every empty mask when no works are consumed', () => {
    expect(regions(snapshot([]), ['a', 'b']).map(({ mask, keys }) => ({ mask, keys })))
      .toEqual([{ mask: 1, keys: [] }, { mask: 2, keys: [] }, { mask: 3, keys: [] }]);
  });
});
