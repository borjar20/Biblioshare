-- Regression matrix for Social Phase 1 interaction targets.
-- Run against biblioshare-dev only. Every write is rolled back.
begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion_failed: %', p_message;
  end if;
end;
$function$;

create or replace function pg_temp.expect_sqlstate(p_sql text, p_expected_state text, p_message text)
returns void language plpgsql as $function$
declare v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = p_expected_state then return; end if;
    raise exception 'assertion_failed: % (expected SQLSTATE %, got %)', p_message, p_expected_state, v_state;
  end;
  raise exception 'assertion_failed: % (statement unexpectedly succeeded)', p_message;
end;
$function$;

insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000001a1', 'authenticated', 'authenticated', 'phase1-alice@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000001b2', 'authenticated', 'authenticated', 'phase1-bob@example.test', now(), now());
insert into public.profiles (user_id, username, display_name, is_public, role) values
  ('00000000-0000-4000-8000-0000000001a1', 'phase1_alice', 'Alice', true, 'user'),
  ('00000000-0000-4000-8000-0000000001b2', 'phase1_bob', 'Bob', true, 'user');
insert into public.books (id, title, author) values ('00000000-0000-4000-8000-000000000101', 'Phase 1 book', 'Test author');
insert into public.passes (id, user_id, item_type, item_id, is_active) values
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000001a1', 'book', '00000000-0000-4000-8000-000000000101', true);
insert into public.progress_sessions (id, user_id, pass_id, duration_minutes) values
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-000000000102', 20);
insert into public.clubs (id, slug, name, visibility, owner_id) values
  ('00000000-0000-4000-8000-000000000104', 'phase1-targets', 'Phase 1 targets', 'public', '00000000-0000-4000-8000-0000000001a1');
insert into public.club_members (club_id, user_id, role, status) values
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-0000000001a1', 'owner', 'active'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-0000000001b2', 'moderator', 'active');
insert into public.club_posts (id, club_id, author_id, kind, body) values
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-0000000001a1', 'text', 'Phase 1 cleanup post');
insert into public.club_activities (id, club_id, kind, title, created_by) values
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000104', 'buddy_read', 'Phase 1 activity', '00000000-0000-4000-8000-0000000001a1');
insert into public.club_activity_participants (activity_id, user_id) values
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-0000000001a1');
insert into public.club_activity_checkpoints (id, activity_id, label, position, "order", created_by) values
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000106', 'Checkpoint', '{}'::jsonb, 1, '00000000-0000-4000-8000-0000000001b2');
insert into public.club_activity_checkpoint_reads (checkpoint_id, user_id) values
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-0000000001a1');

