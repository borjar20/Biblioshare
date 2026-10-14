import { describe, expect, it } from 'vitest';
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork } from './types';
import { layoutIslands, OTHER_ISLAND, type IslandMode } from './islands';

const people: AtlasPerson[] = ['a', 'b'].map(id => ({ id, name: id, avatarUrl: null, color: '#000', isMe: id === 'a' }));
const author = (id: string, name = id) => ({ id, name, role: 'author' as const });
const work = (id: string, extra: Partial<AtlasWork> = {}): AtlasWork => ({
  key: `book:${id}` as WorkKey, itemId: id, itemType: 'book', title: id, coverUrl: null, metadataMissing: false,
  genres: [], creators: [], owners: people.map(person => ({ userId: person.id, rating: null, date: null })), ...extra,
});
const others = (works: AtlasWork[], mode: IslandMode) => layoutIslands(people, works, ['a', 'b'], mode).islands.find(island => island.id === OTHER_ISLAND);
const top = () => Array.from({ length: 10 }, (_, i) => work(`top${i}`, { creators: [author(`a${i}`)] }));

describe('los motivos de Otros', () => {
  it('un autor identificado fuera de las diez islas cuenta como fuera del top, sin acusar un crédito ausente', () => {
    const other = others([...top(), work('last', { creators: [author('z')] })], 'creator');
    expect(other?.keys).toEqual(['book:last']);
    expect(other?.otherReasons).toEqual({ overflow: 1, missing: 0, unsupported: 0 });
  });

  it('un crédito sin identidad, sin nombre o con otro rol no se sustituye por un nombre libre', () => {
    const other = others([
      work('no-id', { creators: [author('', 'Le Guin')] }),
      work('no-name', { creators: [author('le-guin', '')] }),
      work('wrong-role', { creators: [{ id: 'varda', name: 'Varda', role: 'director' }] }),
    ], 'creator');
    expect(other?.keys).toHaveLength(3);
    expect(other?.otherReasons).toEqual({ overflow: 0, missing: 3, unsupported: 0 });
  });

  it('una serie cuenta como formato sin autor/director modelado aunque incluya un crédito', () => {
    const other = others([work('series', { key: 'series:series', itemType: 'series', creators: [{ id: 'd', name: 'Directora', role: 'director' }] })], 'creator');
    expect(other?.otherReasons).toEqual({ overflow: 0, missing: 0, unsupported: 1 });
  });

  it('con varios autores, basta una isla elegida para que la obra no se pierda en Otros', () => {
    const layout = layoutIslands(people, [...top(), work('both', { creators: [author('a0'), author('z')] })], ['a', 'b'], 'creator');
    expect(layout.islands.find(island => island.id === 'c:a0')?.keys).toContain('book:both');
    expect(layout.islands.find(island => island.id === OTHER_ISLAND)).toBeUndefined();
    expect(layout.islands.every(island => island.otherReasons === undefined)).toBe(true);
  });

  it('una obra con varios créditos descartados cuenta una sola vez y los motivos suman sus obras', () => {
    const other = others([
      ...top(), work('overflow', { creators: [author('z1'), author('z2')] }), work('missing'),
      work('series', { key: 'series:series', itemType: 'series' }),
    ], 'creator');
    expect(other?.keys).toHaveLength(3);
    expect(other?.otherReasons).toEqual({ overflow: 1, missing: 1, unsupported: 1 });
    expect(other?.means).toEqual([]);
  });

  it('por género distingue obras fuera del top de obras sin género y no inventa ceros como obras', () => {
    const genreTop = Array.from({ length: 10 }, (_, i) => work(`top${i}`, { genres: [`A${i}`] }));
    const other = others([...genreTop, work('overflow', { genres: ['Z1', 'Z2'] }), work('missing', { genres: [''] })], 'genre');
    expect(other?.keys).toEqual(['book:missing', 'book:overflow']);
    expect(other?.otherReasons).toEqual({ overflow: 1, missing: 1, unsupported: 0 });
  });
});
