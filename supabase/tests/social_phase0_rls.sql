-- Regression matrix for social Phase 0.
-- Run against biblioshare-dev only. Every write is rolled back.
begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion_failed: %', p_message;
  end if;
end;
$function$;

create or replace function pg_temp.expect_sqlstate(
  p_sql text,
  p_expected_state text,
  p_message text
)
returns void
language plpgsql
as $function$
declare
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = p_expected_state then
      return;
    end if;
    raise exception 'assertion_failed: % (expected SQLSTATE %, got %)',
      p_message, p_expected_state, v_state;
  end;
  raise exception 'assertion_failed: % (statement unexpectedly succeeded)', p_message;
end;
$function$;

-- Fixed UUIDs make failures reproducible and the surrounding transaction makes
-- the script safe to repeat.
insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'phase0-alice@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'phase0-bob@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'phase0-cara@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', 'phase0-moderator@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000000e5', 'authenticated', 'authenticated', 'phase0-admin@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000000f6', 'authenticated', 'authenticated', 'phase0-outsider@example.test', now(), now());

insert into public.profiles (user_id, username, display_name, is_public, role)
values
  ('00000000-0000-4000-8000-0000000000a1', 'phase0_alice', 'Alice', true, 'user'),
  ('00000000-0000-4000-8000-0000000000b2', 'phase0_bob', 'Bob', true, 'user'),
  ('00000000-0000-4000-8000-0000000000c3', 'phase0_cara', 'Cara', true, 'user'),
  ('00000000-0000-4000-8000-0000000000d4', 'phase0_mod', 'Moderator', true, 'user'),
  ('00000000-0000-4000-8000-0000000000e5', 'phase0_admin', 'Admin', true, 'admin'),
  ('00000000-0000-4000-8000-0000000000f6', 'phase0_outsider', 'Outsider', true, 'user');

insert into public.clubs (id, slug, name, visibility, owner_id)
values (
  '10000000-0000-4000-8000-000000000001',
  'phase0-regression-club',
  'Phase 0 regression club',
  'public',
  '00000000-0000-4000-8000-0000000000a1'
);

insert into public.club_members (club_id, user_id, role, status)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'owner', 'active'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'member', 'active'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c3', 'member', 'active'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000d4', 'moderator', 'active');

insert into public.club_posts (id, club_id, author_id, kind, body)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'text', 'Target post'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'text', 'Cleanup target'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c3', 'text', 'Member-owned target');

-- Integrity: unsupported reactions and non-canonical comments are impossible.
select pg_temp.expect_sqlstate(
  $$insert into public.reactions (target_type, target_id, user_id, kind)
    values ('club_post', '20000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-0000000000c3', 'dislike')$$,
  '23514',
  'reactions.kind accepts only like'
);
select pg_temp.expect_sqlstate(
  $$insert into public.comments (target_type, target_id, author_id, body)
    values ('club_post', '20000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-0000000000c3', '   ')$$,
  '23514',
  'comments reject blank bodies'
);
select pg_temp.expect_sqlstate(
  $$insert into public.comments (target_type, target_id, author_id, body)
    values ('club_post', '20000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-0000000000c3', ' padded ')$$,
  '23514',
  'comments reject whitespace-padded bodies'
);
select pg_temp.expect_sqlstate(
  $$insert into public.comments (target_type, target_id, author_id, body)
    values ('club_post', '20000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-0000000000c3', repeat('x', 2001))$$,
  '23514',
  'comments reject bodies over 2000 characters'
);

-- Seed relationships and effects that a new block must clean atomically.
insert into public.follows (follower_id, followee_id, status)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', 'accepted');
insert into public.notifications (id, user_id, actor_id, type)
values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', 'new_follower'),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'new_follower');

