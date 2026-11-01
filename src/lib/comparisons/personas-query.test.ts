import { describe, expect, it } from 'vitest';
import { PERSONAS_MAX, personasFromQuery, personasHref } from './personas-query';

const candidates = ['me', 'b', 'c'].map(userId => ({ userId, name: userId, avatarUrl: null }));

describe('personasFromQuery', () => {
  it('keeps only candidates, without the viewer or repeats, in URL order', () => {
    expect(personasFromQuery('c,me,stranger,b,c', candidates, 'me')).toEqual(['c', 'b']);
  });
  it('is empty for a missing or blank value', () => {
    expect(personasFromQuery(null, candidates, 'me')).toEqual([]);
    expect(personasFromQuery(' , ', candidates, 'me')).toEqual([]);
  });
  it('caps the list so that the viewer still fits in a group of 10', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ userId: `p${i}`, name: `p${i}`, avatarUrl: null }));
    expect(personasFromQuery(many.map(p => p.userId).join(','), many, 'me')).toHaveLength(PERSONAS_MAX);
  });
});

describe('personasHref', () => {
  it('builds the atlas link with comma-separated ids', () => {
    expect(personasHref(['b', 'c'])).toBe('/comunidad/entre-nosotros?personas=b%2Cc');
  });
});
