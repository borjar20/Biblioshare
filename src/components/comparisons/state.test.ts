import { describe, expect, it } from 'vitest';
import { acceptResponse, initialState, changeAccount, changeGroup, reconcileView, selectOwnedGroup, setView, changeSelection } from './state';
import type { Snapshot } from '@/lib/comparisons/types';
import type { ExplorerState } from './state';

const snapshot: Snapshot = { group: { id: 'a', name: 'Amigos', revision: 1, members: ['a', 'b'].map(userId => ({ slotId: userId, userId, name: userId, avatarUrl: null, available: true })) }, format: 'all', catalog: [{ key: 'book:x', title: 'Libro', coverUrl: null, genres: ['Drama'], creators: [] }], works: [{ key: 'book:x', userId: 'a', rating: null, orderUnknown: false, progress: null }], excludedSeriesWithoutEpisodes: 0 };
describe('comparison navigation state', () => {
  it('ignores an older response without clearing the current response', () => {
    const state = { seq: 2, value: snapshot, status: 'ready' as const };
    expect(acceptResponse(state, 1, { ok: false, code: 'conflict' })).toBe(state);
    expect(acceptResponse(state, 2, { ok: false, code: 'load-failed' })).toEqual({ seq: 2, value: null, status: 'error' });
  });
  it('clears snapshot, detail, group and selection when the account changes', () => {
    const state = { ...initialState('a'), groupId: 'g', selection: ['a', 'b'], snapshot: { seq: 2, value: snapshot, status: 'ready' as const }, detail: { seq: 3, value: { work: snapshot.catalog[0], people: [], commonEpisodes: [] }, status: 'ready' as const } };
    const next = changeAccount(state, 'b');
    expect(next.viewerId).toBe('b'); expect(next.groupId).toBeNull(); expect(next.selection).toEqual([]);
    expect(next.snapshot.value).toBeNull(); expect(next.detail.value).toBeNull();
    expect(next.snapshot.seq).toBeGreaterThan(state.snapshot.seq);
  });
  it('clears evidence for a different group and keeps independent section views', () => {
    let state = setView(initialState('a'), 'works', { level: 'venn', people: ['a', 'b'] });
    state = setView(state, 'tastes', { level: 'facet', people: ['a', 'b'], facetKind: 'genre', facetId: 'Drama' });
    expect(state.views.works.level).toBe('venn'); expect(state.views.tastes.level).toBe('facet');
    expect(changeGroup(state, 'new').views).toEqual({ works: { level: 'group' }, tastes: { level: 'group' } });
  });
  it('returns from a filtered work to its valid region or facet context', () => {
    expect(reconcileView({ level: 'work', people: ['a', 'b'], origin: { kind: 'region', mask: 3 }, key: 'book:gone' }, snapshot)).toEqual({ level: 'venn', people: ['a', 'b'] });
    expect(reconcileView({ level: 'work', people: ['a', 'b'], origin: { kind: 'facet', facetKind: 'genre', facetId: 'Drama' }, key: 'book:gone' }, snapshot)).toEqual({ level: 'facet', people: ['a', 'b'], facetKind: 'genre', facetId: 'Drama' });
    expect(reconcileView({ level: 'venn', people: ['a', 'gone'] }, snapshot)).toEqual({ level: 'group' });
  });
  it('accepts only a UUID in the owned group list', () => {
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    expect(selectOwnedGroup(id, [{ ...snapshot.group, id }])).toBe(id);
    expect(selectOwnedGroup('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', [{ ...snapshot.group, id }])).toBeNull();
    expect(selectOwnedGroup('bad', snapshot ? [snapshot.group] : [])).toBeNull();
  });
  it('returns to Venn or the original facet when participants change, preserving the other section', () => {
    const withThree: Snapshot = { ...snapshot, catalog: [...snapshot.catalog, { ...snapshot.catalog[0], key: 'book:y' }], works: [...snapshot.works, { ...snapshot.works[0], userId: 'b', key: 'book:y' }], group: { ...snapshot.group, members: [...snapshot.group.members, { slotId: 'c', userId: 'c', name: 'c', available: true, avatarUrl: null }] } };
    let state: ExplorerState = { ...initialState('a'), snapshot: { seq: 1, status: 'ready', value: withThree } };
    state = setView(state, 'works', { level: 'work', people: ['a', 'b'], origin: { kind: 'region', mask: 1 }, key: 'book:x' });
    state = setView(state, 'tastes', { level: 'work', people: ['a', 'b'], origin: { kind: 'facet', facetKind: 'genre', facetId: 'Drama' }, key: 'book:x' });
    const changedWorks = changeSelection(state, ['a', 'c']);
    expect(changedWorks.views.works).toEqual({ level: 'venn', people: ['a', 'c'] });
    expect(changedWorks.views.tastes).toEqual(state.views.tastes);
    const changedTastes = changeSelection({ ...state, section: 'tastes' }, ['b', 'c']);
    expect(changedTastes.views.tastes).toEqual({ level: 'facet', people: ['b', 'c'], facetKind: 'genre', facetId: 'Drama' });
  });
});
