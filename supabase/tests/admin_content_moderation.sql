-- #1183: real RLS identities, transactional fixtures; DEV/local only.
begin;
create temporary table moderation_fixture(k text primary key,id uuid not null default gen_random_uuid());
insert into moderation_fixture(k) values('admin'),('owner'),('member'),('moderator'),('outsider'),('club'),('post'),('club_post'),('comment'),('reply'),('book'),('pass'),('report');
grant select on moderation_fixture to anon,authenticated;
insert into moderation_fixture(k) values('event'),('notification'),('voice');
do $$ declare fixture_owner uuid; begin
  insert into auth.users(id) select id from moderation_fixture where k in ('admin','owner','member','moderator','outsider');
  insert into public.profiles(user_id,username,is_public,role)
    select id,'mod_'||left(replace(id::text,'-',''),15),true,case when k='admin' then 'admin'::public.user_role else 'user'::public.user_role end
    from moderation_fixture where k in ('admin','owner','member','moderator','outsider');
  select id into fixture_owner from moderation_fixture where k='owner';
  insert into public.books(id,title) select id,'[TEST] moderation' from moderation_fixture where k='book';
  insert into public.passes(id,user_id,item_type,item_id,is_active)
    select id,fixture_owner,'book',(select id from moderation_fixture where k='book'),true from moderation_fixture where k='pass';
  insert into public.clubs(id,slug,name,owner_id,visibility)
    select id,'mod-'||id::text,'[TEST] moderation',fixture_owner,'public' from moderation_fixture where k='club';
  insert into public.club_members(club_id,user_id,role,status)
    select (select id from moderation_fixture where k='club'),id,
      case k when 'owner' then 'owner'::public.club_role when 'moderator' then 'moderator'::public.club_role else 'member'::public.club_role end,'active'
    from moderation_fixture where k in ('owner','member','moderator');
  insert into public.posts(id,author_id,kind,anchor_type,anchor_id,body,source_kind,source_id)
    select id,fixture_owner,'thought','book',(select id from moderation_fixture where k='book'),'[TEST] post','pass',(select id from moderation_fixture where k='pass')
    from moderation_fixture where k='post';
  insert into public.club_posts(id,club_id,author_id,kind,body)
    select id,(select id from moderation_fixture where k='club'),fixture_owner,'text','[TEST] club post' from moderation_fixture where k='club_post';
  insert into public.club_activities(id,club_id,created_by,kind,title)
    select id,(select id from moderation_fixture where k='club'),fixture_owner,'criteria_challenge','[TEST] activity' from moderation_fixture where k='event';
  insert into public.notifications(id,user_id,actor_id,type,target_type,target_id)
    select id,(select id from moderation_fixture where k='member'),fixture_owner,'club_event_reminder','club_event',(select id from moderation_fixture where k='event') from moderation_fixture where k='notification';
  insert into public.comments(id,author_id,interaction_target_id,body)
    select f.id,fixture_owner,t.id,'[TEST] comment' from moderation_fixture f,public.interaction_targets t
      where f.k='comment' and t.kind='club_post' and t.source_id=(select id from moderation_fixture where k='club_post');
  insert into public.comments(id,author_id,interaction_target_id,parent_id,body)
    select f.id,fixture_owner,t.id,(select id from moderation_fixture where k='comment'),'[TEST] reply' from moderation_fixture f,public.interaction_targets t
      where f.k='reply' and t.kind='club_post' and t.source_id=(select id from moderation_fixture where k='club_post');
  insert into public.content_reports(id,reporter_id,target_type,target_id,reason,snapshot)
    select id,(select id from moderation_fixture where k='member'),'comment',(select id from moderation_fixture where k='comment'),'spam','{}' from moderation_fixture where k='report';
  insert into public.comments(id,author_id,interaction_target_id,body,audio_path,audio_duration_ms,audio_peaks)
    select f.id,fixture_owner,t.id,'','test/'||f.id::text||'.webm',2000,'{}'::smallint[] from moderation_fixture f,public.interaction_targets t
      where f.k='voice' and t.kind='club_post' and t.source_id=(select id from moderation_fixture where k='club_post');
