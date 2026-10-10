import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ user: vi.fn(), client: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: mocks.user, createClient: mocks.client }));
import { deleteGroup, loadComparison, loadComparisonWork, saveGroup } from './actions';
const id = '20000000-0000-4000-8000-000000000001';
const owner = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';

beforeEach(() => {
  vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: owner });
  mocks.client.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc });
  mocks.from.mockImplementation(() => {
    const q = { select: () => q, eq: () => q, order: () => q, range: () => q,
      then: (resolve: (r: unknown) => unknown) => resolve({ data: [], error: null }) };
    return q;
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
describe('comparison server actions', () => {
  it('rejects every entry without session before any application query', async () => {
    mocks.user.mockResolvedValue(null);
    const results = await Promise.all([loadComparison(id, 'all'), loadComparisonWork(id, `book:${id}`, [owner]),
      saveGroup({ id: null, name: 'Group', userIds: [owner, other], expectedRevision: null }), deleteGroup(id, 1)]);
    expect(results).toEqual(Array(4).fill({ ok: false, code: 'unauthenticated' }));
    expect(mocks.user).toHaveBeenCalledTimes(4);
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('foreign UUID is unavailable before consumption queries', async () => {
    expect(await loadComparison(id, 'all')).toEqual({ ok: false, code: 'unavailable' });
    expect(await loadComparisonWork(id, `book:${id}`, [owner])).toEqual({ ok: false, code: 'unavailable' });
    expect(mocks.from.mock.calls.every(([table]) => table === 'comparison_groups')).toBe(true);
  });
  it('validates wire inputs', async () => {
    expect(await loadComparison('invalid', 'all')).toEqual({ ok: false, code: 'invalid' });
    expect(await loadComparison(id, 'invalid' as 'all')).toEqual({ ok: false, code: 'invalid' });
    expect(await saveGroup({ id: null, name: ' ', userIds: [owner, other], expectedRevision: null })).toEqual({ ok: false, code: 'invalid' });
    expect(await deleteGroup(id, NaN)).toEqual({ ok: false, code: 'invalid' });
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([['PT404', 'unavailable'], ['PT409', 'conflict'], ['42501', 'unavailable'], ['22023', 'invalid'], ['22P02', 'invalid'], ['XX000', 'load-failed']])('maps SQL %s without leaking technical errors', async (code, expected) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: 'internal secret' } });
    expect(await saveGroup({ id: null, name: ' Group ', userIds: [owner, other], expectedRevision: null })).toEqual({ ok: false, code: expected });
    expect(mocks.rpc).toHaveBeenCalledWith('save_comparison_group', { p_id: null, p_name: 'Group', p_user_ids: [owner, other], p_expected_revision: null });
    expect(console.error).toHaveBeenCalled();
  });
  it('returns null only for confirmed delete success', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await deleteGroup(id, 4)).toEqual({ ok: true, data: null });
    expect(mocks.rpc).toHaveBeenCalledWith('delete_comparison_group', { p_id: id, p_expected_revision: 4 });
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(await deleteGroup(id, 4)).toEqual({ ok: false, code: 'unavailable' });
  });
});
