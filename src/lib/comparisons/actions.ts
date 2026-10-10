'use server';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { ComparisonError, readGroup } from './groups';
import { loadDetail, loadSnapshot } from './load';
import type { Format, Group, Result, Snapshot, WorkDetail, WorkKey } from './types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(value: unknown): value is string { return typeof value === 'string' && uuidPattern.test(value); }
function revision(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647; }
function failure(error: unknown): { ok: false; code: Extract<Result<never>, { ok: false }>['code'] } {
  if (error instanceof ComparisonError) {
    if (error.code === 'load-failed') console.error('Comparison load failed', error.cause ?? error);
    return { ok: false, code: error.code };
  }
  console.error('Comparison operation failed', error);
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  return { ok: false, code: code === 'PT409' ? 'conflict' : code === 'PT404' || code === '42501' ? 'unavailable'
    : code === '22023' || code === '22P02' || code === '23505' ? 'invalid' : 'load-failed' };
}

export async function loadComparison(groupId: string, format: Format): Promise<Result<Snapshot>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, code: 'unauthenticated' };
    if (!uuid(groupId) || !['all', 'book', 'movie', 'series'].includes(format)) return { ok: false, code: 'invalid' };
    return { ok: true, data: await loadSnapshot(await createClient(), user.id, groupId, format) };
  } catch (error) { return failure(error); }
}

export async function loadComparisonWork(groupId: string, key: WorkKey, people: string[]): Promise<Result<WorkDetail>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, code: 'unauthenticated' };
    if (!uuid(groupId) || typeof key !== 'string' || !/^(book|movie|series):/.test(key) || !uuid(key.split(':')[1]) ||
      key.split(':').length !== 2 || !Array.isArray(people) || people.length < 1 || people.length > 10 ||
      !people.every(uuid) || new Set(people).size !== people.length) return { ok: false, code: 'invalid' };
    return { ok: true, data: await loadDetail(await createClient(), user.id, groupId, key, people) };
  } catch (error) { return failure(error); }
}

export async function saveGroup(input: { id: string | null; name: string; userIds: string[]; expectedRevision: number | null }): Promise<Result<Group>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, code: 'unauthenticated' };
    if (!input || typeof input.name !== 'string' || !input.name.trim() || [...input.name.trim()].length > 60 ||
      !Array.isArray(input.userIds) || input.userIds.length < 2 || input.userIds.length > 10 ||
      !input.userIds.every(uuid) || new Set(input.userIds).size !== input.userIds.length ||
      (input.id === null ? input.expectedRevision !== null : !uuid(input.id) || !revision(input.expectedRevision))) {
      return { ok: false, code: 'invalid' };
    }
    const client = await createClient();
    const { data, error } = await client.rpc('save_comparison_group', { p_id: input.id, p_name: input.name.trim(),
      p_user_ids: input.userIds, p_expected_revision: input.expectedRevision });
    if (error) throw error;
    if (!data) throw new ComparisonError('load-failed');
    return { ok: true, data: await readGroup(client, user.id, data.id) };
  } catch (error) { return failure(error); }
}

export async function deleteGroup(id: string, expectedRevision: number): Promise<Result<null>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, code: 'unauthenticated' };
    if (!uuid(id) || !revision(expectedRevision)) return { ok: false, code: 'invalid' };
    const { data, error } = await (await createClient()).rpc('delete_comparison_group', { p_id: id, p_expected_revision: expectedRevision });
    if (error) throw error;
    return data === true ? { ok: true, data: null } : { ok: false, code: 'unavailable' };
  } catch (error) { return failure(error); }
}
