import { describe, expect, it } from 'vitest';
import type { WorkKey } from '@/lib/comparisons/types';
import type { AtlasPerson, AtlasWork } from '@/lib/comparisons/atlas/types';
import { layoutOpinion } from '@/lib/comparisons/atlas/opinion';
import { layoutIslands, OTHER_ISLAND, type Island, type IslandMode } from '@/lib/comparisons/atlas/islands';
import type { Lens } from '@/lib/comparisons/atlas/scene';
import messages from '../../../../messages/es.json';
import { summaryMessage } from './atlas-summary-message';

const person = (id: string, name: string, isMe = false): AtlasPerson => ({ id, name, avatarUrl: null, color: '#000000', isMe });
const people = [person('me', 'Tú', true), person('b', 'Bea'), person('c', 'Carla'), person('d', 'Dani')];
const work = (key: string, ratings: Record<string, number | null>): AtlasWork => ({ key: key as WorkKey, itemType: 'book', itemId: key.split(':')[1],
  title: key, metadataMissing: false, coverUrl: null, genres: [], creators: [],
  owners: Object.entries(ratings).map(([userId, rating]) => ({ userId, rating, date: null })) });
const list = new Intl.ListFormat('es', { type: 'conjunction' });
// Same rule as the view: «Otros», the type names from `formats`, or the category label.
const formats: Record<string, string> = messages.comparisons.formats;
const islandTitle = (island: Island) => island.id === OTHER_ISLAND ? messages.comparisons.atlas.islas.other : formats[island.id] ?? island.label ?? '';
const message = (lens: Lens, works: AtlasWork[], active: string[], mode: IslandMode = 'type') =>
  summaryMessage(lens, people, works, active, { opinion: layoutOpinion(people, works, active), islas: layoutIslands(people, works, active, mode) }, list, islandTitle);
const dated = (key: string, dates: Record<string, string | null>, genres: string[] = []): AtlasWork => ({ ...work(key, Object.fromEntries(Object.keys(dates).map(id => [id, null]))),
  genres, owners: Object.entries(dates).map(([userId, date]) => ({ userId, rating: null, date })) });

describe('summaryMessage', () => {
  const works = [work('book:1', { me: 9, b: 9, c: 8 }), work('book:2', { me: 9, b: 4 }), work('book:3', { b: 5 })];
  it('Quién: solo, común con nombres y común con muchas personas', () => {
    expect(message('quien', works, ['b'])).toEqual({ key: 'atlas.summary.solo', values: { count: 3, name: 'Bea' } });
    expect(message('quien', works, ['me', 'b'])).toEqual({ key: 'atlas.summary.common', values: { count: 2, names: 'Tú y Bea' } });
    expect(message('quien', works, ['me', 'b', 'c', 'd'])).toEqual({ key: 'atlas.summary.commonMany', values: { count: 0, people: 4 } });
  });
  it('Opinión: pide dos caras, avisa si no hay notas y cuenta con o sin Tú', () => {
    expect(message('opinion', works, ['b'])).toEqual({ key: 'atlas.opinion.needsTwo', values: {} });
    expect(message('opinion', works, ['c', 'd'])).toEqual({ key: 'atlas.opinion.empty', values: { isMe: 'false', ref: 'Carla' } });
    // book:1 → 9 vs mean(9, 8) = 8.5, agree; book:2 → 9 vs 4, clash
    expect(message('opinion', works, ['me', 'b', 'c'])).toEqual({ key: 'atlas.opinion.counts', values: { agree: 1, clash: 1, total: 2, ref: 'Tú' } });
    // Bea as reference: book:1 → 9 vs 8, agree; book:2 has no other active rating
    expect(message('opinion', works, ['b', 'c'])).toEqual({ key: 'atlas.opinion.countsWithRef', values: { agree: 1, clash: 0, total: 1, ref: 'Bea' } });
  });
  it('Tiempo: cuenta quién llegó primero, avisa de lo que no tiene fecha y sin Tú nombra las vías', () => {
    const first = dated('book:1', { me: '2020-01-01', b: '2021-05-01' });
    const later = dated('book:2', { me: '2022-01-01', b: '2021-05-01' });
    const undated = dated('book:3', { me: '2020-01-01', b: null });
    expect(message('tiempo', [first, later], ['me', 'b'])).toEqual({ key: 'atlas.tiempo.first', values: { first: 1, total: 2 } });
    expect(message('tiempo', [first, later, undated], ['me', 'b'])).toEqual({ key: 'atlas.tiempo.firstUndated', values: { first: 1, total: 2, undated: 1 } });
    expect(message('tiempo', [first, later], ['b', 'c'])).toEqual({ key: 'atlas.tiempo.lanes', values: { names: 'Bea y Carla' } });
  });
  it('Islas: la mejor isla con su título (tipo o género), ninguna en común y una sola cara', () => {
    const shared = dated('book:1', { me: null, b: null }, ['Drama']);
    const mine = dated('movie:2', { me: null }, ['Comedia']);
    expect(message('islas', [shared, mine], ['me', 'b'])).toEqual({ key: 'atlas.islas.best', values: { label: 'Libros', count: 1 } });
    expect(message('islas', [shared, mine], ['me', 'b'], 'genre')).toEqual({ key: 'atlas.islas.best', values: { label: 'Drama', count: 1 } });
    expect(message('islas', [mine], ['me', 'b'])).toEqual({ key: 'atlas.islas.none', values: {} });
    expect(message('islas', [shared, mine], ['b'])).toEqual({ key: 'atlas.islas.solo', values: { name: 'Bea' } });
  });
});
