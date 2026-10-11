import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@/lib/comparisons/types';
import { personColor, presentViewer } from './presentation';

const snapshot: Snapshot = { format: 'all', catalog: [], works: [], excludedSeriesWithoutEpisodes: 0,
  group: { id: 'g', name: 'Grupo', revision: 1, members: [
    { slotId: '0', userId: 'me', name: 'Ana', avatarUrl: '/ana.png', available: true },
    { slotId: '1', userId: 'bea', name: 'Bea', avatarUrl: null, available: true },
    { slotId: '2', userId: null, name: null, avatarUrl: null, available: false }] } };

describe('presentViewer', () => {
  it('names only the viewer «Tú», keeping avatar, order and colour', () => {
    const presented = presentViewer(snapshot, 'me', 'Tú');
    expect(presented.group.members.map(member => member.name)).toEqual(['Tú', 'Bea', null]);
    expect(presented.group.members[0].avatarUrl).toBe('/ana.png');
    expect(personColor(presented, 'me')).toBe(personColor(snapshot, 'me'));
    expect(snapshot.group.members[0].name).toBe('Ana');
  });
  it('returns the same snapshot when the viewer is not in the group', () => {
    expect(presentViewer(snapshot, 'other', 'Tú')).toBe(snapshot);
  });
});
