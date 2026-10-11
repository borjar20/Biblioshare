import { describe, expect, it } from 'vitest';
import { withPersonId, withPersonTarget } from './with-person';

const person = '10000000-0000-4000-8000-000000000002';
describe('unsaved pair ids', () => {
  it('round-trips a person and rejects everything else, saved group ids included', () => {
    expect(withPersonTarget(withPersonId(person))).toBe(person);
    for (const value of [person, 'with:', 'with:not-a-uuid', `with:${person}x`, `x-with:${person}`, null, 7]) expect(withPersonTarget(value)).toBeNull();
  });
});
