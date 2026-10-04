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
-- Guests have no account to call with (save looks up the caller's accepted row); anon has no EXECUTE.
reset role;
do $$ begin
  if has_function_privilege('anon','public.experience_save_moment_review(uuid,smallint,text)','execute') then raise exception 'FAIL anon execute'; end if;
  if exists(select 1 from pg_proc p where p.proname like 'experience%review%' and has_function_privilege('public',p.oid,'execute')) then raise exception 'FAIL public execute'; end if;
end $$;
rollback;