select pg_temp.assert_true(to_regclass('public.interaction_targets') is not null, 'interaction_targets exists');
select pg_temp.assert_true(exists (select 1 from public.interaction_targets where kind = 'pass' and source_id = '00000000-0000-4000-8000-000000000102'), 'pass source gets canonical target');
select pg_temp.assert_true(
  (select audience_kind = 'profile' from public.interaction_targets where kind = 'diary_entry' and source_id = '00000000-0000-4000-8000-000000000102')
  and (select audience_kind = 'club_member' from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105')
  and (select audience_kind = 'activity_participant' from public.interaction_targets where kind = 'club_activity' and source_id = '00000000-0000-4000-8000-000000000106')
  and (select audience_kind = 'checkpoint_reached' from public.interaction_targets where kind = 'activity_checkpoint' and source_id = '00000000-0000-4000-8000-000000000107'),
  'all four audience kinds are materialized'
);
select pg_temp.assert_true(
  (select owner_id = '00000000-0000-4000-8000-0000000001b2'
   from public.interaction_targets
   where kind = 'activity_checkpoint' and source_id = '00000000-0000-4000-8000-000000000107'),
  'checkpoint target owner is the checkpoint creator, not the activity creator'
);

insert into public.comments (id, target_type, target_id, author_id, body) values
  ('00000000-0000-4000-8000-000000000108', 'club_post', '00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-0000000001b2', 'Cleanup comment');
insert into public.reactions (id, target_type, target_id, user_id, kind) values
  ('00000000-0000-4000-8000-000000000109', 'club_post', '00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-0000000001b2', 'like');
insert into public.notifications (id, user_id, actor_id, type, target_type, target_id) values
  ('00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000001b2', 'club_post_commented', 'club_post', '00000000-0000-4000-8000-000000000105');
set local role service_role;
insert into public.notifications (id, user_id, actor_id, type, interaction_target_id) values
  (
    '00000000-0000-4000-8000-000000000112',
    '00000000-0000-4000-8000-0000000001a1',
    '00000000-0000-4000-8000-0000000001b2',
    'club_post_liked',
    (select id from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105')
  );
reset role;
select pg_temp.assert_true(
  (select n.interaction_target_id = t.id
   from public.notifications n
   join public.interaction_targets t on t.kind = 'club_post' and t.source_id = '00000000-0000-4000-8000-000000000105'
   where n.id = '00000000-0000-4000-8000-000000000112'),
  'service-role canonical-only notification insert preserves interaction target'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001a1","role":"authenticated"}', true);
set local role authenticated;
update public.notifications
set interaction_target_id = (
  select id from public.interaction_targets where kind = 'pass' and source_id = '00000000-0000-4000-8000-000000000102'
)
where id = '00000000-0000-4000-8000-000000000112';
reset role;
select pg_temp.assert_true(
  (select interaction_target_id is null from public.notifications where id = '00000000-0000-4000-8000-000000000112'),
  'updating canonical-only notification cannot introduce client-controlled target metadata'
);
insert into public.content_reports (id, reporter_id, target_type, target_id, reason, snapshot) values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-0000000001b2', 'club_post', '00000000-0000-4000-8000-000000000105', 'spam', '{}'::jsonb);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001b2","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(public.can_view_interaction_target((select id from public.interaction_targets where kind = 'pass' and source_id = '00000000-0000-4000-8000-000000000102')), 'public profile audience is visible');
select pg_temp.assert_true(public.can_view_interaction_target((select id from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105')), 'club member audience is visible');
select pg_temp.assert_true(not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'club_activity' and source_id = '00000000-0000-4000-8000-000000000106')), 'non-participant cannot view activity audience');
select pg_temp.assert_true(not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'activity_checkpoint' and source_id = '00000000-0000-4000-8000-000000000107')), 'viewer who has not reached checkpoint cannot view it');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001a1","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(public.can_view_interaction_target((select id from public.interaction_targets where kind = 'activity_checkpoint' and source_id = '00000000-0000-4000-8000-000000000107')), 'viewer who reached checkpoint can view it before blocking');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001b2","role":"authenticated"}', true);
set local role authenticated;
insert into public.user_blocks (blocker_id, blocked_id) values ('00000000-0000-4000-8000-0000000001b2', '00000000-0000-4000-8000-0000000001a1');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001a1","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'activity_checkpoint' and source_id = '00000000-0000-4000-8000-000000000107')), 'checkpoint owner blocking viewer hides checkpoint');
reset role;
delete from public.user_blocks
where blocker_id = '00000000-0000-4000-8000-0000000001b2'
  and blocked_id = '00000000-0000-4000-8000-0000000001a1';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.user_blocks (blocker_id, blocked_id) values ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000001b2');
select pg_temp.assert_true(not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'activity_checkpoint' and source_id = '00000000-0000-4000-8000-000000000107')), 'viewer blocking checkpoint owner hides checkpoint');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001b2","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(not public.can_view_interaction_target((select id from public.interaction_targets where kind = 'pass' and source_id = '00000000-0000-4000-8000-000000000102')), 'bidirectional block hides canonical target');
reset role;

select pg_temp.expect_sqlstate($$insert into public.comments (target_type, target_id, interaction_target_id, author_id, body) values ('club_post', '00000000-0000-4000-8000-000000000999', '00000000-0000-4000-8000-000000000999', '00000000-0000-4000-8000-0000000001b2', 'Bad target')$$, '23503', 'comment rejects unknown target UUID');
select pg_temp.expect_sqlstate($$insert into public.reactions (target_type, target_id, interaction_target_id, user_id, kind) values ('club_post', '00000000-0000-4000-8000-000000000999', '00000000-0000-4000-8000-000000000999', '00000000-0000-4000-8000-0000000001b2', 'like')$$, '23503', 'reaction rejects unknown target UUID');
update public.reactions
set interaction_target_id = '00000000-0000-4000-8000-000000000999'
where id = '00000000-0000-4000-8000-000000000109';
select pg_temp.assert_true(
  (select r.interaction_target_id = t.id
   from public.reactions r
   join public.interaction_targets t on t.kind = 'club_post' and t.source_id = '00000000-0000-4000-8000-000000000105'
   where r.id = '00000000-0000-4000-8000-000000000109'),
  'updating only canonical id is overwritten from legacy target pair'
);

delete from public.club_posts where id = '00000000-0000-4000-8000-000000000105';
select pg_temp.assert_true(not exists (select 1 from public.interaction_targets where kind = 'club_post' and source_id = '00000000-0000-4000-8000-000000000105'), 'deleting post deletes its target');
select pg_temp.assert_true(not exists (select 1 from public.comments where id = '00000000-0000-4000-8000-000000000108'), 'target cascade deletes comments');
select pg_temp.assert_true(not exists (select 1 from public.reactions where id = '00000000-0000-4000-8000-000000000109'), 'target cascade deletes reactions');
select pg_temp.assert_true(not exists (select 1 from public.notifications where id = '00000000-0000-4000-8000-000000000110'), 'target cascade deletes notifications');
select pg_temp.assert_true(exists (select 1 from public.content_reports where id = '00000000-0000-4000-8000-000000000111' and target_deleted_at is not null), 'report is preserved with deletion timestamp');

rollback;
