begin;
create temporary table xr(k text primary key,id uuid not null default gen_random_uuid());
insert into xr(k) values('owner'),('member'),('absent'),('outsider'),('blocked'),('root'),('moment'),('moment2'),('memberrow'),('absentrow'),('review'),('post');
grant select,update on xr to anon,authenticated;
insert into auth.users(id) select id from xr where k in ('owner','member','absent','outsider','blocked');
insert into public.profiles(user_id,username,is_public) select id,'rev_'||left(replace(id::text,'-',''),15),true from xr where k in ('owner','member','absent','outsider','blocked');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
-- Task 2: new kinds are accepted; unknown kinds are rejected.
update xr set id=(public.experience_create('{"title":"[TEST] reviews","kind":"food","state":"lived"}')->>'id')::uuid where k='root';
do $$ begin
  if (select kind from public.experience_moments where experience_id=(select id from xr where k='root'))<>'food' then raise exception 'FAIL food kind'; end if;
  begin perform public.experience_create('{"title":"x","kind":"karaoke","state":"lived"}'); raise exception 'FAIL unknown kind'; exception when sqlstate '22023' then null; end;
end $$;
-- Task 3 setup: owner invites member and absent; both accept. The experience is lived.
update xr set id=(select id from public.experience_moments where experience_id=(select id from xr where k='root')) where k='moment';
update xr set id=(public.experience_invite((select id from xr where k='root'),(select id from xr where k='member'))->>'id')::uuid where k='memberrow';
update xr set id=(public.experience_invite((select id from xr where k='root'),(select id from xr where k='absent'))->>'id')::uuid where k='absentrow';
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_respond_invitation((select id from xr where k='memberrow'),'accept');
select set_config('request.jwt.claim.sub',(select id::text from xr where k='absent'),true);
select public.experience_respond_invitation((select id from xr where k='absentrow'),'accept');
select public.experience_set_attendance((select id from xr where k='moment'),'skipped');
-- Member whose attendance is still the default 'planned' cannot review.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
do $$ begin
  begin perform public.experience_save_moment_review((select id from xr where k='moment'),8::smallint,'Genial'); raise exception 'FAIL review without attendance'; exception when insufficient_privilege then null; end;
end $$;
select public.experience_set_attendance((select id from xr where k='moment'),'attended');
update xr set id=(public.experience_save_moment_review((select id from xr where k='moment'),8::smallint,'  Genial  ')->>'id')::uuid where k='review';
do $$ declare r public.experience_moment_reviews; begin
  select * into r from public.experience_moment_reviews where id=(select id from xr where k='review');
  if r.body<>'Genial' or r.rating<>8 or r.share_with_profile then raise exception 'FAIL normalized review'; end if;
  begin perform public.experience_save_moment_review((select id from xr where k='moment'),11::smallint,null); raise exception 'FAIL rating range'; exception when sqlstate '22023' then null; end;
  begin perform public.experience_save_moment_review((select id from xr where k='moment'),null,repeat('a',4001)); raise exception 'FAIL body limit'; exception when sqlstate '22023' then null; end;
  -- Upsert keeps one row per person and moment.
  perform public.experience_save_moment_review((select id from xr where k='moment'),9::smallint,'Genial');
  if (select count(*) from public.experience_moment_reviews where moment_id=(select id from xr where k='moment'))<>1 then raise exception 'FAIL upsert duplicated'; end if;
  -- Direct writes are closed.
  begin insert into public.experience_moment_reviews(experience_id,moment_id,participant_id,author_id,rating) values((select id from xr where k='root'),(select id from xr where k='moment'),(select id from xr where k='memberrow'),auth.uid(),5); raise exception 'FAIL direct insert'; exception when insufficient_privilege then null; end;
