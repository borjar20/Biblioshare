import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
import { pickFollowedMembers } from './followed-members';

describe('pickFollowedMembers', () => {
  it('keeps the members you follow, without yourself, in roster order', () => {
    expect(pickFollowedMembers(['me', 'c', 'x', 'b'], ['b', 'c', 'z'], 'me')).toEqual(['c', 'b']);
  });
  it('is empty when you follow nobody in the club', () => {
    expect(pickFollowedMembers(['me', 'x'], ['z'], 'me')).toEqual([]);
  });
  it('caps at the people that fit in a group with you', () => {
    const ids = Array.from({ length: 15 }, (_, i) => `p${i}`);
    expect(pickFollowedMembers(ids, ids, 'me')).toHaveLength(9);
  });
});
