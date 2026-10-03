begin;
create temporary table xp(k text primary key,id uuid not null default gen_random_uuid());
insert into xp(k) values('owner'),('one'),('two'),('other'),('root'),('first'),('second'),('invite1'),('invite2'),('guest');
grant select,update on xp to authenticated,anon;
insert into auth.users(id) select id from xp where k in ('owner','one','two','other');
insert into public.profiles(user_id,username,is_public) select id,'xp_'||left(replace(id::text,'-',''),15),k<>'one' from xp where k in ('owner','one','two','other');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xp where k='owner'),true);
update xp set id=(public.experience_create('{"title":"[TEST] trip","kind":"concert","state":"planned"}')->>'id')::uuid where k='root';
update xp set id=(select id from public.experience_moments where experience_id=(select id from xp where k='root')) where k='first';
update xp set id=(public.experience_save_moment((select id from xp where k='root'),0,'{"title":"Museum","kind":"museum"}')->>'id')::uuid where k='second';
update xp set id=(public.experience_invite((select id from xp where k='root'),(select id from xp where k='one'))->>'id')::uuid where k='invite1';
update xp set id=(public.experience_invite((select id from xp where k='root'),(select id from xp where k='two'))->>'id')::uuid where k='invite2';
update xp set id=(public.experience_add_guest((select id from xp where k='root'),'Private guest')->>'id')::uuid where k='guest';
do $$ begin
  if (select audience from public.experiences where id=(select id from xp where k='root'))<>'participants' then raise exception 'FAIL inviting did not open group'; end if;
  if (public.experience_invite((select id from xp where k='root'),(select id from xp where k='one'))->>'id')::uuid<>(select id from xp where k='invite1') then raise exception 'FAIL invite not idempotent'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xp where k='one'),true);
do $$ begin
  if exists(select 1 from public.experiences where id=(select id from xp where k='root')) then raise exception 'FAIL pending detail'; end if;
  if (select count(*) from public.get_experience_invitations())<>1 then raise exception 'FAIL invitation summary'; end if;
  begin perform public.experience_set_favorite((select id from xp where k='root'),(select id from xp where k='first')); raise exception 'FAIL pending favorite'; exception when insufficient_privilege then null; end;
  begin perform public.experience_respond_invitation((select id from xp where k='invite2'),'accept'); raise exception 'FAIL alien invitation'; exception when insufficient_privilege then null; end;
  perform public.experience_respond_invitation((select id from xp where k='invite1'),'accept');
  if exists(select 1 from public.experience_moment_participants where participant_id=(select id from xp where k='invite1') and attendance_state<>'planned') then raise exception 'FAIL accept confirmed presence'; end if;
  perform public.experience_set_attendance((select id from xp where k='first'),'attended');
  perform public.experience_set_attendance((select id from xp where k='second'),'skipped');
  perform public.experience_set_favorite((select id from xp where k='root'),(select id from xp where k='first'));
  perform public.experience_set_share_identity((select id from xp where k='root'),true);
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xp where k='two'),true);
select public.experience_respond_invitation((select id from xp where k='invite2'),'decline');
select public.experience_respond_invitation((select id from xp where k='invite2'),'accept');
select set_config('request.jwt.claim.sub',(select id::text from xp where k='owner'),true);
select public.experience_set_guest_attendance((select id from xp where k='second'),(select id from xp where k='guest'),'attended');
do $$ begin
  perform public.experience_update((select id from xp where k='root'),(select revision from public.experiences where id=(select id from xp where k='root')),'{"title":"[TEST] trip","state":"lived","shape":"trip","audience":"profile"}');
  if exists(select 1 from public.experience_moment_participants where participant_id=(select id from xp where k='invite2') and attendance_state<>'planned') then raise exception 'FAIL owner confirmed another account'; end if;
  begin perform public.experience_set_guest_attendance((select id from xp where k='first'),(select id from xp where k='invite1'),'skipped'); raise exception 'FAIL overwrite account'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
  if exists(select 1 from public.experience_participants where experience_id=(select id from xp where k='root')) then raise exception 'FAIL private profile or guest identity'; end if;
  if exists(select 1 from public.experience_favorites where experience_id=(select id from xp where k='root')) then raise exception 'FAIL favorite revealed private account'; end if;
  if exists(select 1 from public.get_experience_invitations()) then raise exception 'FAIL anonymous invitation summary'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xp where k='owner'),true);
select public.experience_remove_participant((select id from xp where k='invite1'));
do $$ begin
  perform public.experience_update((select id from xp where k='root'),(select revision from public.experiences where id=(select id from xp where k='root')),'{"title":"[TEST] trip","state":"lived","shape":"trip","audience":"participants"}');
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xp where k='one'),true);
do $$ begin
  if exists(select 1 from public.experiences where id=(select id from xp where k='root')) then raise exception 'FAIL removed member retains access'; end if;
  if exists(select 1 from public.experience_favorites where experience_id=(select id from xp where k='root')) then raise exception 'FAIL removed favorite'; end if;
end $$;
reset role;
insert into public.user_blocks(blocker_id,blocked_id) select (select id from xp where k='other'),id from xp where k='owner';
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xp where k='owner'),true);
do $$ declare i integer; begin
  begin perform public.experience_invite((select id from xp where k='root'),(select id from xp where k='other')); raise exception 'FAIL blocked invitation'; exception when sqlstate '22023' then null; end;
  begin perform public.experience_remove_participant((select id from public.experience_participants where experience_id=(select id from xp where k='root') and user_id=auth.uid())); raise exception 'FAIL owner removal'; exception when insufficient_privilege then null; end;
  for i in 1..27 loop perform public.experience_add_guest((select id from xp where k='root'),'Guest '||i); end loop;
  begin perform public.experience_add_guest((select id from xp where k='root'),'31st person'); raise exception 'FAIL participant limit'; exception when sqlstate 'PT429' then null; end;
  if (select count(*) from public.experience_participants where experience_id=(select id from xp where k='root'))<>30 then raise exception 'FAIL exact limit'; end if;
end $$;
reset role;
rollback;