end $$;
-- Group members read it; outsiders and anon do not without consent.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='absent'),true);
do $$ begin if not exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL group read'; end if; end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
select public.experience_update((select id from xr where k='root'),(select revision from public.experiences where id=(select id from xr where k='root')),'{"title":"[TEST] reviews","state":"lived","shape":"single","audience":"profile"}');
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL outsider read without consent'; end if; end $$;
-- Consent needs both review sharing and the author's share_identity.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_review_sharing((select id from xr where k='review'),true);
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL shared without identity'; end if; end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_share_identity((select id from xr where k='root'),true);
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin if not exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL consented outsider read'; end if; end $$;
-- The per-review flag alone gates outside reading: withdrawing it hides the review again.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_review_sharing((select id from xr where k='review'),false);
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL unshared outsider read'; end if; end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_review_sharing((select id from xr where k='review'),true);
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
-- Only the author changes sharing or deletes.
do $$ begin
  begin perform public.experience_set_review_sharing((select id from xr where k='review'),false); raise exception 'FAIL foreign sharing'; exception when insufficient_privilege then null; end;
  begin perform public.experience_delete_moment_review((select id from xr where k='review')); raise exception 'FAIL foreign delete'; exception when insufficient_privilege then null; end;
end $$;
-- Hidden, not destroyed, while not lived.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
select public.experience_update((select id from xr where k='root'),(select revision from public.experiences where id=(select id from xr where k='root')),'{"title":"[TEST] reviews","state":"planned","shape":"single","audience":"profile"}');
do $$ begin if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL planned shows reviews'; end if; end $$;
reset role;
do $$ begin if not exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL planned destroyed review'; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
select public.experience_update((select id from xr where k='root'),(select revision from public.experiences where id=(select id from xr where k='root')),'{"title":"[TEST] reviews","state":"lived","shape":"single","audience":"profile"}');
-- A creator/author block suspends outside attribution; the author can still withdraw under it.
-- Isolated in a savepoint: later blocks rely on no block and on the review still existing.
savepoint task3_block;
reset role;
insert into public.user_blocks(blocker_id,blocked_id) values((select id from xr where k='owner'),(select id from xr where k='member'));
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL blocked attribution'; end if; end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_review_sharing((select id from xr where k='review'),false);
select public.experience_delete_moment_review((select id from xr where k='review'));
reset role;
do $$ begin if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL withdrawal under block'; end if; end $$;
rollback to savepoint task3_block;
-- Back to the pre-block state (role authenticated as the owner); the review is restored.
do $$ begin
  if current_user<>'authenticated' or auth.uid()<>(select id from xr where k='owner') then raise exception 'FAIL savepoint session state'; end if;
  if not exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review') and rating=9 and share_with_profile) then raise exception 'FAIL savepoint restore'; end if;
end $$;
-- Guests have no account to call with (save looks up the caller's accepted row); anon has no EXECUTE.
reset role;
do $$ begin
  if has_function_privilege('anon','public.experience_save_moment_review(uuid,smallint,text)','execute') then raise exception 'FAIL anon execute'; end if;
  if exists(select 1 from pg_proc p where p.proname like 'experience%review%' and has_function_privilege('public',p.oid,'execute')) then raise exception 'FAIL public execute'; end if;
end $$;
-- Task 4: attendance change with a review is a conflict unless reviews are dropped.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
do $$ begin
  begin perform public.experience_set_attendance((select id from xr where k='moment'),'skipped'); raise exception 'FAIL orphan review'; exception when sqlstate 'PT409' then null; end;
end $$;
-- Rating summary only counts what the caller can see.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='absent'),true);
do $$ declare s record; begin
  select * into s from public.get_experience_rating_summaries(array[(select id from xr where k='root')]) where moment_id is null;
  if s.avg_rating<>9.0 or s.rating_count<>1 then raise exception 'FAIL group summary %',s; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_review_sharing((select id from xr where k='review'),false);
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin
  if exists(select 1 from public.get_experience_rating_summaries(array[(select id from xr where k='root')])) then raise exception 'FAIL summary leaks private rating'; end if;
