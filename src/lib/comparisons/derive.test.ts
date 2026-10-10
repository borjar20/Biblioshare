import { describe, expect, it } from 'vitest';
import { facets, findings, regions } from './derive';
import type { CatalogWork, PersonWork, Snapshot, WorkKey } from './types';

function work(userId: string, key: WorkKey, rating: number | null = null): PersonWork {
  return { userId, key, rating, orderUnknown: false, progress: null };
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

describe('findings', () => {
  it('a single recorded note cannot make a shared concrete finding', () => {
    const data = snapshot([work('a', 'book:one', 9)], [catalog('book:one', 'One')]);
    expect(findings(data, ['a', 'b'])).toEqual([]);
  });

  it.each([
    { notes: [8, 8], kinds: ['loved', 'similar'] },
    { notes: [2, 3], kinds: ['similar'] },
    { notes: [5, 8], kinds: ['different'] },
    { notes: [5, 7], kinds: [] },
    { notes: [8, null], kinds: [] },
  ])('classifies $notes using inclusive boundaries', ({ notes, kinds }) => {
    const data = snapshot([work('a', 'book:x', notes[0]), work('b', 'book:x', notes[1])],
      [catalog('book:x', 'X')]);
    expect(findings(data, ['a', 'b']).map(({ kind }) => kind)).toEqual(kinds);
  });

  it('requires a note from every named person and keeps their order', () => {
    const data = snapshot([
      work('a', 'book:x', 8), work('b', 'book:x', 8), work('c', 'book:x', null),
      work('a', 'book:y', 8), work('b', 'book:y', 8),
    ]);
    expect(findings(data, ['b', 'a'])).toEqual([
      { key: 'book:x', people: ['b', 'a'], notes: [8, 8], kind: 'loved' },
      { key: 'book:x', people: ['b', 'a'], notes: [8, 8], kind: 'similar' },
      { key: 'book:y', people: ['b', 'a'], notes: [8, 8], kind: 'loved' },
      { key: 'book:y', people: ['b', 'a'], notes: [8, 8], kind: 'similar' },
    ]);
    expect(findings(data, ['a', 'b', 'c'])).toEqual([]);
  });

  it('sorts findings by title then key and works with more than three people', () => {
    const data = snapshot(['book:z', 'movie:z', 'book:a'].flatMap((key) =>
      ['a', 'b', 'c', 'd'].map((userId) => work(userId, key as WorkKey, 9))), [
      catalog('book:z', 'Alpha'), catalog('movie:z', 'Alpha'), catalog('book:a', 'Zulu'),
    ], ['a', 'b', 'c', 'd']);
    expect(findings(data, ['a', 'b', 'c', 'd']).filter((item) => item.kind === 'loved')
      .map((item) => item.key)).toEqual(['book:z', 'movie:z', 'book:a']);
  });

  it('rejects duplicate and unavailable group participants', () => {
    const data = snapshot([]);
    expect(() => findings(data, ['a', 'a'])).toThrow();
    expect(() => findings(data, ['a', 'missing'])).toThrow();
  });
});

describe('facets', () => {
  it('keeps exact two-versus-three unique rated bases without hiding their means', () => {
    const keys = ['book:one', 'book:two', 'book:three'] as WorkKey[];
    const data = snapshot([
      work('a', keys[0], 6), work('a', keys[1], 8), work('a', keys[1], 8),
      work('a', keys[2]), ...keys.map(key => work('b', key, 9)),
    ], keys.map((key, index) => catalog(key, String(index), ['Drama', 'Drama'])));
    expect(facets(data, ['a', 'b'], 'genre')[0].people).toEqual([
      { userId: 'a', consumed: keys, rated: keys.slice(0, 2), mean: 7, min: 6, max: 8, eligibleTotal: 3 },
      { userId: 'b', consumed: keys, rated: keys, mean: 9, min: 9, max: 9, eligibleTotal: 3 },
    ]);
  });

  it('counts distinct consumed works, keeps unrated members and small sample means', () => {
    const keys = ['book:one', 'book:two', 'movie:three', 'series:four'] as WorkKey[];
    const data = snapshot([
      ...keys.map((key, index) => work('a', key, index < 3 ? 8 : null)),
      ...keys.map((key) => work('b', key, null)),
    ], keys.map((key, index) => catalog(key, String(index), ['Mystery', 'Mystery'])));
    expect(facets(data, ['a', 'b'], 'genre')).toEqual([{
      id: 'Mystery', label: 'Mystery', people: [
        { userId: 'a', consumed: keys, rated: keys.slice(0, 3), mean: 8,
          min: 8, max: 8, eligibleTotal: 4 },
        { userId: 'b', consumed: keys, rated: [], mean: null,
          min: null, max: null, eligibleTotal: 4 },
      ],
    }]);
  });

  it('separates overlapping genres and never averages person means', () => {
    const data = snapshot([
      work('a', 'book:one', 2), work('a', 'book:two', 4),
      work('b', 'book:one', 10),
    ], [
      catalog('book:one', 'One', ['Drama', 'Mystery']),
      catalog('book:two', 'Two', ['Drama']),
    ]);
    const result = facets(data, ['a', 'b'], 'genre');
    expect(result.map(({ id }) => id)).toEqual(['Drama', 'Mystery']);
    expect(result[0].people).toMatchObject([
      { userId: 'a', consumed: ['book:one', 'book:two'], rated: ['book:one', 'book:two'],
        mean: 3, min: 2, max: 4, eligibleTotal: 2 },
      { userId: 'b', consumed: ['book:one'], rated: ['book:one'],
        mean: 10, min: 10, max: 10, eligibleTotal: 1 },
    ]);
    expect(result[1].people).toMatchObject([
      { userId: 'a', consumed: ['book:one'], mean: 2 },
      { userId: 'b', consumed: ['book:one'], mean: 10 },
    ]);
  });

  it('uses creator identity and role, not shared names or generic creator credits', () => {
    const data = snapshot([
      work('a', 'book:one', 7), work('b', 'book:two', 9),
      work('a', 'movie:one', 5), work('b', 'movie:one', 8),
    ], [
      catalog('book:one', 'A', [], [{ id: 'author-1', name: 'Alex', role: 'author' }]),
      catalog('book:two', 'B', [], [{ id: 'author-2', name: 'Alex', role: 'author' }]),
      catalog('movie:one', 'C', [], [{ id: 'generic', name: 'Sam', role: 'creator' } as unknown as CatalogWork['creators'][number],
        { id: 'director-1', name: 'Sam', role: 'director' }]),
    ]);
    expect(facets(data, ['a', 'b'], 'author').map(({ id, label }) => ({ id, label })))
      .toEqual([{ id: 'author-1', label: 'Alex' }, { id: 'author-2', label: 'Alex' }]);
    expect(facets(data, ['a', 'b'], 'director').map(({ id }) => id)).toEqual(['director-1']);
  });

  it('orders category evidence by the requested consumption or valuation signal', () => {
    const data = snapshot([
      work('a', 'book:seen-a'), work('b', 'book:seen-b'),
      work('a', 'book:rated', 8), work('b', 'book:rated', 9),
    ], [
      catalog('book:seen-a', 'A', ['Absence']), catalog('book:seen-b', 'B', ['Absence']),
      catalog('book:rated', 'C', ['Rated']),
    ]);
    expect(facets(data, ['a', 'b'], 'genre').map(({ id }) => id)).toEqual(['Absence', 'Rated']);
    expect(facets(data, ['a', 'b'], 'genre', 'consumed').map(({ id }) => id))
      .toEqual(['Absence', 'Rated']);
    expect(facets(data, ['a', 'b'], 'genre', 'rated').map(({ id }) => id))
      .toEqual(['Rated', 'Absence']);
  });

  it('uses every eligible work as the consumption denominator, including absent metadata', () => {
    const data = snapshot([
      work('a', 'book:mystery', 8), work('a', 'book:drama', 7),
      work('a', 'book:uncatalogued', 9), work('b', 'movie:uncatalogued'),
    ], [
      catalog('book:mystery', 'Mystery', ['Mystery']),
      catalog('book:drama', 'Drama', ['Drama']),
    ]);
    expect(facets(data, ['a', 'b'], 'genre').find(({ id }) => id === 'Mystery')?.people)
      .toMatchObject([
        { userId: 'a', consumed: ['book:mystery'], eligibleTotal: 3 },
        { userId: 'b', consumed: [], eligibleTotal: 1 },
      ]);
  });

  it('ignores absent metadata and returns no facets for empty sets', () => {
    expect(facets(snapshot([work('a', 'book:missing', 8)]), ['a', 'b'], 'genre')).toEqual([]);
    expect(facets(snapshot([], [catalog('book:unused', 'Unused', ['Drama'])]), ['a', 'b'], 'genre'))
      .toEqual([]);
  });
});
