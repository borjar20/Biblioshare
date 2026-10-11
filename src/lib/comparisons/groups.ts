import 'server-only';
import { readAllRows } from '@/lib/supabase/read-all-rows';
import { chunkIds } from '@/lib/supabase/in-chunks';
import { sortGroups } from './order';
import { withPersonTarget } from './with-person';
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

/** Visibility is per person and per session; a small pool replaces one round trip per profile. */
const VISIBILITY_CONCURRENCY = 8;
async function visiblePeople(client: Client, viewerId: string, ids: string[], accepted?: Set<string>): Promise<Map<string, Candidate>> {
  const following = accepted ?? await acceptedIds(client, viewerId);
  const eligible = [...new Set(ids)].filter(id => following.has(id));
  const profiles: Profile[] = [];
  for (const batch of chunkIds(eligible)) {
    profiles.push(...await readAllRows<Profile>((from, to) => client.from('profiles')
      .select('user_id,display_name,username,avatar_url').in('user_id', batch)
      .order('user_id').range(from, to)));
  }
  const visible = new Array<boolean>(profiles.length);
  let next = 0; let failed = false;
  async function worker() {
    // A failure stops every worker: an unchecked profile is never shown as visible or absent.
    while (!failed && next < profiles.length) {
      const index = next++;
      const { data, error } = await client.rpc('can_view_profile', { target_user_id: profiles[index].user_id });
      if (error) { failed = true; throw error; }
      visible[index] = data === true;
    }
  }
  await Promise.all(Array.from({ length: Math.min(VISIBILITY_CONCURRENCY, profiles.length) }, worker));
  const result = new Map<string, Candidate>();
  profiles.forEach((profile, index) => {
    if (visible[index]) result.set(profile.user_id, { userId: profile.user_id,
      name: profile.display_name?.trim() || profile.username, avatarUrl: profile.avatar_url });
  });
  return result;
}

function members(slots: Slot[], people: Map<string, Candidate>): Member[] {
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
  return { ...rows[0], members: members(slots, await visiblePeople(client, viewerId, slots.map(slot => slot.user_id))) };
}

/** A saved group, or the unsaved pair behind a `with:` id, checked with the session either way. */
export async function resolveGroup(client: Client, viewerId: string, id: string): Promise<Group> {
  const target = withPersonTarget(id);
  if (target === null) return readGroup(client, viewerId, id);
  if (target === viewerId) throw new ComparisonError('invalid');
  const people = await visiblePeople(client, viewerId, [viewerId, target]);
  // Only an accepted, visible follow can be compared; nothing is revealed otherwise.
  if (!people.has(target)) throw new ComparisonError('unavailable');
  return { id, name: '', revision: 1, members: members([
    { id: 'self', group_id: id, user_id: viewerId, position: 0 },
    { id: 'with', group_id: id, user_id: target, position: 1 }], people) };
}

/** Every owned group with one membership read and one visibility pass, not one per group. */
async function ownedGroups(client: Client, viewerId: string, people: (ids: string[]) => Promise<Map<string, Candidate>>): Promise<Group[]> {
  const rows = await readAllRows<GroupRow>((from, to) => client.from('comparison_groups')
    .select('id,name,revision').eq('owner_id', viewerId).order('id').range(from, to));
  const slots: Slot[] = [];
  for (const batch of chunkIds(rows.map(row => row.id))) {
    slots.push(...await readAllRows<Slot>((from, to) => client.from('comparison_group_members')
      .select('id,group_id,user_id,position').in('group_id', batch)
      .order('group_id').order('position').order('id').range(from, to)));
  }
  const visible = await people(slots.map(slot => slot.user_id));
  // `id` keeps pagination stable; people choose by name (#1480).
  return sortGroups(rows.map(row => ({ ...row, members: members(slots.filter(slot => slot.group_id === row.id), visible) })));
}

export async function listGroups(client: Client): Promise<Group[]> {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new ComparisonError('unauthenticated');
  const viewerId = data.user.id;
  return ownedGroups(client, viewerId, ids => visiblePeople(client, viewerId, ids));
}

function sortCandidates(people: Map<string, Candidate>): Candidate[] {
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
}

export async function listCandidates(client: Client, viewerId: string): Promise<Candidate[]> {
  const accepted = await acceptedIds(client, viewerId);
  return sortCandidates(await visiblePeople(client, viewerId, [...accepted], accepted));
}

/**
 * Page entry: members can only be available when they are accepted follows (or the owner),
 * so the candidates' visibility map already answers every saved slot.
 */
export async function listEntry(client: Client, viewerId: string): Promise<{ groups: Group[]; candidates: Candidate[] }> {
  const accepted = await acceptedIds(client, viewerId);
  const visible = await visiblePeople(client, viewerId, [...accepted], accepted);
  return { groups: await ownedGroups(client, viewerId, async () => visible), candidates: sortCandidates(visible) };
}
