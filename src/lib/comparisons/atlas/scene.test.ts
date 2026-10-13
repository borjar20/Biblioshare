import { describe, expect, it } from 'vitest';
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork } from './types';
import { layoutQuien } from './layout';
import { layoutOpinion, OPINION_EXTENT } from './opinion';
import { layoutTiempo } from './tiempo';
import { layoutIslands, type IslandMode } from './islands';
import { buildScene } from './scene';

const person = (id: string, isMe = false): AtlasPerson => ({ id, name: id, avatarUrl: null, color: '#000000', isMe });
const people = [person('me', true), person('b')];
type Opt = { dates?: Record<string, string | null>; genres?: string[] };
const work = (key: string, ratings: Record<string, number | null>, opt: Opt = {}): AtlasWork => ({ key: key as WorkKey, itemType: 'book', itemId: key.split(':')[1],
  title: key, metadataMissing: false, coverUrl: null, genres: opt.genres ?? [], creators: [],
  owners: Object.entries(ratings).map(([userId, rating]) => ({ userId, rating, date: opt.dates?.[userId] ?? null })) });
const works = [work('book:1', { me: 8, b: 8 }), work('book:2', { me: null, b: 5 }), work('book:3', { b: 2 })];
const layoutsFor = (list: AtlasWork[], active: string[], mode: IslandMode = 'type') => ({
  quien: layoutQuien(people, list), opinion: layoutOpinion(people, list, active),
  tiempo: layoutTiempo(people, list, active), islas: layoutIslands(people, list, active, mode) });
const layouts = layoutsFor(works, ['me', 'b']);
const { quien } = layouts;
// book:1 owned by me and b with dates; book:2 owned by b only, no date.
const datedWorks = [work('book:1', { me: 8, b: 7 }, { dates: { me: '2024-03-01', b: '2025-06-10' } }), work('book:2', { b: 5 })];
// Drama: book:1 (also SF) and book:2, both shared by everyone; SF: book:1 only.
const genreWorks = [work('book:1', { me: 8, b: 8 }, { genres: ['Drama', 'SF'] }), work('book:2', { me: 6, b: 6 }, { genres: ['Drama'] })];

describe('buildScene', () => {
  it('Quién: posiciones y estado de F1, sin diferencia', () => {
    const scene = buildScene('quien', works, ['me', 'b'], layouts);
    expect(scene.extent).toEqual(quien.extent);
    expect(scene.targets.get('book:1')).toEqual({ ...quien.positions.get('book:1' as WorkKey)!, key: 'book:1', alpha: 1, glow: true, diff: null });
    expect(scene.targets.get('book:3')).toMatchObject({ alpha: 1, glow: false, diff: null });
  });
  it('Opinión: lo comparable a su sitio con su diferencia; el resto se desvanece en su sitio de Quién', () => {
    const scene = buildScene('opinion', works, ['me', 'b'], layouts);
    expect(scene.extent).toEqual(OPINION_EXTENT);
    expect(scene.targets.get('book:1')).toMatchObject({ alpha: 1, glow: false, diff: 0 });
    expect(scene.targets.get('book:2')).toEqual({ ...quien.positions.get('book:2' as WorkKey)!, key: 'book:2', alpha: 0, glow: false, diff: null });
    expect(scene.targets.size).toBe(3);
  });
  it('Tiempo: la primera aparición usa la clave; las demás clave@persona; un hilo las une; lo que no tiene fecha se desvanece en casa', () => {
    const scene = buildScene('tiempo', datedWorks, ['me', 'b'], layoutsFor(datedWorks, ['me', 'b']));
    expect([...scene.targets.keys()].toSorted()).toEqual(['book:1', 'book:1@b', 'book:2']);
    expect(scene.targets.get('book:2')).toMatchObject({ key: 'book:2', alpha: 0 });
    expect(scene.links).toEqual([['book:1', 'book:1@b']]);
  });
  it('Islas: una aparición por isla dibujada, unidas por un hilo', () => {
    const scene = buildScene('islas', genreWorks, ['me', 'b'], layoutsFor(genreWorks, ['me', 'b'], 'genre'));
    expect(scene.links).toEqual([['book:1', 'book:1#g:SF']]);   // book:1 is Drama + SF; Drama island comes first
    expect(scene.targets.get('book:1#g:SF')).toMatchObject({ key: 'book:1', alpha: 1 });
  });
  it('Quién y Opinión siguen igual con la clave como id y sin hilos', () => {
    const scene = buildScene('quien', datedWorks, ['me', 'b'], layoutsFor(datedWorks, ['me', 'b']));
    expect(scene.links).toEqual([]);
    expect(scene.targets.get('book:1')).toMatchObject({ key: 'book:1' });
  });
});