end $$;

-- All three entry points reject non-admin identities, even privileged club owners.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from moderation_fixture where k='owner'),true);
do $$ begin
  begin perform public.admin_moderation_list('club','all','',0); raise exception 'FAIL nonadmin list'; exception when insufficient_privilege then null; end;
  begin perform public.admin_moderate_content('club',(select id from moderation_fixture where k='club'),'remove','test',''); raise exception 'FAIL nonadmin remove'; exception when insufficient_privilege then null; end;
  begin perform public.admin_review_report((select id from moderation_fixture where k='report'),'dismissed','test'); raise exception 'FAIL nonadmin report'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from moderation_fixture where k='admin'),true);
select public.admin_moderate_content('comment',(select id from moderation_fixture where k='comment'),'remove','test','');
select public.admin_moderate_content('club_post',(select id from moderation_fixture where k='club_post'),'remove','test','');
do $$ begin
  if exists(select 1 from public.club_posts where id=(select id from moderation_fixture where k='club_post')) then raise exception 'FAIL admin sees removed club post'; end if;
end $$;
select public.admin_moderate_content('club_post',(select id from moderation_fixture where k='club_post'),'restore','test','');
select public.admin_moderate_content('post',(select id from moderation_fixture where k='post'),'remove','test','');
select public.admin_moderate_content('club',(select id from moderation_fixture where k='club'),'remove','test','');
reset role;

do $$ declare who record; begin
  for who in select k,id from moderation_fixture where k in ('admin','owner','member','moderator','outsider') loop
    perform set_config('request.jwt.claim.sub',who.id::text,true);
    set local role authenticated;
    if exists(select 1 from public.clubs where id=(select id from moderation_fixture where k='club'))
      or exists(select 1 from public.club_identities where id=(select id from moderation_fixture where k='club'))
      or exists(select 1 from public.club_stats where club_id=(select id from moderation_fixture where k='club'))
      or exists(select 1 from public.club_members where club_id=(select id from moderation_fixture where k='club'))
      or exists(select 1 from public.club_posts where id=(select id from moderation_fixture where k='club_post'))
      or exists(select 1 from public.posts where id=(select id from moderation_fixture where k='post'))
      or exists(select 1 from public.comments where id in (select id from moderation_fixture where k in ('comment','reply')))
      or exists(select 1 from public.content_reports where id=(select id from moderation_fixture where k='report')) then raise exception 'FAIL hidden identity %',who.k; end if;
    if exists(select 1 from public.notifications where id=(select id from moderation_fixture where k='notification')) then raise exception 'FAIL legacy event notification leaked'; end if;
    if public.is_club_member((select id from moderation_fixture where k='club')) then raise exception 'FAIL membership helper'; end if;
    if public.can_view_target('comment',(select id from moderation_fixture where k='comment')) then raise exception 'FAIL visibility helper'; end if;
    begin
      insert into public.club_posts(club_id,author_id,kind,body) values((select id from moderation_fixture where k='club'),who.id,'text','blocked');
      raise exception 'FAIL write removed club';
    exception when insufficient_privilege then null; end;
    delete from public.posts where id=(select id from moderation_fixture where k='post');
    if found then raise exception 'FAIL ordinary delete removed post'; end if;
    begin perform public.pin_comment((select id from moderation_fixture where k='comment'),true); raise exception 'FAIL pin removed'; exception when insufficient_privilege then null; end;
    reset role;
  end loop;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if exists(select 1 from public.clubs where id=(select id from moderation_fixture where k='club'))
    or exists(select 1 from public.posts where id=(select id from moderation_fixture where k='post')) then raise exception 'FAIL anonymous sees removed'; end if;
end $$;
reset role;

-- Admin-only evidence and restoration preserve independent child removals.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from moderation_fixture where k='admin'),true);
do $$ begin
  if jsonb_array_length(public.admin_moderation_list('club','removed',(select id::text from moderation_fixture where k='club'),0)->'items')<>1 then raise exception 'FAIL admin list'; end if;
  if jsonb_array_length(public.admin_moderation_list('report','all',(select id::text from moderation_fixture where k='report'),0)->'items')<>1 then raise exception 'FAIL admin evidence'; end if;
  if public.admin_moderation_audio((select id from moderation_fixture where k='voice'))->>'audio_path' is distinct from 'test/'||(select id::text from moderation_fixture where k='voice')||'.webm' then raise exception 'FAIL removed audio evidence'; end if;
