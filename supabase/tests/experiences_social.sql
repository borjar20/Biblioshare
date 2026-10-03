begin;
create temporary table xps(k text primary key,id uuid not null default gen_random_uuid());
insert into xps(k) values('owner'),('member'),('visitor'),('admin'),('root'),('post'),('target'),('participant'),('moment'),('comment'),('comment_target'),('notification'),('photo'),('pending');
grant select,update on xps to anon,authenticated;
insert into auth.users(id) select id from xps where k in ('owner','member','visitor','admin');
insert into public.profiles(user_id,username,is_public,role) select id,'social_'||left(replace(id::text,'-',''),15),true,case when k='admin' then 'admin'::public.user_role else 'user'::public.user_role end from xps where k in ('owner','member','visitor','admin');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xps where k='owner'),true);
update xps set id=(public.experience_create('{"title":"[TEST] social","state":"lived","kind":"walk"}')->>'id')::uuid where k='root';
do $$ begin
  begin perform public.experience_publish((select id from xps where k='root')); raise exception 'FAIL private publication'; exception when insufficient_privilege then null; end;
  perform public.experience_update((select id from xps where k='root'),(select revision from public.experiences where id=(select id from xps where k='root')),'{"title":"[TEST] social","state":"lived","shape":"single","audience":"profile"}');
  begin insert into public.posts(author_id,kind,anchor_type,anchor_id) values(auth.uid(),'experience','experience',(select id from xps where k='root')); raise exception 'FAIL direct publication'; exception when insufficient_privilege then null; end;
end $$;
update xps set id=(public.experience_publish((select id from xps where k='root'))->>'id')::uuid where k='post';
do $$ begin
  if (public.experience_publish((select id from xps where k='root'))->>'id')::uuid<>(select id from xps where k='post') then raise exception 'FAIL idempotency'; end if;
  if (select count(*) from public.posts where anchor_type='experience' and anchor_id=(select id from xps where k='root'))<>1 then raise exception 'FAIL duplicate'; end if;
end $$;
update xps set id=(select id from public.interaction_targets where kind='post' and source_id=(select id from xps where k='post')) where k='target';
update xps set id=(select id from public.experience_moments where experience_id=(select id from xps where k='root')) where k='moment';
update xps set id=(public.experience_invite((select id from xps where k='root'),(select id from xps where k='member'))->>'id')::uuid where k='participant';
select set_config('request.jwt.claim.sub',(select id::text from xps where k='member'),true);
do $$ begin
  if exists(select 1 from public.get_profile_experiences(auth.uid())) then raise exception 'FAIL pending profile'; end if;
end $$;
select public.experience_respond_invitation((select id from xps where k='participant'),'accept');
do $$ begin
  if exists(select 1 from public.get_profile_experiences(auth.uid(),'lived')) then raise exception 'FAIL unconfirmed lived'; end if;
end $$;
select public.experience_set_attendance((select id from xps where k='moment'),'attended');
do $$ begin
  if not exists(select 1 from public.get_profile_experiences(auth.uid(),'lived')) then raise exception 'FAIL confirmed lived'; end if;
end $$;
insert into public.comments(id,author_id,interaction_target_id,body) select (select id from xps where k='comment'),auth.uid(),(select id from xps where k='target'),'[TEST] experience comment';
update xps set id=(select id from public.interaction_targets where kind='comment' and source_id=(select id from xps where k='comment')) where k='comment_target';
reset role;
insert into public.notifications(id,user_id,actor_id,type,target_type,target_id,interaction_target_id) select (select id from xps where k='notification'),(select id from xps where k='visitor'),(select id from xps where k='member'),'comment_liked','comment',(select id from xps where k='comment'),(select id from xps where k='comment_target');
insert into public.experience_photos(id,experience_id,author_id,storage_path,mime_type,status) select id,(select id from xps where k='root'),(select id from xps where k='owner'),(select id::text from xps where k='root')||'/'||(select id::text from xps where k='owner')||'/'||id||'.png','image/png',case when k='photo' then 'ready' else 'pending' end from xps where k in ('photo','pending');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if not public.can_view_target('post',(select id from xps where k='post')) or not public.can_view_interaction_target((select id from xps where k='target')) then raise exception 'FAIL public targets'; end if;
  if exists(select 1 from public.get_profile_experiences((select id from xps where k='member'))) then raise exception 'FAIL identity consent'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xps where k='visitor'),true);