end $$;
-- Ranked hub: own accepted experiences only, rated first.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
do $$ begin
  if (select id from public.get_own_experiences_ranked('all',null,null,0) limit 1)<>(select id from xr where k='root') then raise exception 'FAIL ranked hub'; end if;
  begin perform public.get_own_experiences_ranked('all','karaoke',null,0); raise exception 'FAIL ranked kind'; exception when sqlstate '22023' then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin if exists(select 1 from public.get_own_experiences_ranked('all',null,null,0)) then raise exception 'FAIL ranked foreign'; end if; end $$;
-- Dropping deletes the review in the same transaction.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_attendance((select id from xr where k='moment'),'skipped',true);
reset role;
do $$ begin if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL drop reviews'; end if; end $$;
do $$ begin if exists(select 1 from pg_proc where proname='experience_set_attendance' and pronargs=2) then raise exception 'FAIL ambiguous overload'; end if; end $$;
-- Task 5: publication needs consent + profile audience; one post; revoked with consent.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_attendance((select id from xr where k='moment'),'attended');
update xr set id=(public.experience_save_moment_review((select id from xr where k='moment'),7::smallint,'Otra vez')->>'id')::uuid where k='review';
do $$ begin
  begin perform public.experience_publish_review((select id from xr where k='review')); raise exception 'FAIL publish without consent'; exception when insufficient_privilege then null; end;
end $$;
select public.experience_set_review_sharing((select id from xr where k='review'),true);
update xr set id=(public.experience_publish_review((select id from xr where k='review'))->>'id')::uuid where k='post';
do $$ begin
  if (public.experience_publish_review((select id from xr where k='review'))->>'id')::uuid<>(select id from xr where k='post') then raise exception 'FAIL duplicate post'; end if;
  begin insert into public.posts(author_id,kind,anchor_type,anchor_id,source_kind,source_id) values(auth.uid(),'experience_review','experience',(select id from xr where k='root'),'experience_review',(select id from xr where k='review')); raise exception 'FAIL REST post'; exception when insufficient_privilege or check_violation or unique_violation then null; end;
  if not exists(select 1 from public.get_experience_review_publications(array[(select id from xr where k='review')]) where post_id=(select id from xr where k='post')) then raise exception 'FAIL own publications'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin if not exists(select 1 from public.posts where id=(select id from xr where k='post')) then raise exception 'FAIL outsider sees published review'; end if; end $$;
do $$ begin
  if exists(select 1 from public.get_experience_review_publications(array[(select id from xr where k='review')])) then raise exception 'FAIL foreign publications'; end if;
  begin perform public.experience_unpublish_review((select id from xr where k='review')); raise exception 'FAIL foreign unpublish'; exception when insufficient_privilege then null; end;
end $$;
-- Consent withdrawal removes the post even under a creator/author block or a moderated experience.
-- Isolated in a savepoint: later steps rely on no block, no moderation and the post still existing.
savepoint task5_withdrawal;
reset role;
insert into public.user_blocks(blocker_id,blocked_id) values((select id from xr where k='owner'),(select id from xr where k='member'));
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin if exists(select 1 from public.posts where id=(select id from xr where k='post')) then raise exception 'FAIL blocked review post visible'; end if; end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_review_sharing((select id from xr where k='review'),false);
reset role;
do $$ begin if exists(select 1 from public.posts where id=(select id from xr where k='post')) then raise exception 'FAIL consent revoke under block keeps post'; end if; end $$;
rollback to savepoint task5_withdrawal;
reset role;
insert into private.moderation_state(kind,target_id,removed_at) values('experience',(select id from xr where k='root'),now());
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_review_sharing((select id from xr where k='review'),false);
reset role;
do $$ begin if exists(select 1 from public.posts where id=(select id from xr where k='post')) then raise exception 'FAIL consent revoke under moderation keeps post'; end if; end $$;
rollback to savepoint task5_withdrawal;
reset role;
do $$ begin
  if not exists(select 1 from public.posts where id=(select id from xr where k='post')) then raise exception 'FAIL savepoint restore post'; end if;
  if exists(select 1 from private.moderation_operations where transaction_id=txid_current()) then raise exception 'FAIL leaked moderation marker'; end if;
