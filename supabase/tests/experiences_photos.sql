begin;
create temporary table xph(k text primary key,id uuid not null default gen_random_uuid());
insert into xph(k) values('owner'),('member'),('outsider'),('root'),('moment'),('memberrow'),('photo'),('otherroot');
grant select,update on xph to anon,authenticated;
insert into auth.users(id) select id from xph where k in ('owner','member','outsider');
insert into public.profiles(user_id,username,is_public) select id,'photo_'||left(replace(id::text,'-',''),15),true from xph where k in ('owner','member','outsider');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xph where k='owner'),true);
update xph set id=(public.experience_create('{"title":"[TEST] photos","kind":"concert","state":"planned"}')->>'id')::uuid where k='root';
update xph set id=(select id from public.experience_moments where experience_id=(select id from xph where k='root')) where k='moment';
update xph set id=(public.experience_invite((select id from xph where k='root'),(select id from xph where k='member'))->>'id')::uuid where k='memberrow';
select set_config('request.jwt.claim.sub',(select id::text from xph where k='member'),true);
select public.experience_respond_invitation((select id from xph where k='memberrow'),'accept');
update xph set id=(public.experience_reserve_photo((select id from xph where k='root'),(select id from xph where k='moment'),'image/png')->>'id')::uuid where k='photo';
do $$ begin
  if public.experience_can_read_photo((select id from xph where k='photo')) then raise exception 'FAIL pending delivery'; end if;
  begin perform public.experience_finish_photo((select id from xph where k='photo')); raise exception 'FAIL confirming nonexistent bytes'; exception when sqlstate '22023' then null; end;
end $$;
reset role;
-- SQL fixture metadata only; the transaction never stores a real object.
insert into storage.objects(bucket_id,name,metadata) select 'experience-photos',storage_path,jsonb_build_object('size',100,'mimetype',mime_type) from public.experience_photos where id=(select id from xph where k='photo');
set local role authenticated;
do $$ begin
  perform public.experience_finish_photo((select id from xph where k='photo'));
  if not public.experience_can_read_photo((select id from xph where k='photo')) then raise exception 'FAIL group ready photo'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xph where k='owner'),true);
do $$ begin
  begin perform public.experience_set_cover((select id from xph where k='root'),(select id from xph where k='photo')); raise exception 'FAIL foreign cover'; exception when insufficient_privilege then null; end;
  begin perform public.experience_set_photo_sharing((select id from xph where k='photo'),true); raise exception 'FAIL foreign consent'; exception when insufficient_privilege then null; end;
  begin perform public.experience_reserve_photo((select id from xph where k='root'),(select id from xph where k='otherroot'),'image/png'); raise exception 'FAIL cross root moment'; exception when sqlstate '22023' then null; end;
  perform public.experience_update((select id from xph where k='root'),(select revision from public.experiences where id=(select id from xph where k='root')),'{"title":"[TEST] photos","state":"planned","shape":"single","audience":"profile"}');
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if exists(select 1 from public.experience_photos where experience_id=(select id from xph where k='root')) then raise exception 'FAIL raw metadata exposed'; end if;
  if public.experience_can_read_photo((select id from xph where k='photo')) or jsonb_array_length(public.get_experience_visible_photos((select id from xph where k='root')))<>0 then raise exception 'FAIL image without consent'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xph where k='member'),true);
select public.experience_set_photo_sharing((select id from xph where k='photo'),true);
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ declare projection jsonb; begin
  projection:=public.get_experience_visible_photos((select id from xph where k='root'));
  if not public.experience_can_read_photo((select id from xph where k='photo')) or jsonb_array_length(projection)<>1 then raise exception 'FAIL published image'; end if;
  if projection::text like '%storage_path%' or projection::text like '%'||(select id::text from xph where k='member')||'%' then raise exception 'FAIL path or hidden identity projection'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xph where k='owner'),true);
select public.experience_remove_participant((select id from xph where k='memberrow'));
do $$ begin
  perform public.experience_update((select id from xph where k='root'),(select revision from public.experiences where id=(select id from xph where k='root')),'{"title":"[TEST] photos","state":"planned","shape":"single","audience":"participants"}');
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xph where k='member'),true);
do $$ begin
  if public.experience_can_read_photo((select id from xph where k='photo')) then raise exception 'FAIL departed delivery'; end if;
  perform public.experience_delete_photo((select id from xph where k='photo'));
end $$;
reset role;
do $$ begin
  if not exists(select 1 from private.experience_photo_cleanup) then raise exception 'FAIL missing durable cleanup'; end if;
end $$;
-- An otherwise valid own photo from a different root cannot become this cover.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xph where k='owner'),true);
update xph set id=(public.experience_create('{"title":"[TEST] other photos","kind":"walk","state":"planned"}')->>'id')::uuid where k='otherroot';
reset role;
insert into public.experience_photos(experience_id,author_id,storage_path,mime_type,status)
select (select id from xph where k='otherroot'),(select id from xph where k='owner'),(select id::text from xph where k='otherroot')||'/'||(select id::text from xph where k='owner')||'/'||gen_random_uuid()||'.png','image/png','ready';
insert into public.experience_photos(experience_id,author_id,storage_path,mime_type,created_at)
select (select id from xph where k='root'),(select id from xph where k='owner'),(select id::text from xph where k='root')||'/'||(select id::text from xph where k='owner')||'/'||gen_random_uuid()||'.png','image/png',now()-interval '2 days' from generate_series(1,40);
set local role authenticated;
do $$ begin
  begin perform public.experience_set_cover((select id from xph where k='root'),(select id from public.experience_photos where experience_id=(select id from xph where k='otherroot'))); raise exception 'FAIL cross root cover'; exception when insufficient_privilege then null; end;
  begin perform public.experience_reserve_photo((select id from xph where k='root'),null,'image/png'); raise exception 'FAIL 41st photo'; exception when sqlstate 'PT429' then null; end;
  begin perform public.experience_cleanup_pending_photos(now()-interval '2 days',100); raise exception 'FAIL client cleanup'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin
  begin perform public.experience_cleanup_pending_photos(now(),100); raise exception 'FAIL unsafe cleanup age'; exception when sqlstate '22023' then null; end;
  if jsonb_array_length(public.experience_cleanup_pending_photos(now()-interval '1 day',100))<>40 then raise exception 'FAIL pending cleanup batch'; end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.experience_photos where status='ready' and experience_id=(select id from xph where k='otherroot')) then raise exception 'FAIL cleanup removed ready'; end if;
  if has_function_privilege('anon','public.experience_reserve_photo(uuid,uuid,text)','execute') or has_function_privilege('authenticated','public.moderation_photo_is_evidence(text)','execute') then raise exception 'FAIL widened mutation/evidence ACL'; end if;
end $$;
rollback;
