-- Social Phase 0: bidirectional blocking and block-aware social policies.
-- Security-control rows are intentionally visible to both parties, but only
-- the blocker can create or remove them.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create table public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_distinct_users check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx
  on public.user_blocks (blocked_id, blocker_id);

alter table public.user_blocks enable row level security;

revoke all on table public.user_blocks from anon, authenticated;
grant select, insert, delete on table public.user_blocks to authenticated;

create policy "user blocks select parties" on public.user_blocks
  for select to authenticated
  using ((select auth.uid()) in (blocker_id, blocked_id));

create policy "user blocks insert blocker" on public.user_blocks
  for insert to authenticated
  with check ((select auth.uid()) = blocker_id);

create policy "user blocks delete blocker" on public.user_blocks
  for delete to authenticated
  using ((select auth.uid()) = blocker_id);

-- Public RPCs stay SECURITY INVOKER: user_blocks RLS exposes exactly the two
-- directions relevant to the signed-in caller, so no privileged wrapper is
-- necessary and the functions add no SECURITY DEFINER advisor warning.
create or replace function public.users_are_blocked(other_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select case
    when (select auth.uid()) is null or other_user_id is null then false
    else exists (
      select 1
      from public.user_blocks ub
      where (
        ub.blocker_id = (select auth.uid())
        and ub.blocked_id = other_user_id
      ) or (
        ub.blocker_id = other_user_id
        and ub.blocked_id = (select auth.uid())
      )
    )
  end;
$function$;

revoke execute on function public.users_are_blocked(uuid) from public, anon;
grant execute on function public.users_are_blocked(uuid) to authenticated;

create or replace function public.filter_unblocked_user_ids(candidate_ids uuid[])
returns uuid[]
language sql
stable
security invoker
set search_path = ''
as $function$
  select case
    when (select auth.uid()) is null then '{}'::uuid[]
    else coalesce(array_agg(c.candidate_id order by c.first_ordinality), '{}'::uuid[])
  end
  from (
    select candidate_id, min(ord) as first_ordinality
    from unnest(coalesce(candidate_ids, '{}'::uuid[])) with ordinality as u(candidate_id, ord)
    where candidate_id is not null
      and not public.users_are_blocked(candidate_id)
    group by candidate_id
  ) c;
$function$;

revoke execute on function public.filter_unblocked_user_ids(uuid[]) from public, anon;
grant execute on function public.filter_unblocked_user_ids(uuid[]) to authenticated;

-- Resolve the accountable user behind every interaction target. It lives in a
-- non-exposed schema because it bypasses target-table RLS solely for policies.
create or replace function private.social_target_owner_id(
  p_target_type public.target_kind,
  p_target_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select case p_target_type
    when 'diary_entry' then (select p.user_id from public.passes p where p.id = p_target_id)
    when 'pass' then (select p.user_id from public.passes p where p.id = p_target_id)
    when 'episode_watch' then (select e.user_id from public.episode_watches e where e.id = p_target_id)
    when 'progress_session' then (select s.user_id from public.progress_sessions s where s.id = p_target_id)
    when 'club_post' then (select cp.author_id from public.club_posts cp where cp.id = p_target_id)
    when 'comment' then (select c.author_id from public.comments c where c.id = p_target_id)
    when 'activity_checkpoint' then (
      select cc.created_by from public.club_activity_checkpoints cc where cc.id = p_target_id
    )
    when 'club_activity' then (
      select ca.created_by from public.club_activities ca where ca.id = p_target_id
    )
  end;
$function$;

revoke execute on function private.social_target_owner_id(public.target_kind, uuid) from public;
grant execute on function private.social_target_owner_id(public.target_kind, uuid) to anon, authenticated;

-- Blocking severs relationship state and stale notification affordances in
-- both directions. Trigger functions use an empty search_path and qualify all
-- referenced objects explicitly.
create or replace function private.cleanup_relationships_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from public.follows f
  where (f.follower_id = new.blocker_id and f.followee_id = new.blocked_id)
     or (f.follower_id = new.blocked_id and f.followee_id = new.blocker_id);

  delete from public.notifications n
  where (n.user_id = new.blocker_id and n.actor_id = new.blocked_id)
     or (n.user_id = new.blocked_id and n.actor_id = new.blocker_id);

  return new;
end;
$function$;

revoke execute on function private.cleanup_relationships_on_block() from public, anon, authenticated;

create trigger trg_user_blocks_cleanup_relationships
  after insert on public.user_blocks
  for each row execute function private.cleanup_relationships_on_block();

-- can_view_profile is the transversal visibility gate for profile-owned data.
-- Ownership wins; every other path is cut off by a block in either direction.
create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select
    coalesce((select auth.uid()) = target_user_id, false)
    or (
      not public.users_are_blocked(target_user_id)
      and (
        public.profile_is_public(target_user_id)
        or exists (
          select 1 from public.follows f
          where f.follower_id = (select auth.uid())
            and f.followee_id = target_user_id
            and f.status = 'accepted'
        )
      )
    );
$function$;

comment on function public.can_view_profile(uuid) is
  'True for own content, or for public/accepted-follow content when neither user blocks the other.';

-- A club share is an audience override, never a block override. The block gate
-- wraps the complete previous OR in all four policies.
drop policy "library entries select visible" on public.library_entries;
create policy "library entries select visible" on public.library_entries
  for select to anon, authenticated
  using (
    not public.users_are_blocked(user_id)
    and (
      public.can_view_profile(user_id)
      or public.is_visible_via_club_share('library_entries', id, user_id)
    )
  );

drop policy "diary entries select visible" on public.passes;
create policy "diary entries select visible" on public.passes
  for select to anon, authenticated
  using (
    not public.users_are_blocked(user_id)
    and (
      public.can_view_profile(user_id)
      or public.is_visible_via_club_share('diary_entries', id, user_id)
    )
  );

drop policy "progress sessions select visible" on public.progress_sessions;
create policy "progress sessions select visible" on public.progress_sessions
  for select to anon, authenticated
  using (
    not public.users_are_blocked(user_id)
    and (
      public.can_view_profile(user_id)
      or public.is_visible_via_club_share('progress_sessions', id, user_id)
    )
  );

drop policy "episode_watches select visible" on public.episode_watches;
create policy "episode_watches select visible" on public.episode_watches
  for select to anon, authenticated
  using (
    not public.users_are_blocked(user_id)
    and (
      public.can_view_profile(user_id)
      or public.is_visible_via_club_share('episode_watches', id, user_id)
    )
  );

-- Existing follows cannot cross a block; DELETE remains available so either
-- party can still remove stale rows during races.
drop policy "follows visible to parties or public accepted" on public.follows;
create policy "follows visible to parties or public accepted" on public.follows
  for select to anon, authenticated
  using (
    not public.users_are_blocked(follower_id)
    and not public.users_are_blocked(followee_id)
    and (
      (select auth.uid()) = follower_id
      or (select auth.uid()) = followee_id
      or (status = 'accepted' and public.profile_is_public(followee_id))
    )
  );

drop policy "follows insert own with accept rule" on public.follows;
create policy "follows insert own with accept rule" on public.follows
  for insert to authenticated
  with check (
    (select auth.uid()) = follower_id
    and not public.users_are_blocked(followee_id)
    and (
      (status = 'accepted' and public.profile_is_public(followee_id))
      or (status = 'pending' and not public.profile_is_public(followee_id))
    )
  );

drop policy "follows update by followee" on public.follows;
create policy "follows update by followee" on public.follows
  for update to authenticated
  using (
    (select auth.uid()) = followee_id
    and not public.users_are_blocked(follower_id)
  )
  with check (
    (select auth.uid()) = followee_id
    and not public.users_are_blocked(follower_id)
  );

-- Interaction rows are hidden when either their author or their target owner
-- is blocked. New writes must satisfy the same target-owner gate.
drop policy "reactions select visible" on public.reactions;
create policy "reactions select visible" on public.reactions
  for select to anon, authenticated
  using (
    public.can_view_target(target_type, target_id)
    and not public.users_are_blocked(user_id)
    and not public.users_are_blocked(private.social_target_owner_id(target_type, target_id))
  );

drop policy "reactions insert own on visible target" on public.reactions;
create policy "reactions insert own on visible target" on public.reactions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.can_view_target(target_type, target_id)
    and not public.users_are_blocked(private.social_target_owner_id(target_type, target_id))
  );

drop policy "comments select visible" on public.comments;
create policy "comments select visible" on public.comments
  for select to anon, authenticated
  using (
    public.can_view_target(target_type, target_id)
    and not public.users_are_blocked(author_id)
    and not public.users_are_blocked(private.social_target_owner_id(target_type, target_id))
  );

drop policy "comments insert own on visible target" on public.comments;
create policy "comments insert own on visible target" on public.comments
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and public.can_view_target(target_type, target_id)
    and not public.users_are_blocked(private.social_target_owner_id(target_type, target_id))
  );

-- Club targets stay visible to moderators for safety even when a moderator has
-- personally blocked the author.
drop policy "club_posts select member" on public.club_posts;
create policy "club_posts select member" on public.club_posts
  for select to authenticated
  using (
    public.is_club_member(club_id)
    and (
      not public.users_are_blocked(author_id)
      or public.has_min_club_role(club_id, 'moderator')
    )
  );

drop policy "club_activities select member" on public.club_activities;
create policy "club_activities select member" on public.club_activities
  for select to authenticated
  using (
    public.is_club_member(club_id)
    and (
      not public.users_are_blocked(created_by)
      or public.has_min_club_role(club_id, 'moderator')
    )
  );

drop policy "club_activity_checkpoints select member" on public.club_activity_checkpoints;
create policy "club_activity_checkpoints select member" on public.club_activity_checkpoints
  for select to authenticated
  using (
    exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and public.is_club_member(ca.club_id)
        and (
          not public.users_are_blocked(created_by)
          or public.has_min_club_role(ca.club_id, 'moderator')
        )
    )
  );