end $$;
-- Review posts carry no text of their own: the owner cannot attach a body.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
do $$ begin
  begin update public.posts set body='x' where id=(select id from xr where k='post'); raise exception 'FAIL review post body';
  exception when sqlstate '23514' then if sqlerrm<>'invalid experience review publication' then raise; end if; end;
end $$;
-- Admin moderation of a review post cannot be undone by republishing (isolated in a savepoint).
reset role;
select set_config('request.jwt.claim.sub','',true);
insert into xr(k) values('admin');
insert into auth.users(id) select id from xr where k='admin';
insert into public.profiles(user_id,username,is_public,role) select id,'rev_'||left(replace(id::text,'-',''),15),true,'admin'::public.user_role from xr where k='admin';
savepoint task5_admin;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='admin'),true);
select public.admin_moderate_content('post',(select id from xr where k='post'),'delete','test','ELIMINAR');
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
do $$ begin
  begin perform public.experience_publish_review((select id from xr where k='review')); raise exception 'FAIL republish after admin delete';
  exception when insufficient_privilege then if sqlerrm<>'publication unavailable' then raise; end if; end;
end $$;
rollback to savepoint task5_admin;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='admin'),true);
select public.admin_moderate_content('post',(select id from xr where k='post'),'remove','test','');
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_unpublish_review((select id from xr where k='review'));
reset role;
do $$ begin if exists(select 1 from public.posts where id=(select id from xr where k='post')) then raise exception 'FAIL unpublish removed post'; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
do $$ begin
  begin perform public.experience_publish_review((select id from xr where k='review')); raise exception 'FAIL republish after admin remove';
  exception when insufficient_privilege then if sqlerrm<>'publication unavailable' then raise; end if; end;
end $$;
rollback to savepoint task5_admin;
-- Unpublishing keeps the review and its consent; republishing works.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_unpublish_review((select id from xr where k='review'));
do $$ begin
  if exists(select 1 from public.posts where kind='experience_review' and source_id=(select id from xr where k='review')) then raise exception 'FAIL unpublish'; end if;
  if not exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review') and share_with_profile) then raise exception 'FAIL unpublish touched review'; end if;
end $$;
-- The guard itself, not RLS, requires the RPC: a well-formed insert past RLS without the marker fails.
reset role;
do $$ begin
  begin insert into public.posts(author_id,kind,anchor_type,anchor_id,source_kind,source_id) values((select id from xr where k='member'),'experience_review','experience',(select id from xr where k='root'),'experience_review',(select id from xr where k='review')); raise exception 'FAIL guard without marker';
  exception when insufficient_privilege then if sqlerrm<>'publication RPC required' then raise; end if; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
update xr set id=(public.experience_publish_review((select id from xr where k='review'))->>'id')::uuid where k='post';
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_review_sharing((select id from xr where k='review'),false);
reset role;
do $$ begin
  if exists(select 1 from public.posts where id=(select id from xr where k='post')) then raise exception 'FAIL consent revoke keeps post'; end if;
  if exists(select 1 from private.moderation_operations where transaction_id=txid_current()) then raise exception 'FAIL leaked moderation marker'; end if;
end $$;
-- Deleting the review deletes its post too.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_review_sharing((select id from xr where k='review'),true);
update xr set id=(public.experience_publish_review((select id from xr where k='review'))->>'id')::uuid where k='post';
select public.experience_delete_moment_review((select id from xr where k='review'));
reset role;
do $$ begin if exists(select 1 from public.posts where id=(select id from xr where k='post')) then raise exception 'FAIL review delete keeps post'; end if; end $$;
-- Task 6: reports need current access; removal hides the review and its post.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
update xr set id=(public.experience_save_moment_review((select id from xr where k='moment'),6::smallint,'Reportable')->>'id')::uuid where k='review';
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin
  begin perform public.experience_report_review((select id from xr where k='review'),'spam'); raise exception 'FAIL report without access'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='absent'),true);
