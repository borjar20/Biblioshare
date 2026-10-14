import { describe, expect, it } from 'vitest';
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork } from './types';
import { layoutQuien } from './layout';
import { layoutOpinion } from './opinion';
import { layoutTiempo } from './tiempo';
import { layoutIslands, type IslandMode } from './islands';
import { listSections } from './list';

const person = (id: string, isMe = false): AtlasPerson => ({ id, name: id, avatarUrl: null, color: '#000000', isMe });
const people = [person('me', true), person('b'), person('c')];
type Opt = { dates?: Record<string, string | null>; genres?: string[] };
const work = (key: string, ratings: Record<string, number | null>, opt: Opt = {}): AtlasWork => ({ key: key as WorkKey, itemType: 'book', itemId: key.split(':')[1],
  title: key, metadataMissing: false, coverUrl: null, genres: opt.genres ?? [], creators: [],
  owners: Object.entries(ratings).map(([userId, rating]) => ({ userId, rating, date: opt.dates?.[userId] ?? null })) });
const layoutsFor = (list: AtlasWork[], active: string[], mode: IslandMode = 'genre') => ({
  quien: layoutQuien(people, list), opinion: layoutOpinion(people, list, active),
  tiempo: layoutTiempo(people, list, active), islas: layoutIslands(people, list, active, mode) });
const sections = (lens: Parameters<typeof listSections>[0], list: AtlasWork[], active: string[]) =>
  listSections(lens, list, active, layoutsFor(list, active));

// me+b share 1 and 2; b alone has 3, 4, 5; me+b+c share 6; c alone has 7.
const works = [work('book:1', { me: 8, b: 3 }), work('book:2', { me: 6, b: 6 }), work('book:3', { b: 2 }), work('book:4', { b: 4 }),
  work('book:5', { b: 5 }), work('book:6', { me: 9, b: 8, c: 1 }), work('book:7', { c: 7 })];

describe('listSections', () => {
  it('Quién: un grupo por conjunto de dueños activos; primero el común, luego por dueños activos y por tamaño', () => {
    const result = sections('quien', works, ['me', 'b']);
    // {me, b} and {me, b, c} read the same with c off: one section, exact group first, each in spiral order.
    expect(result.map(section => section.heading)).toEqual([{ kind: 'owners', ids: ['me', 'b'] }, { kind: 'owners', ids: ['b'] }]);
    expect(result[0].keys).toEqual(['book:1', 'book:2', 'book:6']);
    expect(result[1].keys).toEqual(['book:3', 'book:4', 'book:5']);
    expect(result.flatMap(section => section.keys)).not.toContain('book:7');
  });
  it('Quién: con todas las caras, el grupo de todas va primero aunque sea el más pequeño', () => {
    const result = sections('quien', works, ['me', 'b', 'c']);
    expect(result[0]).toMatchObject({ heading: { kind: 'owners', ids: ['me', 'b', 'c'] }, keys: ['book:6'] });
    expect(result.map(section => section.heading)).toContainEqual({ kind: 'owners', ids: ['c'] });
  });
  it('Opinión: una sección sin encabezado, por diferencia descendente y desempate por clave', () => {
    const result = sections('opinion', works, ['me', 'b']);
    expect(result).toEqual([{ id: 'opinion', heading: { kind: 'plain' }, keys: ['book:1', 'book:6', 'book:2'] }]);
  });
  it('Tiempo: por primera fecha activa; lo que no tiene fecha o no se comparte no entra', () => {
    const dated = [work('book:1', { me: 8, b: 7 }, { dates: { me: '2024-03-01', b: '2020-06-10' } }),
      work('book:2', { me: 5, b: 5 }, { dates: { me: '2022-01-01' } }), work('book:3', { b: 5 }), work('book:4', { c: 5 }, { dates: { c: '2010-01-01' } }),
      work('book:5', { me: 5 }, { dates: { me: '2019-01-01' } })];
    const result = sections('tiempo', dated, ['me', 'b']);
    expect(result).toEqual([{ id: 'tiempo', heading: { kind: 'plain' }, keys: ['book:1', 'book:2'] }]);
  });
  it('Islas: una sección por isla en su orden; una obra en dos islas sale en las dos', () => {
    const genreWorks = [work('book:1', { me: 8, b: 8 }, { genres: ['Drama', 'SF'] }), work('book:2', { me: 6, b: 6 }, { genres: ['Drama'] }),
      work('book:3', { c: 6 }, { genres: ['Terror'] })];
    const active = ['me', 'b'];
    const layouts = layoutsFor(genreWorks, active);
    const result = listSections('islas', genreWorks, active, layouts);
    expect(result.map(section => section.heading)).toEqual(layouts.islas.islands.map(island => ({ kind: 'island', islandId: island.id })));
    expect(result.map(section => section.keys)).toEqual([['book:1', 'book:2'], ['book:1']]);
  });
  it('lo que no toca a ninguna cara activa no aparece en ninguna lente', () => {
    for (const lens of ['quien', 'opinion', 'tiempo', 'islas'] as const)
      expect(sections(lens, works, ['me']).flatMap(section => section.keys)).not.toContain('book:7');
  });
});
