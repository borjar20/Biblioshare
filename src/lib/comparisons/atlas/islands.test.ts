import { describe, expect, it } from 'vitest';
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork } from './types';
import { categoriesOf, ISLAND_LIMIT, layoutIslands, OTHER_ISLAND, summarizeIslands } from './islands';

const person = (id: string, isMe = false): AtlasPerson => ({ id, name: isMe ? 'Tú' : id.toUpperCase(), avatarUrl: null, color: '#000000', isMe });
const people = [person('me', true), person('b'), person('c')];
type Opt = { type?: AtlasWork['itemType']; genres?: string[]; creators?: AtlasWork['creators']; ratings?: Record<string, number | null> };
const work = (id: string, owners: string[], opt: Opt = {}): AtlasWork => ({ key: `${opt.type ?? 'book'}:${id}` as WorkKey, itemType: opt.type ?? 'book', itemId: id,
  title: id, metadataMissing: false, coverUrl: null, genres: opt.genres ?? [], creators: opt.creators ?? [],
  owners: owners.map(userId => ({ userId, rating: opt.ratings?.[userId] ?? null, date: null })) });

describe('categoriesOf', () => {
  it('tipo, géneros únicos y autor/director según el tipo; las series no tienen creador', () => {
    const author = { id: 'a1', name: 'Le Guin', role: 'author' as const }, director = { id: 'd1', name: 'Varda', role: 'director' as const };
    expect(categoriesOf(work('1', ['me']), 'type')).toEqual([{ id: 'book', label: null }]);
    expect(categoriesOf(work('1', ['me'], { genres: ['Drama', 'Drama', 'SF'] }), 'genre')).toEqual([{ id: 'g:Drama', label: 'Drama' }, { id: 'g:SF', label: 'SF' }]);
    expect(categoriesOf(work('1', ['me'], { creators: [author, director] }), 'creator')).toEqual([{ id: 'c:a1', label: 'Le Guin' }]);
    expect(categoriesOf(work('2', ['me'], { type: 'movie', creators: [author, director] }), 'creator')).toEqual([{ id: 'c:d1', label: 'Varda' }]);
    expect(categoriesOf(work('3', ['me'], { type: 'series', creators: [director] }), 'creator')).toEqual([]);
  });
});

describe('layoutIslands', () => {
  const works = [
    work('1', ['me', 'b', 'c'], { genres: ['Drama', 'SF'] }),
    work('2', ['me', 'b'], { genres: ['Drama'] }),
    work('3', ['c'], { genres: ['Poesía'] }),
    work('4', ['me'], {}),
    work('5', ['x'], { genres: ['Drama'] }),                        // nobody active owns it
    work('6', ['me', 'b', 'c'], { type: 'movie', genres: ['SF'] }),
  ];
  it('Tipo: islas por tipo no vacías, en orden fijo', () => {
    expect(layoutIslands(people, works, ['me', 'b', 'c'], 'type').islands.map(i => i.id)).toEqual(['book', 'movie']);
  });
  it('Género: una obra en cada isla de sus géneros; sin género va a Otros; lo que no toca a nadie activo no entra', () => {
    const layout = layoutIslands(people, works, ['me', 'b', 'c'], 'genre');
    const byId = new Map(layout.islands.map(i => [i.id, i]));
    expect(byId.get('g:Drama')!.keys.toSorted()).toEqual(['book:1', 'book:2']);
    expect(byId.get('g:SF')!.keys.toSorted()).toEqual(['book:1', 'movie:6']);
    expect(byId.get(OTHER_ISLAND)!.keys).toEqual(['book:4']);
    expect(layout.instances.filter(i => i.key === 'book:1').map(i => i.island).toSorted()).toEqual(['g:Drama', 'g:SF']);
    expect(layout.instances.some(i => i.key === ('book:5' as WorkKey))).toBe(false);
  });
  it('orden por común a todas, luego compartida, luego el resto; núcleo y recuentos', () => {
    const drama = layoutIslands(people, works, ['me', 'b', 'c'], 'genre').islands.find(i => i.id === 'g:Drama')!;
    expect(drama.keys).toEqual(['book:1', 'book:2']);
    expect([drama.common, drama.shared]).toEqual([1, 2]);
    expect(drama.core).toBeGreaterThan(0);
  });
  it('como mucho ISLAND_LIMIT categorías; el resto a Otros', () => {
    const many = Array.from({ length: 12 }, (_, i) => work(`m${i}`, ['me', 'b'], { genres: [`G${String(i).padStart(2, '0')}`] }));
    const layout = layoutIslands(people, many, ['me', 'b'], 'genre');
    expect(layout.islands.filter(i => i.id !== OTHER_ISLAND)).toHaveLength(ISLAND_LIMIT);
    expect(layout.islands.find(i => i.id === OTHER_ISLAND)!.keys).toHaveLength(2);
  });
  it('medias solo con 3 o más obras con nota de esa persona en la isla', () => {
    const rated = [1, 2, 3].map(i => work(`r${i}`, ['me', 'b'], { genres: ['Drama'], ratings: { me: 6 + i, b: i === 1 ? 5 : null } }));
    const drama = layoutIslands(people, rated, ['me', 'b'], 'genre').islands.find(i => i.id === 'g:Drama')!;
    expect(drama.means).toEqual([{ userId: 'me', mean: 8 }]);
  });
  it('el top 10 prioriza las obras comunes a todas: la categoria sin ninguna comun va a Otros', () => {
    const lots = Array.from({ length: 10 }, (_, k) => work(`c${k}`, ['me', 'b'], { genres: [`Z${String(k).padStart(2, '0')}`] }));
    const lone = work('lone', ['me'], { genres: ['AAA'] });
    const layout = layoutIslands(people, [lone, ...lots], ['me', 'b'], 'genre');
    expect(layout.islands.some(i => i.id === 'g:AAA')).toBe(false);
    expect(layout.islands.find(i => i.id === OTHER_ISLAND)!.keys).toEqual(['book:lone']);
  });
  it('dentro de una isla, la comun a todas va antes que una compartida de clave menor', () => {
    const pair = [work('a', ['me', 'b'], { genres: ['Drama'] }), work('z', ['me', 'b', 'c'], { genres: ['Drama'] })];
    const drama = layoutIslands(people, pair, ['me', 'b', 'c'], 'genre').islands.find(i => i.id === 'g:Drama')!;
    expect(drama.keys).toEqual(['book:z', 'book:a']);
  });
  it('las islas no se solapan', () => {
    const { islands } = layoutIslands(people, works, ['me', 'b', 'c'], 'genre');
    for (const a of islands) for (const b of islands) if (a !== b)
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
  });
});

describe('summarizeIslands', () => {
  it('la isla con más en común; con una cara, las islas de esa persona; sin nada en común, lo dice', () => {
    const works = [work('1', ['me', 'b'], { genres: ['Drama'] }), work('2', ['me', 'b'], { genres: ['Drama'] }), work('3', ['me', 'b'], { genres: ['SF'] })];
    const layout = layoutIslands(people, works, ['me', 'b'], 'genre');
    expect(summarizeIslands(people, layout, ['me', 'b'])).toMatchObject({ kind: 'best', count: 2, island: { id: 'g:Drama' } });
    expect(summarizeIslands(people, layoutIslands(people, works, ['b'], 'genre'), ['b'])).toEqual({ kind: 'solo', name: 'B' });
    expect(summarizeIslands(people, layoutIslands(people, [work('9', ['me'])], ['me', 'b'], 'genre'), ['me', 'b'])).toEqual({ kind: 'none' });
  });
});