do $$ declare rep uuid; begin
  rep:=(public.experience_report_review((select id from xr where k='review'),'spam')->>'id')::uuid;
  if rep is null then raise exception 'FAIL group report'; end if;
end $$;
-- Fix round 1: the reporter cannot read the review report's evidence back.
do $$ begin
  if exists(select 1 from public.content_reports where target_type='experience_review' and target_id=(select id from xr where k='review')) then raise exception 'FAIL reporter reads review report evidence'; end if;
end $$;
reset role;
insert into private.moderation_state(kind,target_id,removed_at) values('experience_review',(select id from xr where k='review'),now());
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='absent'),true);
do $$ begin if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL removed review visible'; end if; end $$;
-- Task 6 (extra): a removed review cannot be reported; the report keeps author and snapshot.
do $$ begin
  begin perform public.experience_report_review((select id from xr where k='review'),'spam'); raise exception 'FAIL report removed review'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare c public.content_reports; begin
  select * into c from public.content_reports where target_type='experience_review' and target_id=(select id from xr where k='review');
  if c.reported_user_id is distinct from (select id from xr where k='member') or c.reporter_id is distinct from (select id from xr where k='absent')
    or c.snapshot->>'body'<>'Reportable' or (c.snapshot->>'rating')::int<>6 or (c.snapshot->>'experience_id')::uuid<>(select id from xr where k='root')
    or (c.snapshot->>'moment_id')::uuid<>(select id from xr where k='moment') then raise exception 'FAIL report snapshot %',to_jsonb(c); end if;
  if private.social_target_owner_id('experience_review',(select id from xr where k='review')) is distinct from (select id from xr where k='member') then raise exception 'FAIL review owner'; end if;
end $$;
delete from private.moderation_state where kind='experience_review' and target_id=(select id from xr where k='review');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
do $$ begin
  begin perform public.experience_report_review((select id from xr where k='review'),'spam'); raise exception 'FAIL self report'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='absent'),true);
do $$ begin
  begin perform public.experience_report_review((select id from xr where k='review'),'nope'); raise exception 'FAIL invalid reason'; exception when sqlstate '22023' then null; end;
  begin perform public.experience_report_review((select id from xr where k='review'),'other',repeat('a',2001)); raise exception 'FAIL details limit'; exception when sqlstate '22023' then null; end;
  begin perform public.experience_report_review(gen_random_uuid(),'spam'); raise exception 'FAIL missing review'; exception when sqlstate 'PT404' then null; end;
end $$;
-- Task 6 (extra): an admin lists and removes a review; its published post disappears for outsiders.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_set_review_sharing((select id from xr where k='review'),true);
update xr set id=(public.experience_publish_review((select id from xr where k='review'))->>'id')::uuid where k='post';
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin
  if not exists(select 1 from public.posts where id=(select id from xr where k='post')) then raise exception 'FAIL outsider sees published review post'; end if;
  if not public.can_view_target('experience_review',(select id from xr where k='review')) then raise exception 'FAIL can_view_target review'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='admin'),true);
do $$ declare l jsonb; begin
  l:=public.admin_moderation_list('experience_review','active',(select id::text from xr where k='review'),0)->'items';
  if jsonb_array_length(l)<>1 or (l->0->>'id')::uuid<>(select id from xr where k='review') or (l->0->>'author_id')::uuid<>(select id from xr where k='member') then raise exception 'FAIL admin list review %',l; end if;
end $$;
select public.admin_moderate_content('experience_review',(select id from xr where k='review'),'remove','test','');
do $$ begin
  if jsonb_array_length(public.admin_moderation_list('experience_review','removed',(select id::text from xr where k='review'),0)->'items')<>1 then raise exception 'FAIL admin list removed review'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='outsider'),true);
do $$ begin
  if exists(select 1 from public.posts where id=(select id from xr where k='post')) then raise exception 'FAIL removed review post visible'; end if;
  if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL removed review visible to outsider'; end if;
  if public.can_view_target('experience_review',(select id from xr where k='review')) then raise exception 'FAIL can_view_target removed review'; end if;
