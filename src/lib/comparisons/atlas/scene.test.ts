import { describe, expect, it } from 'vitest';
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork } from './types';
import { layoutQuien } from './layout';
import { layoutOpinion, OPINION_EXTENT } from './opinion';
import { buildScene } from './scene';

const person = (id: string, isMe = false): AtlasPerson => ({ id, name: id, avatarUrl: null, color: '#000000', isMe });
const people = [person('me', true), person('b')];
const work = (key: string, ratings: Record<string, number | null>): AtlasWork => ({ key: key as WorkKey, itemType: 'book', itemId: key.split(':')[1],
  title: key, metadataMissing: false, coverUrl: null, genres: [], creators: [],
  owners: Object.entries(ratings).map(([userId, rating]) => ({ userId, rating, date: null })) });
const works = [work('book:1', { me: 8, b: 8 }), work('book:2', { me: null, b: 5 }), work('book:3', { b: 2 })];
const quien = layoutQuien(people, works);
const opinion = layoutOpinion(people, works, ['me', 'b']);

describe('buildScene', () => {
  it('Quién: posiciones y estado de F1, sin diferencia', () => {
    const scene = buildScene('quien', works, ['me', 'b'], quien, opinion);
    expect(scene.extent).toEqual(quien.extent);
    expect(scene.targets.get('book:1' as WorkKey)).toEqual({ ...quien.positions.get('book:1' as WorkKey)!, alpha: 1, glow: true, diff: null });
    expect(scene.targets.get('book:3' as WorkKey)).toMatchObject({ alpha: 1, glow: false, diff: null });
  });
  it('Opinión: lo comparable a su sitio con su diferencia; el resto se desvanece en su sitio de Quién', () => {
    const scene = buildScene('opinion', works, ['me', 'b'], quien, opinion);
    expect(scene.extent).toEqual(OPINION_EXTENT);
    expect(scene.targets.get('book:1' as WorkKey)).toMatchObject({ alpha: 1, glow: false, diff: 0 });
    expect(scene.targets.get('book:2' as WorkKey)).toEqual({ ...quien.positions.get('book:2' as WorkKey)!, alpha: 0, glow: false, diff: null });
    expect(scene.targets.size).toBe(3);
  });
});