end $$;
select public.admin_moderate_content('club',(select id from moderation_fixture where k='club'),'restore','test','');
select public.admin_moderate_content('post',(select id from moderation_fixture where k='post'),'restore','test','');
select set_config('request.jwt.claim.sub',(select id::text from moderation_fixture where k='owner'),true);
do $$ begin
  if not exists(select 1 from public.clubs where id=(select id from moderation_fixture where k='club')) then raise exception 'FAIL restore club'; end if;
  if not exists(select 1 from public.posts where id=(select id from moderation_fixture where k='post')) then raise exception 'FAIL restore post'; end if;
  if exists(select 1 from public.comments where id in (select id from moderation_fixture where k in ('comment','reply'))) then raise exception 'FAIL restore resurrects independent child'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from moderation_fixture where k='admin'),true);
select public.admin_moderate_content('comment',(select id from moderation_fixture where k='comment'),'restore','test','');
select public.admin_review_report((select id from moderation_fixture where k='report'),'actioned','test');
do $$ begin
  begin
    perform public.admin_moderate_content('club',(select id from moderation_fixture where k='club'),'delete','test','wrong');
    raise exception 'FAIL confirmation accepted';
  exception when raise_exception then if sqlerrm<>'confirmation_required' then raise; end if; end;
end $$;
select public.admin_moderate_content('post',(select id from moderation_fixture where k='post'),'delete','test','ELIMINAR');
reset role;
do $$ begin
  insert into public.posts(author_id,kind,anchor_type,anchor_id,body,source_kind,source_id)
    values((select id from moderation_fixture where k='owner'),'thought','book',(select id from moderation_fixture where k='book'),'[TEST] recreated','pass',(select id from moderation_fixture where k='pass'));
  if found then raise exception 'FAIL generated post resurrected'; end if;
end $$;
set local role authenticated;
select public.admin_moderate_content('club',(select id from moderation_fixture where k='club'),'delete','test','[TEST] moderation');
do $$ begin
  if public.admin_moderation_audio((select id from moderation_fixture where k='voice'))->>'audio_path' is distinct from 'test/'||(select id::text from moderation_fixture where k='voice')||'.webm' then raise exception 'FAIL deleted audio evidence'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.clubs where id=(select id from moderation_fixture where k='club'))
    or exists(select 1 from public.club_posts where id=(select id from moderation_fixture where k='club_post'))
    or exists(select 1 from public.comments where id in(select id from moderation_fixture where k in ('comment','reply')))
    or exists(select 1 from public.club_members where club_id=(select id from moderation_fixture where k='club')) then raise exception 'FAIL cascade'; end if;
  if exists(select 1 from public.notifications where id=(select id from moderation_fixture where k='notification')) then raise exception 'FAIL stale event notification'; end if;
  if not exists(select 1 from public.passes where id=(select id from moderation_fixture where k='pass')) then raise exception 'FAIL personal pass lost'; end if;
  if not exists(select 1 from public.content_reports where id=(select id from moderation_fixture where k='report') and snapshot->>'body'='[TEST] comment' and target_deleted_at is not null) then raise exception 'FAIL evidence lost'; end if;
  if not exists(select 1 from private.moderation_history where target_id=(select id from moderation_fixture where k='club') and action='delete') then raise exception 'FAIL audit missing'; end if;
  if exists(select 1 from private.moderation_operations where transaction_id=txid_current()) then raise exception 'FAIL operation marker persisted'; end if;
  if not public.moderation_audio_is_evidence('test/'||(select id::text from moderation_fixture where k='voice')||'.webm') then raise exception 'FAIL audio retention lookup'; end if;
  if has_function_privilege('authenticated','public.moderation_audio_is_evidence(text)','EXECUTE') then raise exception 'FAIL evidence lookup publicly callable'; end if;
end $$;
rollback;