end $$;
-- Fix round 1: a removed review cannot be edited or blanked by its author.
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
do $$ begin
  begin perform public.experience_save_moment_review((select id from xr where k='moment'),7::smallint,'Edited'); raise exception 'FAIL edit removed review'; exception when insufficient_privilege then null; end;
  begin perform public.experience_save_moment_review((select id from xr where k='moment'),null,null); raise exception 'FAIL blank removed review'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='admin'),true);
select public.admin_moderate_content('experience_review',(select id from xr where k='review'),'restore','test','');
-- Removing the parent experience cascades to its reviews.
reset role;
savepoint task6_parent;
insert into private.moderation_state(kind,target_id,removed_at) values('experience',(select id from xr where k='root'),now());
do $$ begin
  if private.moderation_available('experience_review',(select id from xr where k='review')) then raise exception 'FAIL review cascade from experience'; end if;
end $$;
rollback to savepoint task6_parent;
-- Fix round 1: an admin hard delete of the experience records one review 'delete' row per review.
savepoint task6_experience_delete;
create temporary table task6_reviews on commit drop as select id from public.experience_moment_reviews where experience_id=(select id from xr where k='root');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='admin'),true);
select public.admin_moderate_content('experience',(select id from xr where k='root'),'delete','test','ELIMINAR');
reset role;
do $$ begin
  if (select count(*) from task6_reviews)<1 then raise exception 'FAIL no reviews before experience delete'; end if;
  if exists(select 1 from task6_reviews t where (select count(*) from private.moderation_history h where h.kind='experience_review' and h.target_id=t.id and h.action='delete')<>1) then raise exception 'FAIL review history on experience delete'; end if;
  if exists(select 1 from private.moderation_history h join task6_reviews t on t.id=h.target_id where h.kind='comment') then raise exception 'FAIL review recorded as comment on experience delete'; end if;
end $$;
rollback to savepoint task6_experience_delete;
-- Admin hard delete records exactly one history row for the review (isolated in a savepoint).
savepoint task6_delete;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='admin'),true);
select public.admin_moderate_content('experience_review',(select id from xr where k='review'),'delete','test','ELIMINAR');
reset role;
do $$ begin
  if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL admin delete review'; end if;
  if (select count(*) from private.moderation_history where kind='experience_review' and target_id=(select id from xr where k='review') and action='delete')<>1 then raise exception 'FAIL review delete history'; end if;
  if exists(select 1 from private.moderation_history where kind='comment' and target_id=(select id from xr where k='review')) then raise exception 'FAIL review recorded as comment'; end if;
  if exists(select 1 from private.moderation_operations where transaction_id=txid_current()) then raise exception 'FAIL leaked moderation marker'; end if;
end $$;
rollback to savepoint task6_delete;
-- Deletions outside a moderation operation record no history, even when the session user is an admin.
savepoint task6_admin_plain;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='admin'),true);
delete from public.experience_moment_reviews where id=(select id from xr where k='review');
do $$ begin
  if exists(select 1 from private.moderation_history where kind='experience_review' and action='delete') then raise exception 'FAIL plain admin delete recorded'; end if;
end $$;
rollback to savepoint task6_admin_plain;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_delete_moment_review((select id from xr where k='review'));
reset role;
do $$ begin
  if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL author delete'; end if;
  if exists(select 1 from private.moderation_history where kind='experience_review' and action='delete') then raise exception 'FAIL author delete recorded'; end if;
  -- Fix round 1: the review's report is closed when its target disappears.
  if exists(select 1 from public.content_reports where target_type='experience_review' and target_id=(select id from xr where k='review') and (target_deleted_at is null or status<>'actioned')) then raise exception 'FAIL review report not closed'; end if;
  if not exists(select 1 from public.content_reports where target_type='experience_review' and target_id=(select id from xr where k='review')) then raise exception 'FAIL review report missing'; end if;