-- Alice creates the block through the same authenticated/RLS boundary as the app.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.user_blocks (blocker_id, blocked_id)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2');
select pg_temp.assert_true(public.users_are_blocked('00000000-0000-4000-8000-0000000000b2'), 'blocker sees bidirectional block state');
select pg_temp.assert_true(
  public.filter_unblocked_user_ids(array[
    '00000000-0000-4000-8000-0000000000b2'::uuid,
    '00000000-0000-4000-8000-0000000000c3'::uuid,
    '00000000-0000-4000-8000-0000000000c3'::uuid
  ]) = array['00000000-0000-4000-8000-0000000000c3'::uuid],
  'batch filter removes blocked users and duplicates while preserving order'
);
reset role;

select pg_temp.assert_true(
  not exists (
    select 1 from public.follows
    where (follower_id, followee_id) = (
      '00000000-0000-4000-8000-0000000000a1'::uuid,
      '00000000-0000-4000-8000-0000000000b2'::uuid
    )
  ),
  'creating a block removes follows in both directions'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.notifications
    where id in (
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002'
    )
  ),
  'creating a block removes notifications in both directions'
);

-- The blocked party can inspect but cannot remove the other person's block.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(public.users_are_blocked('00000000-0000-4000-8000-0000000000a1'), 'blocked party sees bidirectional block state');
select pg_temp.assert_true((select count(*) = 1 from public.user_blocks), 'blocked party can inspect the blocking row');
delete from public.user_blocks
where blocker_id = '00000000-0000-4000-8000-0000000000a1'
  and blocked_id = '00000000-0000-4000-8000-0000000000b2';
select pg_temp.assert_true((select count(*) = 1 from public.user_blocks), 'blocked party cannot delete the blocker row');
select pg_temp.assert_true(
  not exists (select 1 from public.profiles where user_id = '00000000-0000-4000-8000-0000000000a1'),
  'blocking hides profile content from the blocked party'
);
select pg_temp.expect_sqlstate(
  $$insert into public.follows (follower_id, followee_id, status)
    values ('00000000-0000-4000-8000-0000000000b2',
      '00000000-0000-4000-8000-0000000000a1', 'accepted')$$,
  '42501',
  'blocked users cannot follow each other'
);
select pg_temp.expect_sqlstate(
  $$insert into public.comments (target_type, target_id, author_id, body)
    values ('club_post', '20000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-0000000000b2', 'Blocked interaction')$$,
  '42501',
  'blocked users cannot comment on each other targets'
);
reset role;

-- An unrelated authenticated user remains unaffected.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(
  (select count(*) = 2 from public.profiles where user_id in (
    '00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000b2'
  )),
  'unrelated users still see public profiles'
);
insert into public.comments (id, target_type, target_id, author_id, body)
values ('40000000-0000-4000-8000-000000000001', 'club_post', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c3', 'Reportable comment');
insert into public.content_reports (
  id, reporter_id, reported_user_id, target_type, target_id, reason, details, snapshot
)
values (
  '50000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000c3',
  '00000000-0000-4000-8000-0000000000f6',
  'club_post',
  '20000000-0000-4000-8000-000000000001',
  'spam',
  'Needs moderator review',
  '{"fake":true}'::jsonb
);
select pg_temp.assert_true((select count(*) = 1 from public.content_reports), 'reporter sees own report');
select pg_temp.assert_true(
  exists (
    select 1 from public.content_reports
    where id = '50000000-0000-4000-8000-000000000001'
      and reported_user_id = '00000000-0000-4000-8000-0000000000a1'
      and snapshot->>'body' = 'Target post'
      and not (snapshot ? 'fake')
  ),
  'report trigger derives accountable user and immutable snapshot from target'
);
reset role;

-- A report about a regular member's content stays private from that target owner.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
insert into public.content_reports (id, reporter_id, target_type, target_id, reason, snapshot)
values (
  '50000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-0000000000b2',
  'club_post',
  '20000000-0000-4000-8000-000000000003',
  'harassment',
  '{}'::jsonb
);
select pg_temp.assert_true(
  exists (select 1 from public.content_reports where id = '50000000-0000-4000-8000-000000000003'),
  'reporter sees their own report'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(
  not exists (select 1 from public.content_reports where id = '50000000-0000-4000-8000-000000000003'),
  'target owner cannot inspect reports without reviewer authority'
);
reset role;

-- The club owner is also a reviewer and can moderate the original target.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 2 from public.content_reports), 'club owner sees reports through reviewer authority');
delete from public.comments where id = '40000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  not exists (select 1 from public.comments where id = '40000000-0000-4000-8000-000000000001'),
  'target owner can moderate a comment'
);
reset role;

