import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { loadDetail, loadSnapshot } from './load';
import type { Client } from './groups';
import { listCandidates, listGroups } from './groups';

const owner = '10000000-0000-4000-8000-000000000001';
const friend = '10000000-0000-4000-8000-000000000002';
const third = '10000000-0000-4000-8000-000000000003';
const groupId = '20000000-0000-4000-8000-000000000001';
const seriesId = '30000000-0000-4000-8000-000000000001';
type Row = Record<string, unknown>;

/** Simulate PostgREST projection, filters and the 200-row window, not canned pages. */
function fixture() {
  const rows: Record<string, Row[]> = {
    comparison_groups: [{ id: groupId, owner_id: owner, name: 'Friends', revision: 4 }],
    comparison_group_members: [owner, friend, third].map((id, position) =>
      ({ id: `slot${position}`, group_id: groupId, user_id: id, position })),
    follows: [friend, third].map(id => ({ follower_id: owner, followee_id: id, status: 'accepted' })),
    profiles: [owner, friend, third].map(id => ({ user_id: id, display_name: id, username: id, avatar_url: null })),
    passes: [], episode_watches: [], books: [], movies: [], series: [], credits: [], people: [], series_episodes: [],
  };
  const queries: { table: string; cols: string; from: number; to: number; filters: [string, unknown][] }[] = [];
  let revoked = false;
  let revokeAtCatalog = false;
  let changeAtCatalog = false;
  let fail: { table: string; from: number } | null = null;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    rpc: vi.fn(async (_name: string, args: { target_user_id: string }) =>
      ({ data: !(revoked && args.target_user_id === friend), error: null })),
    from(table: string) {
      let cols = '', from = 0, to = 199;
      const filters: [string, unknown][] = [];
      const orders: string[] = [];
      const query = {
        select(value: string) { cols = value; return query; },
        eq(col: string, value: unknown) { filters.push([col, value]); return query; },
        in(col: string, value: unknown[]) { filters.push([col, value]); return query; },
        order(col: string) { orders.push(col); return query; },
        range(a: number, b: number) { from = a; to = b; return query; },
        async then(resolve: (x: unknown) => unknown) {
          queries.push({ table, cols, from, to, filters });
          if (revokeAtCatalog && ['books', 'series'].includes(table)) revoked = true;
          if (changeAtCatalog && ['books', 'series'].includes(table)) {
            rows.comparison_groups[0].revision = Number(rows.comparison_groups[0].revision) + 1;
            changeAtCatalog = false;
          }
          if (fail?.table === table && from === fail.from) return resolve({ data: null, error: { code: 'XX000', message: 'technical secret' } });
          const filtered = (rows[table] ?? []).filter(row => filters.every(([col, v]) =>
            Array.isArray(v) ? v.includes(row[col]) : row[col] === v));
          filtered.sort((a, b) => {
            for (const col of orders) { const d = String(a[col]).localeCompare(String(b[col])); if (d) return d; }
            return 0;
          });
          return resolve({ data: filtered.slice(from, to + 1).map(row => Object.fromEntries(
            cols.split(',').map(col => [col.trim(), row[col.trim()]]))), error: null });
        },
      };
      return query;
    },
  } as unknown as Client;
  return { client, rows, queries, revoke() { revoked = true; },
    revokeDuringLoad() { revokeAtCatalog = true; }, changeGroupDuringLoad() { changeAtCatalog = true; },
    fail(table: string, from = 0) { fail = { table, from }; } };
}
function pass(id: string, user = friend, itemType = 'book', itemId = id): Row {
  return { id, user_id: user, item_type: itemType, item_id: itemId, status: 'completed',
    is_active: false, rating: 8, finished_on: '2026-01-01', created_at: '2026-01-01', review: 'NEVER SEND', drop_reason: 'NEVER SEND' };
}
function watch(id: string, user = friend): Row {
  return { id, user_id: user, series_id: seriesId, pass_id: null, season_number: 1,
    episode_number: 1, rating: 9, watched_on: '2026-01-01', created_at: '2026-01-01', review: 'NEVER SEND' };
}