end $$;
-- Final review I2: experience_reviewed goes only to members with current access to the experience.
-- Each case is isolated in a savepoint; the final state is unchanged.
savepoint notify_normal;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
do $$ declare n jsonb; begin
  n:=public.experience_save_moment_review((select id from xr where k='moment'),8::smallint,'Aviso')->'notifyUserIds';
  if not n ? (select id::text from xr where k='absent') or not n ? (select id::text from xr where k='owner') or n ? (select id::text from xr where k='member') then raise exception 'FAIL normal recipients %',n; end if;
end $$;
rollback to savepoint notify_normal;
savepoint notify_blocked;
reset role;
insert into public.user_blocks(blocker_id,blocked_id) values((select id from xr where k='absent'),(select id from xr where k='owner'));
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
do $$ declare n jsonb; begin
  n:=public.experience_save_moment_review((select id from xr where k='moment'),8::smallint,'Aviso')->'notifyUserIds';
  if n ? (select id::text from xr where k='absent') then raise exception 'FAIL recipient blocked with creator %',n; end if;
  if not n ? (select id::text from xr where k='owner') then raise exception 'FAIL creator dropped by unrelated block %',n; end if;
end $$;
rollback to savepoint notify_blocked;
savepoint notify_private;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
select public.experience_update((select id from xr where k='root'),(select revision from public.experiences where id=(select id from xr where k='root')),'{"title":"[TEST] reviews","state":"lived","shape":"single","audience":"private"}');
do $$ declare n jsonb; begin
  n:=public.experience_save_moment_review((select id from xr where k='moment'),8::smallint,'Privada')->'notifyUserIds';
  if n<>'[]'::jsonb then raise exception 'FAIL private experience notifies %',n; end if;
end $$;
rollback to savepoint notify_private;
-- Final review I3: privacy paths read as each actor. Each case is isolated in a savepoint.
reset role;
select set_config('request.jwt.claim.sub','',true);
insert into xr(k) values('invitee'),('invrow'),('guestrow'),('root2'),('root2row'),('ownreview');
insert into auth.users(id) select id from xr where k='invitee';
insert into public.profiles(user_id,username,is_public) select id,'rev_'||left(replace(id::text,'-',''),15),true from xr where k='invitee';
-- (a) An invited, not yet accepted, person cannot read a non-shared review.
savepoint privacy_invited;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
update xr set id=(public.experience_invite((select id from xr where k='root'),(select id from xr where k='invitee'))->>'id')::uuid where k='invrow';
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
update xr set id=(public.experience_save_moment_review((select id from xr where k='moment'),8::smallint,'Solo grupo')->>'id')::uuid where k='review';
select set_config('request.jwt.claim.sub',(select id::text from xr where k='invitee'),true);
do $$ begin
  if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL invited reads non-shared review'; end if;
  if exists(select 1 from public.get_experience_rating_summaries(array[(select id from xr where k='root')])) then raise exception 'FAIL invited reads private rating'; end if;
end $$;
reset role;
do $$ begin
  if (select invitation_state from public.experience_participants where id=(select id from xr where k='invrow'))<>'invited' then raise exception 'FAIL invitee setup'; end if;
  if (select share_with_profile from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL invitee setup review'; end if;
end $$;
rollback to savepoint privacy_invited;
-- (b) Anonymous readers see only a shared review (share_with_profile + share_identity) in a profile memory.
savepoint privacy_anon;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
update xr set id=(public.experience_save_moment_review((select id from xr where k='moment'),8::smallint,'Compartida')->>'id')::uuid where k='review';
select public.experience_set_review_sharing((select id from xr where k='review'),true);
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
update xr set id=(public.experience_save_moment_review((select id from xr where k='moment'),2::smallint,'No compartida')->>'id')::uuid where k='ownreview';
reset role;
do $$ begin
  if (select audience from public.experiences where id=(select id from xr where k='root'))<>'profile' then raise exception 'FAIL anon setup audience'; end if;
  if not (select share_identity from public.experience_participants where id=(select id from xr where k='memberrow')) then raise exception 'FAIL anon setup identity'; end if;
  if (select share_with_profile from public.experience_moment_reviews where id=(select id from xr where k='ownreview')) then raise exception 'FAIL anon setup own review'; end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ declare s record; begin
  if auth.uid() is not null then raise exception 'FAIL anon has a uid'; end if;
  if not exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL anon reads shared review'; end if;
  if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='ownreview')) then raise exception 'FAIL anon reads non-shared review'; end if;
  select * into s from public.get_experience_rating_summaries(array[(select id from xr where k='root')]) where moment_id is null;
  if s.rating_count is distinct from 1 or s.avg_rating is distinct from 8.0 then raise exception 'FAIL anon summary %',s; end if;