-- A club moderator can review club reports and moderate comments.
insert into public.comments (id, target_type, target_id, author_id, body)
values ('40000000-0000-4000-8000-000000000002', 'club_post', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'Moderator target');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 2 from public.content_reports), 'club moderator sees reports for their club');
update public.content_reports
set status = 'dismissed', resolution_note = 'Reviewed'
where id = '50000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  exists (
    select 1 from public.content_reports
    where id = '50000000-0000-4000-8000-000000000001'
      and status = 'dismissed'
      and reviewed_by = '00000000-0000-4000-8000-0000000000d4'
      and reviewed_at is not null
  ),
  'review transition stamps reviewer and timestamp'
);
delete from public.comments where id = '40000000-0000-4000-8000-000000000002';
select pg_temp.assert_true(
  not exists (select 1 from public.comments where id = '40000000-0000-4000-8000-000000000002'),
  'club moderator can moderate a comment'
);
reset role;

-- Global admins can inspect reports; unrelated users cannot moderate comments.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 2 from public.content_reports), 'admin sees all reports');
reset role;

insert into public.comments (id, target_type, target_id, author_id, body)
values ('40000000-0000-4000-8000-000000000003', 'club_post', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c3', 'Outsider target');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f6","role":"authenticated"}', true);
set local role authenticated;
delete from public.comments where id = '40000000-0000-4000-8000-000000000003';
reset role;
select pg_temp.assert_true(
  exists (select 1 from public.comments where id = '40000000-0000-4000-8000-000000000003'),
  'unrelated user cannot moderate a comment'
);

-- Deleting a polymorphic target removes interactions and notifications but
-- preserves the report as an audit row marked with target_deleted_at.
insert into public.comments (id, target_type, target_id, author_id, body)
values ('40000000-0000-4000-8000-000000000004', 'club_post', '20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c3', 'Cleanup comment');
insert into public.reactions (id, target_type, target_id, user_id, kind)
values
  ('60000000-0000-4000-8000-000000000001', 'club_post', '20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c3', 'like'),
  ('60000000-0000-4000-8000-000000000002', 'comment', '40000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000a1', 'like');
insert into public.notifications (id, user_id, actor_id, type, target_type, target_id)
values ('30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c3', 'club_post_commented', 'club_post', '20000000-0000-4000-8000-000000000002');
insert into public.content_reports (id, reporter_id, target_type, target_id, reason, details, snapshot)
values ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c3', 'club_post', '20000000-0000-4000-8000-000000000002', 'other', 'Preserve this audit row', '{}'::jsonb);

delete from public.club_posts where id = '20000000-0000-4000-8000-000000000002';

select pg_temp.assert_true(
  not exists (select 1 from public.comments where id = '40000000-0000-4000-8000-000000000004'),
  'target deletion removes child comments'
);
select pg_temp.assert_true(
  not exists (select 1 from public.reactions where id in (
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002'
  )),
  'target deletion removes direct and comment reactions'
);
select pg_temp.assert_true(
  not exists (select 1 from public.notifications where id = '30000000-0000-4000-8000-000000000003'),
  'target deletion removes notifications'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.content_reports
    where id = '50000000-0000-4000-8000-000000000002'
      and status = 'actioned'
      and target_deleted_at is not null
  ),
  'target deletion preserves and resolves report audit rows'
);

rollback;
