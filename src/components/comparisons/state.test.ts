import { describe, expect, it } from 'vitest';
import { acceptResponse, initialState, changeAccount, changeGroup, selectOwnedGroup } from './state';
import type { Snapshot } from '@/lib/comparisons/types';

const snapshot: Snapshot = { group: { id: 'a', name: 'Amigos', revision: 1, members: ['a', 'b'].map(userId => ({ slotId: userId, userId, name: userId, avatarUrl: null, available: true })) }, format: 'all', catalog: [{ key: 'book:x', title: 'Libro', coverUrl: null, genres: ['Drama'], creators: [] }], works: [{ key: 'book:x', userId: 'a', rating: null, date: null, orderUnknown: false, progress: null }], excludedSeriesWithoutEpisodes: 0 };
describe('comparison navigation state', () => {
  it('ignores an older response without clearing the current response', () => {
    const state = { seq: 2, value: snapshot, status: 'ready' as const };
    expect(acceptResponse(state, 1, { ok: false, code: 'conflict' })).toBe(state);
    expect(acceptResponse(state, 2, { ok: false, code: 'load-failed' })).toEqual({ seq: 2, value: null, status: 'error' });
  });
  it('clears snapshot, source and group when the account changes', () => {
    const state = { ...initialState('a'), groupId: 'g', format: 'book' as const, source: snapshot, snapshot: { seq: 2, value: snapshot, status: 'ready' as const } };
    const next = changeAccount(state, 'b');
    expect(next.viewerId).toBe('b'); expect(next.groupId).toBeNull(); expect(next.source).toBeNull(); expect(next.format).toBe('all');
    expect(next.snapshot.value).toBeNull();
    expect(next.snapshot.seq).toBeGreaterThan(state.snapshot.seq);
  });
  it('clears evidence and the loaded source for a different group', () => {
    const state = { ...initialState('a'), groupId: 'g', source: snapshot, loadError: 'conflict' as const, snapshot: { seq: 2, value: snapshot, status: 'ready' as const } };
    const next = changeGroup(state, 'new');
    expect(next.groupId).toBe('new'); expect(next.source).toBeNull(); expect(next.loadError).toBeNull();
    expect(next.snapshot).toEqual({ seq: 3, value: null, status: 'idle' });
  });
  it('accepts only a UUID in the owned group list', () => {
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    expect(selectOwnedGroup(id, [{ ...snapshot.group, id }])).toBe(id);
    expect(selectOwnedGroup('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', [{ ...snapshot.group, id }])).toBeNull();
    expect(selectOwnedGroup('bad', snapshot ? [snapshot.group] : [])).toBeNull();
  });
});
