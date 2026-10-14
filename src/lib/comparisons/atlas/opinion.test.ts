import { describe, expect, it } from 'vitest';
import type { WorkKey } from '../types';
import type { AtlasPerson, AtlasWork } from './types';
import { mixHex } from './color';
import { diffMix, jitter, layoutOpinion, opinionReference, OPINION_EXTENT, ratingX, summarizeOpinion } from './opinion';

const person = (id: string, isMe = false): AtlasPerson => ({ id, name: isMe ? 'Tú' : id.toUpperCase(), avatarUrl: null, color: '#000000', isMe });
const people = [person('me', true), person('b'), person('c')];
const work = (key: string, ratings: Record<string, number | null>): AtlasWork => ({ key: key as WorkKey, itemType: 'book', itemId: key.split(':')[1],
  title: key, metadataMissing: false, coverUrl: null, genres: [], creators: [],
  owners: Object.entries(ratings).map(([userId, rating]) => ({ userId, rating, date: null })) });
const works = [
  work('book:1', { me: 9, b: 9, c: 8 }),     // mean 8.5 → diff 0.5 → agree
  work('book:2', { me: 9, b: 4, c: 4 }),     // diff 5 → clash
  work('book:3', { me: 7, b: 5 }),           // diff 2 when comparing me+b; no c → out with three faces
  work('book:4', { me: null, b: 6, c: 6 }),  // no reference rating → out
  work('book:5', { me: 6, b: null }),        // nobody else rated → out
  work('book:6', { b: 3, c: 9 }),            // reference does not own it → out
];

describe('opinionReference', () => {
  it('Tú si está activa; si no, la primera activa; nadie con menos de dos caras', () => {
    expect(opinionReference(people, ['me', 'b'])).toBe('me');
    expect(opinionReference(people, ['c', 'b'])).toBe('b');
    expect(opinionReference(people, ['b'])).toBeNull();
  });
});

describe('layoutOpinion', () => {
  it('solo obras comunes con nota explícita de todas las caras activas', () => {
    const layout = layoutOpinion(people, works, ['me', 'b', 'c']);
    expect([...layout.positions.keys()].toSorted()).toEqual(['book:1', 'book:2']);
    expect(layout.extent).toEqual(OPINION_EXTENT);
  });
  it('X = nota de la referencia; Y = −media del resto activo; con jitter determinista acotado', () => {
    const p = layoutOpinion(people, works, ['me', 'b', 'c']).positions.get('book:2' as WorkKey)!;
    expect(p).toMatchObject({ ref: 9, others: 4, diff: 5 });
    expect(p.x).toBeCloseTo(ratingX(9) + jitter('book:2', 0));
    expect(p.y).toBeCloseTo(-ratingX(4) + jitter('book:2', 1));
    expect(Math.abs(jitter('book:2', 0))).toBeLessThanOrEqual(13);
    expect(jitter('book:2', 0)).toBe(jitter('book:2', 0));
    expect(jitter('book:2', 0)).not.toBe(jitter('book:2', 1));
  });
  it('la media solo cuenta caras activas', () => {
    expect(layoutOpinion(people, works, ['me', 'c']).positions.get('book:2' as WorkKey)).toMatchObject({ others: 4, diff: 5 });
    expect(layoutOpinion(people, works, ['me', 'c']).positions.has('book:3' as WorkKey)).toBe(false);
  });
  it('sin referencia, vacía', () => {
    expect(layoutOpinion(people, works, ['b']).positions.size).toBe(0);
  });
});

describe('colores y resumen', () => {
  it('diffMix: 0 hasta 1 punto, 1 desde 4, lineal entre medias', () => {
    expect([0, 1, 2.5, 4, 7].map(diffMix)).toEqual([0, 0, 0.5, 1, 1]);
  });
  it('mixHex mezcla #rrggbb y devuelve el primero si no entiende el formato', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)');
    expect(mixHex('var(--x)', '#ffffff', 0.5)).toBe('var(--x)');
  });
  it('cuenta coincidencias y choques sobre lo dibujado', () => {
    expect(summarizeOpinion(people, layoutOpinion(people, works, ['me', 'b', 'c'])))
      .toEqual({ kind: 'counts', agree: 1, clash: 1, total: 2, ref: 'Tú', isMe: true });
    expect(summarizeOpinion(people, layoutOpinion(people, works, ['b', 'c'])))
      .toEqual({ kind: 'counts', agree: 3, clash: 1, total: 4, ref: 'B', isMe: false });
  });
  it('con menos de dos caras pide otra; sin obras comparables lo dice', () => {
    expect(summarizeOpinion(people, layoutOpinion(people, works, ['me']))).toEqual({ kind: 'needsTwo' });
    expect(summarizeOpinion(people, layoutOpinion(people, [works[3]], ['me', 'b']))).toEqual({ kind: 'empty', ref: 'Tú', isMe: true });
  });
});