describe('authorized comparison loaders', () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => { f = fixture(); });
  it('loads all 1,205 historical passes and keeps eligible works with absent metadata', async () => {
    f.rows.passes = Array.from({ length: 1205 }, (_, i) => pass(String(i).padStart(5, '0')));
    const result = await loadSnapshot(f.client, owner, groupId, 'book');
    expect(result.works).toHaveLength(1205);
    expect(result.catalog).toHaveLength(1205);
    expect(result.catalog[0]).toMatchObject({ title: '', metadataMissing: true, coverUrl: null, genres: [], creators: [] });
    expect(f.queries.filter(q => q.table === 'passes').map(q => q.from)).toEqual([0, 200, 400, 600, 800, 1000, 1200]);
    expect(f.queries.filter(q => q.table === 'books').every(q => (q.filters.find(([k]) => k === 'id')![1] as unknown[]).length <= 50)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('NEVER SEND');
  });
  it('fails instead of returning a truncated first page', async () => {
    f.rows.passes = Array.from({ length: 1205 }, (_, i) => pass(String(i)));
    f.fail('passes', 200);
    await expect(loadSnapshot(f.client, owner, groupId, 'book')).rejects.toMatchObject({ code: 'load-failed' });
    expect(f.queries.filter(q => q.table === 'passes').map(q => q.from)).toEqual([0, 200]);
  });
  it('rejects foreign groups before reading consumption', async () => {
    f.rows.comparison_groups[0].owner_id = third;
    await expect(loadSnapshot(f.client, owner, groupId, 'all')).rejects.toMatchObject({ code: 'unavailable' });
    expect(f.queries.some(q => ['passes', 'episode_watches'].includes(q.table))).toBe(false);
  });
  it('discards evidence and identity revoked during catalogue queries', async () => {
    f.rows.passes = [pass('b'), pass('unseen', friend, 'series', seriesId)]; f.revokeDuringLoad();
    const result = await loadSnapshot(f.client, owner, groupId, 'all');
    expect(result.works).toEqual([]); expect(result.catalog).toEqual([]);
    expect(result.excludedSeriesWithoutEpisodes).toBe(0);
    expect(result.group.members[1]).toEqual({ slotId: 'slot1', userId: null, name: null, avatarUrl: null, available: false });
  });
  it('does not treat public identity without accepted follow as available', async () => {
    f.rows.follows = f.rows.follows.filter(r => r.followee_id !== friend);
    f.rows.passes = [pass('b'), pass('own', owner)];
    const result = await loadSnapshot(f.client, owner, groupId, 'book');
    expect(result.works.map(w => w.userId)).toEqual([owner]);
    expect(result.group.members[1].available).toBe(false);
  });
  it('abort on catalogue failure', async () => {
    f.rows.passes = [pass('b')]; f.fail('books');
    await expect(loadSnapshot(f.client, owner, groupId, 'all')).rejects.toMatchObject({ code: 'load-failed' });
    expect(f.queries.some(q => q.table === 'books')).toBe(true);
  });
  it('includes orphan episode watches, correct aired counts, and only selected people in detail', async () => {
    f.rows.episode_watches = [watch('a', owner), watch('b'), watch('c', third)];
    f.rows.series = [{ id: seriesId, title: 'A series', cover_url: null, genres: [], tmdb_status: 'Returning Series' }];
    f.rows.series_episodes = [
      { id: 'e1', series_id: seriesId, season_number: 1, episode_number: 1, air_date: '2020-01-01' },
      { id: 'e2', series_id: seriesId, season_number: 1, episode_number: 2, air_date: '2099-01-01' },
    ];
    const result = await loadDetail(f.client, owner, groupId, `series:${seriesId}`, [owner, friend]);
    expect(result.people.map(p => p.userId)).toEqual([owner, friend]);
    expect(result.people[0].progress).toMatchObject({ seenEver: 1, current: null, aired: 1 });
    expect(result.commonEpisodes).toEqual([{ season: 1, episode: 1, notes: [{ userId: owner, rating: 9 }, { userId: friend, rating: 9 }] }]);
    expect(f.queries.filter(q => q.table === 'episode_watches').every(q => q.filters.some(([k, v]) => k === 'series_id' && v === seriesId))).toBe(true);
    const single = await loadDetail(f.client, owner, groupId, `series:${seriesId}`, [friend]);
    expect(single.commonEpisodes).toEqual([]);
  });
  it('rejects unavailable, outsider, duplicate or empty detail selection', async () => {
    for (const people of [[], [owner, owner]]) {
      await expect(loadDetail(f.client, owner, groupId, `series:${seriesId}`, people)).rejects.toMatchObject({ code: 'invalid' });
    }
    await expect(loadDetail(f.client, owner, groupId, `series:${seriesId}`, ['outsider'])).rejects.toMatchObject({ code: 'unavailable' });
    f.revoke();
    await expect(loadDetail(f.client, owner, groupId, `series:${seriesId}`, [friend])).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('rejects non-eligible work and detail revocation during load', async () => {
    await expect(loadDetail(f.client, owner, groupId, `series:${seriesId}`, [friend])).rejects.toMatchObject({ code: 'unavailable' });
    f.rows.episode_watches = [watch('w')]; f.revokeDuringLoad();
    await expect(loadDetail(f.client, owner, groupId, `series:${seriesId}`, [friend])).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('lists every accepted following beyond 1,000 plus self, excluding pending and invisible accounts', async () => {
    const ids = Array.from({ length: 1205 }, (_, i) => `person${i}`);
    f.rows.follows = [...ids.map(followee_id => ({ follower_id: owner, followee_id, status: 'accepted' })),
      { follower_id: owner, followee_id: 'pending', status: 'pending' }];
    f.rows.profiles.push(...ids.map(user_id => ({ user_id, username: user_id, display_name: null, avatar_url: null })),
      { user_id: 'pending', username: 'pending', display_name: null, avatar_url: null });
    const people = await listCandidates(f.client, owner);
    expect(people).toHaveLength(1206); expect(people.some(p => p.userId === owner)).toBe(true);
    expect(people.some(p => p.userId === 'pending')).toBe(false);
    expect(f.queries.filter(q => q.table === 'follows').some(q => q.from === 1200)).toBe(true);
    f.revoke();
    f.rows.follows.push({ follower_id: owner, followee_id: friend, status: 'accepted' });
    expect((await listCandidates(f.client, owner)).some(p => p.userId === friend)).toBe(false);
  });
  it('lists only caller-owned groups and redacts deleted identity slots', async () => {
    f.rows.comparison_groups.push({ id: 'foreign', name: 'Foreign', owner_id: third, revision: 3 });
    f.rows.profiles = f.rows.profiles.filter(row => row.user_id !== third);
    const groups = await listGroups(f.client);
    expect(groups).toHaveLength(1);
    expect(groups[0].members[2]).toEqual({ slotId: 'slot2', userId: null, name: null, avatarUrl: null, available: false });
  });
  it('loads all credit and episode catalog pages', async () => {
    f.rows.passes = [pass('b')];
    f.rows.books = [{ id: 'b', title: 'Book', cover_url: null, genres: ['Drama'] }];
    f.rows.credits = Array.from({ length: 1205 }, (_, i) => ({ id: String(i), item_id: 'b', item_type: 'book', role: 'author', person_id: `author${i}` }));
    f.rows.people = f.rows.credits.map(row => ({ id: row.person_id, name: String(row.person_id) }));
    f.rows.episode_watches = [watch('w')];
    f.rows.series = [{ id: seriesId, title: 'Series', cover_url: null, genres: [], tmdb_status: 'Ended' }];
    f.rows.series_episodes = Array.from({ length: 1205 }, (_, i) => ({ id: String(i), series_id: seriesId, season_number: 1, episode_number: i + 1, air_date: null }));
    const result = await loadSnapshot(f.client, owner, groupId, 'all');
    expect(result.catalog.find(work => work.key === 'book:b')!.creators).toHaveLength(1205);
    expect(result.works.find(work => work.key === `series:${seriesId}`)!.progress!.aired).toBe(1205);
  });
  it('fails on the second episode page rather than claiming a smaller aired count', async () => {
    f.rows.episode_watches = [watch('w')];
    f.rows.series = [{ id: seriesId, title: 'Series', cover_url: null, genres: [], tmdb_status: 'Ended' }];
    f.rows.series_episodes = Array.from({ length: 201 }, (_, i) => ({ id: String(i), series_id: seriesId, season_number: 1, episode_number: i + 1, air_date: null }));
    f.fail('series_episodes', 200);
    await expect(loadSnapshot(f.client, owner, groupId, 'series')).rejects.toMatchObject({ code: 'load-failed' });
    expect(f.queries.filter(q => q.table === 'series_episodes').map(q => q.from)).toEqual([0, 200]);
  });
  it('fails on follow paging errors instead of treating members as unavailable', async () => {
    f.rows.follows = Array.from({ length: 201 }, (_, i) => ({ follower_id: owner, followee_id: String(i), status: 'accepted' }));
    f.fail('follows', 200);
    await expect(loadSnapshot(f.client, owner, groupId, 'book')).rejects.toMatchObject({ code: 'load-failed' });
    expect(f.queries.some(q => q.table === 'passes')).toBe(false);
  });
  it('returns conflict when group membership revision changes during load', async () => {
    f.rows.passes = [pass('b')]; f.changeGroupDuringLoad();
    await expect(loadSnapshot(f.client, owner, groupId, 'book')).rejects.toMatchObject({ code: 'conflict' });
  });
});
