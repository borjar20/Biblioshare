import { describe, expect, it } from 'vitest';
import { sortGroups } from './order';
import type { Group } from './types';

const group = (id: string, name: string): Group => ({ id, name, revision: 1, members: [] });

describe('sortGroups', () => {
  it('orders by name in Spanish, ignoring case and accents, with numbers in natural order', () => {
    const groups = [group('1', 'zona'), group('2', 'Ébano'), group('3', 'club 10'), group('4', 'Ñandú'), group('5', 'club 2'), group('6', 'alba')];
    expect(sortGroups(groups).map(item => item.name)).toEqual(['alba', 'club 2', 'club 10', 'Ébano', 'Ñandú', 'zona']);
  });
  it('breaks name ties by id so uuid read order never leaks', () => {
    expect(sortGroups([group('b', 'Cine'), group('a', 'cine')]).map(item => item.id)).toEqual(['a', 'b']);
  });
  it('does not mutate its input', () => {
    const groups = [group('2', 'B'), group('1', 'A')];
    sortGroups(groups); expect(groups.map(item => item.id)).toEqual(['2', '1']);
  });
});
