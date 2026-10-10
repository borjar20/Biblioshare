import 'server-only';
import { readAllRows } from '@/lib/supabase/read-all-rows';
import { chunkIds } from '@/lib/supabase/in-chunks';
import type { Candidate, Group, Member, Result } from './types';
export type Client = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>;
type Slot = { id: string; group_id: string; user_id: string; position: number };
type Profile = { user_id: string; display_name: string | null; username: string; avatar_url: string | null };
type GroupRow = { id: string; name: string; revision: number };
export class ComparisonError extends Error {
  constructor(public readonly code: Extract<Result<never>, { ok: false }>['code'], options?: ErrorOptions) {
    super(code, options);
  }
}

async function acceptedIds(client: Client, viewerId: string): Promise<Set<string>> {
  const rows = await readAllRows<{ followee_id: string }>((from, to) => client.from('follows')
    .select('followee_id').eq('follower_id', viewerId).eq('status', 'accepted')
    .order('followee_id').range(from, to));
  return new Set([viewerId, ...rows.map(row => row.followee_id)]);
}

async function visiblePeople(client: Client, viewerId: string, ids: string[]): Promise<Map<string, Candidate>> {
  const accepted = await acceptedIds(client, viewerId);
  const eligible = [...new Set(ids)].filter(id => accepted.has(id));
  const profiles: Profile[] = [];
  for (const batch of chunkIds(eligible)) {
    profiles.push(...await readAllRows<Profile>((from, to) => client.from('profiles')
      .select('user_id,display_name,username,avatar_url').in('user_id', batch)
      .order('user_id').range(from, to)));
  }
  const result = new Map<string, Candidate>();
  for (const profile of profiles) {
    const { data, error } = await client.rpc('can_view_profile', { target_user_id: profile.user_id });
    if (error) throw error;
    if (data === true) result.set(profile.user_id, { userId: profile.user_id,
      name: profile.display_name?.trim() || profile.username, avatarUrl: profile.avatar_url });
  }
  return result;
}

async function members(client: Client, viewerId: string, slots: Slot[]): Promise<Member[]> {
  const people = await visiblePeople(client, viewerId, slots.map(slot => slot.user_id));
  return slots.map(slot => {
    const person = people.get(slot.user_id);
    return { slotId: slot.id, userId: person?.userId ?? null, name: person?.name ?? null,
      avatarUrl: person?.avatarUrl ?? null, available: person !== undefined };
  });
}

export async function readGroup(client: Client, viewerId: string, id: string): Promise<Group> {
  const rows = await readAllRows<GroupRow>((from, to) => client.from('comparison_groups')
    .select('id,name,revision').eq('owner_id', viewerId).eq('id', id).order('id').range(from, to));
  if (rows.length !== 1) throw new ComparisonError('unavailable');
  const slots = await readAllRows<Slot>((from, to) => client.from('comparison_group_members')
    .select('id,group_id,user_id,position').eq('group_id', id).order('position').order('id').range(from, to));
  return { ...rows[0], members: await members(client, viewerId, slots) };
}

export async function listGroups(client: Client): Promise<Group[]> {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new ComparisonError('unauthenticated');
  const viewerId = data.user.id;
  const rows = await readAllRows<GroupRow>((from, to) => client.from('comparison_groups')
    .select('id,name,revision').eq('owner_id', viewerId).order('id').range(from, to));
  const result: Group[] = [];
  for (const row of rows) result.push(await readGroup(client, viewerId, row.id));
  return result;
}

export async function listCandidates(client: Client, viewerId: string): Promise<Candidate[]> {
  const accepted = await acceptedIds(client, viewerId);
  return [...(await visiblePeople(client, viewerId, [...accepted])).values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
}
