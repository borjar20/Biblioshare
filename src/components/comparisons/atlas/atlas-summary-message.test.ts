import { describe, expect, it } from 'vitest';
import type { WorkKey } from '@/lib/comparisons/types';
import type { AtlasPerson, AtlasWork } from '@/lib/comparisons/atlas/types';
import { layoutOpinion } from '@/lib/comparisons/atlas/opinion';
import { summaryMessage } from './atlas-summary-message';

const person = (id: string, name: string, isMe = false): AtlasPerson => ({ id, name, avatarUrl: null, color: '#000000', isMe });
const people = [person('me', 'Tú', true), person('b', 'Bea'), person('c', 'Carla'), person('d', 'Dani')];
const work = (key: string, ratings: Record<string, number | null>): AtlasWork => ({ key: key as WorkKey, itemType: 'book', itemId: key.split(':')[1],
  title: key, metadataMissing: false, coverUrl: null, genres: [], creators: [],
  owners: Object.entries(ratings).map(([userId, rating]) => ({ userId, rating, date: null })) });
const list = new Intl.ListFormat('es', { type: 'conjunction' });
const message = (lens: 'quien' | 'opinion', works: AtlasWork[], active: string[]) =>
  summaryMessage(lens, people, works, active, layoutOpinion(people, works, active), list);

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
});
