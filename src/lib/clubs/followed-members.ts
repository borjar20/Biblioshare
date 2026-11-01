import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { readAllRows } from '@/lib/supabase/read-all-rows';
import { PERSONAS_MAX } from '@/lib/comparisons/personas-query';

// Club → Entre nosotros (spec 2026-11-01): only accepted follows can be compared, so the
// button carries the active members you follow. Per session: never cached (#437).
export function pickFollowedMembers(memberIds: string[], followeeIds: string[], viewerId: string): string[] {
  const following = new Set(followeeIds);
  return memberIds.filter(id => id !== viewerId && following.has(id)).slice(0, PERSONAS_MAX);
}

export async function getFollowedClubMembers(clubId: string, viewerId: string): Promise<string[]> {
  const client = await createClient();
  const [members, follows] = await Promise.all([
    readAllRows<{ user_id: string }>((from, to) => client.from('club_members')
      .select('user_id').eq('club_id', clubId).eq('status', 'active')
      .order('user_id').range(from, to)),
    readAllRows<{ followee_id: string }>((from, to) => client.from('follows')
      .select('followee_id').eq('follower_id', viewerId).eq('status', 'accepted')
      .order('followee_id').range(from, to)),
  ]);
  return pickFollowedMembers(members.map(row => row.user_id), follows.map(row => row.followee_id), viewerId);
}