end $$;
rollback to savepoint privacy_anon;
-- (c) Removing a participant removes their reviews and their published post.
savepoint privacy_remove;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
update xr set id=(public.experience_save_moment_review((select id from xr where k='moment'),8::smallint,'Se va')->>'id')::uuid where k='review';
select public.experience_set_review_sharing((select id from xr where k='review'),true);
update xr set id=(public.experience_publish_review((select id from xr where k='review'))->>'id')::uuid where k='post';
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
select public.experience_remove_participant((select id from xr where k='memberrow'));
reset role;
do $$ begin
  if exists(select 1 from public.experience_participants where id=(select id from xr where k='memberrow')) then raise exception 'FAIL participant not removed'; end if;
  if exists(select 1 from public.experience_moment_reviews where id=(select id from xr where k='review')) then raise exception 'FAIL removal keeps review'; end if;
  if exists(select 1 from public.posts where id=(select id from xr where k='post')) then raise exception 'FAIL removal keeps review post'; end if;
  if exists(select 1 from private.moderation_operations where transaction_id=txid_current()) then raise exception 'FAIL leaked moderation marker'; end if;
end $$;
rollback to savepoint privacy_remove;
-- (d) A guest (no account) cannot carry a review, even on a direct superuser insert: the guard rejects it.
savepoint privacy_guest;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
update xr set id=(public.experience_add_guest((select id from xr where k='root'),'Invitada')->>'id')::uuid where k='guestrow';
reset role;
update public.experience_moment_participants set attendance_state='attended' where participant_id=(select id from xr where k='guestrow');
do $$ begin
  begin
    insert into public.experience_moment_reviews(experience_id,moment_id,participant_id,author_id,rating)
      values((select id from xr where k='root'),(select id from xr where k='moment'),(select id from xr where k='guestrow'),(select id from xr where k='owner'),5);
    raise exception 'FAIL guest review';
  exception when insufficient_privilege then if sqlerrm<>'attended lived account required' then raise; end if; end;
end $$;
rollback to savepoint privacy_guest;
-- (e) Ranked hub: a rated memory comes before a newer unrated one.
savepoint privacy_ranked;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='owner'),true);
update xr set id=(public.experience_create('{"title":"[TEST] reviews 2","kind":"food","state":"lived"}')->>'id')::uuid where k='root2';
update xr set id=(public.experience_invite((select id from xr where k='root2'),(select id from xr where k='member'))->>'id')::uuid where k='root2row';
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
select public.experience_respond_invitation((select id from xr where k='root2row'),'accept');
select public.experience_save_moment_review((select id from xr where k='moment'),3::smallint,null);
reset role;
update public.experiences set created_at=now()+interval '1 day' where id=(select id from xr where k='root2');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xr where k='member'),true);
do $$ declare ids uuid[]; begin
  select array_agg(r.id order by r.ordinality) into ids from public.get_own_experiences_ranked('all',null,null,0) with ordinality r;
  if array_length(ids,1) is distinct from 2 or ids[1]<>(select id from xr where k='root') or ids[2]<>(select id from xr where k='root2') then raise exception 'FAIL ranked order %',ids; end if;
end $$;
rollback to savepoint privacy_ranked;
rollback;