do $$ begin
  begin perform public.experience_publish((select id from xps where k='root')); raise exception 'FAIL foreign publication'; exception when insufficient_privilege then null; end;
  begin insert into public.posts(author_id,kind,anchor_type,anchor_id) values(auth.uid(),'thought','experience',(select id from xps where k='root')); raise exception 'FAIL forged anchor'; exception when insufficient_privilege or check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xps where k='owner'),true);
select public.experience_update((select id from xps where k='root'),(select revision from public.experiences where id=(select id from xps where k='root')),'{"title":"[TEST] social","state":"lived","shape":"single","audience":"private"}');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if exists(select 1 from public.posts where id=(select id from xps where k='post')) or public.can_view_interaction_target((select id from xps where k='target')) then raise exception 'FAIL private descendants'; end if;
  if public.can_view_interaction_target((select id from xps where k='comment_target')) then raise exception 'FAIL private comment target'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xps where k='visitor'),true);
do $$ begin
  if exists(select 1 from public.notifications where id=(select id from xps where k='notification')) then raise exception 'FAIL private notification'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xps where k='owner'),true);
select public.experience_update((select id from xps where k='root'),(select revision from public.experiences where id=(select id from xps where k='root')),'{"title":"[TEST] social","state":"lived","shape":"single","audience":"profile"}');
select set_config('request.jwt.claim.sub',(select id::text from xps where k='visitor'),true);
select public.experience_report((select id from xps where k='root'),'spam','[TEST] report');
do $$ begin
  if exists(select 1 from public.content_reports where target_id=(select id from xps where k='root')) then raise exception 'FAIL private report evidence'; end if;
  begin perform public.admin_moderation_photo((select id from xps where k='photo')); raise exception 'FAIL nonadmin evidence'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from xps where k='admin'),true);
select public.admin_moderate_content('post',(select id from xps where k='post'),'remove','[TEST] independent','');
select public.admin_moderate_content('experience',(select id from xps where k='root'),'remove','[TEST] root','');
do $$ begin
  if public.experience_can_read_photo((select id from xps where k='photo')) then raise exception 'FAIL removed photo'; end if;
  if public.admin_moderation_photo((select id from xps where k='photo')) is null then raise exception 'FAIL admin evidence'; end if;
  if jsonb_array_length(public.admin_moderation_list('experience','removed',(select id::text from xps where k='root'),0)->'items')<>1 then raise exception 'FAIL experience admin list'; end if;
end $$;
select public.admin_moderate_content('experience',(select id from xps where k='root'),'restore','[TEST] root','');
do $$ begin
  if public.can_view_target('post',(select id from xps where k='post')) then raise exception 'FAIL independently removed post resurrected'; end if;
end $$;
select public.admin_moderate_content('post',(select id from xps where k='post'),'restore','[TEST] post','');
select public.admin_moderate_content('post',(select id from xps where k='post'),'delete','[TEST] post','ELIMINAR');
select set_config('request.jwt.claim.sub',(select id::text from xps where k='owner'),true);
do $$ begin
  if not exists(select 1 from public.experiences where id=(select id from xps where k='root')) then raise exception 'FAIL deleting post deleted memory'; end if;
  begin perform public.experience_publish((select id from xps where k='root')); raise exception 'FAIL moderated post recreated'; exception when insufficient_privilege then null; end;
end $$;
select public.experience_delete((select id from xps where k='root'),'[TEST] social');
select set_config('request.jwt.claim.sub',(select id::text from xps where k='admin'),true);
do $$ begin
  if public.admin_moderation_photo((select id from xps where k='photo')) is null then raise exception 'FAIL deleted evidence lost'; end if;
  if public.admin_moderation_photo((select id from xps where k='pending')) is not null then raise exception 'FAIL pending evidence'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from private.moderation_operations where transaction_id=txid_current()) then raise exception 'FAIL marker retained'; end if;
  if not public.moderation_photo_is_evidence((select storage_path from private.experience_photo_cleanup where storage_path like '%'||(select id::text from xps where k='photo')||'.png')) then raise exception 'FAIL evidence retention'; end if;
end $$;
rollback;
