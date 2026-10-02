-- Canonical publication and parent access, preserving catalog/joint contracts.
alter table private.moderation_state drop constraint moderation_state_kind_check;
alter table private.moderation_state add constraint moderation_state_kind_check check(kind in ('club','post','club_post','comment','experience'));
create unique index posts_one_experience on public.posts(anchor_id) where kind='experience' and anchor_type='experience';
create function private.experience_evidence(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(e)||jsonb_build_object('photos',coalesce((select jsonb_agg(to_jsonb(p)) from public.experience_photos p where p.experience_id=e.id and p.status='ready'),'[]'::jsonb),
   'moments',coalesce((select jsonb_agg(to_jsonb(m)) from public.experience_moments m where m.experience_id=e.id),'[]'::jsonb)) from public.experiences e where e.id=p_id;
$$;
revoke all on function private.experience_evidence(uuid) from public,anon,authenticated;
create function private.guard_experience_post() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.kind='experience' or new.anchor_type='experience' then
    if tg_op='INSERT' and not exists(select 1 from private.moderation_operations where transaction_id=txid_current()) then raise exception 'publication RPC required' using errcode='42501'; end if;
    if new.kind<>'experience' or new.anchor_type<>'experience' or new.source_kind is not null or new.source_id is not null
      or not exists(select 1 from public.experiences e where e.id=new.anchor_id and e.creator_id=new.author_id and e.audience='profile' and private.moderation_available('experience',e.id))
      then raise exception 'invalid experience publication' using errcode='23514'; end if;
    if exists(select 1 from private.moderation_history h where h.kind='post' and h.action='delete' and h.snapshot->>'anchor_type'='experience' and h.snapshot->>'anchor_id'=new.anchor_id::text)
      then raise exception 'publication unavailable' using errcode='42501'; end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_experience_post() from public,anon,authenticated;
create trigger posts_experience_guard before insert or update on public.posts for each row execute function private.guard_experience_post();
create policy posts_experience_visible on public.posts as restrictive for select to anon,authenticated using(
  anchor_type<>'experience' or exists(select 1 from public.experiences e where e.id=anchor_id and e.audience='profile' and private.can_view_experience(e.id)));
create function public.experience_publish(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.experiences; post uuid; target uuid; created boolean:=false;
begin
  e:=private.experience_lock(p_id);
  if e.creator_id<>auth.uid() or e.audience<>'profile' then raise exception 'public owner required' using errcode='42501'; end if;
  select id into post from public.posts where kind='experience' and anchor_type='experience' and anchor_id=p_id;
  if post is not null and not private.moderation_available('post',post) then raise exception 'publication unavailable' using errcode='42501'; end if;
  if post is null then
    insert into private.moderation_operations values(txid_current()) on conflict do nothing;
    insert into public.posts(author_id,kind,anchor_type,anchor_id) values(auth.uid(),'experience','experience',p_id) returning id into post;
    delete from private.moderation_operations where transaction_id=txid_current();
    if post is null then raise exception 'publication unavailable' using errcode='42501'; end if;
    created:=true;
  end if;
  select id into target from public.interaction_targets where kind='post' and source_id=post;
  return jsonb_build_object('id',post,'experienceId',p_id,'actorId',auth.uid(),'targetId',target,'created',created);
end $$;
create function public.experience_unpublish(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.experiences;
begin
  e:=private.experience_lock(p_id);
  if e.creator_id<>auth.uid() then raise exception 'owner required' using errcode='42501'; end if;
  delete from public.posts where kind='experience' and anchor_type='experience' and anchor_id=p_id;
  return jsonb_build_object('experienceId',p_id);
end $$;
revoke all on function public.experience_publish(uuid),public.experience_unpublish(uuid) from public,anon;
grant execute on function public.experience_publish(uuid),public.experience_unpublish(uuid) to authenticated;
create function private.sync_experience_target() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform private.upsert_interaction_target('experience',new.id,new.creator_id,'profile',new.creator_id,'/experiencia/'||new.id,false,false,null,null);
  return new;
end $$;
revoke all on function private.sync_experience_target() from public,anon,authenticated;
create trigger experiences_sync_target after insert or update on public.experiences for each row execute function private.sync_experience_target();
insert into public.interaction_targets(kind,source_id,owner_id,audience_kind,audience_id,href,commentable,reactable,comment_notification_type,reaction_notification_type)
select 'experience',id,creator_id,'profile',creator_id,'/experiencia/'||id,false,false,null,null from public.experiences
on conflict(kind,source_id) do nothing;

create function public.get_profile_experiences(p_user_id uuid,p_state text default 'all',p_kind text default null,p_after_created timestamptz default null,p_after_id uuid default null)
returns setof public.experiences language plpgsql stable security definer set search_path='' as $$
begin
  if p_state is null or p_state not in ('all','planned','lived','cancelled') or (p_kind is not null and p_kind not in ('concert','show','exhibition','museum','walk','other')) or ((p_after_created is null)<>(p_after_id is null)) then raise exception 'invalid filters' using errcode='22023'; end if;
  if not public.can_view_profile(p_user_id) or public.users_are_blocked(p_user_id) then return; end if;
  return query select e.* from public.experiences e join public.experience_participants own on own.experience_id=e.id and own.user_id=p_user_id and own.invitation_state='accepted'
    where private.can_view_experience(e.id) and (p_user_id=auth.uid() or (e.audience='profile' and (e.creator_id=p_user_id or own.share_identity)))
      and (p_state='all' or (p_state='lived' and e.state<>'cancelled' and exists(select 1 from public.experience_moment_participants m where m.participant_id=own.id and m.attendance_state='attended')) or (p_state in ('planned','cancelled') and e.state=p_state))
      and (p_kind is null or exists(select 1 from public.experience_moments m where m.experience_id=e.id and m.kind=p_kind))
      and (p_after_created is null or (e.created_at,e.id)<(p_after_created,p_after_id))
    order by e.created_at desc,e.id desc limit 21;
end $$;
revoke all on function public.get_profile_experiences(uuid,text,text,timestamptz,uuid) from public;
grant execute on function public.get_profile_experiences(uuid,text,text,timestamptz,uuid) to anon,authenticated;

create function public.get_experience_publication(p_id uuid) returns uuid
language sql stable security definer set search_path='' as $$select p.id from public.posts p join public.experiences e on e.id=p.anchor_id where p.anchor_type='experience' and p.kind='experience' and e.id=p_id and e.creator_id=auth.uid() and private.can_view_experience(e.id)$$;
revoke all on function public.get_experience_publication(uuid) from public,anon;
grant execute on function public.get_experience_publication(uuid) to authenticated;

create function public.experience_report(p_id uuid,p_reason text,p_details text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.experiences; report uuid;
begin
  e:=private.experience_lock(p_id);
  if e.creator_id=auth.uid() then raise exception 'own report forbidden' using errcode='42501'; end if;
  if p_reason is null or p_reason not in ('spam','harassment','spoiler','hate','other') or char_length(coalesce(p_details,''))>2000 then raise exception 'invalid report' using errcode='22023'; end if;
  insert into public.content_reports(reporter_id,target_type,target_id,reason,details) values(auth.uid(),'experience',p_id,p_reason::public.content_report_reason,nullif(btrim(p_details),'')) returning id into report;
  return jsonb_build_object('id',report,'experienceId',p_id);
end $$;
revoke all on function public.experience_report(uuid,text,text) from public,anon;
grant execute on function public.experience_report(uuid,text,text) to authenticated;
create policy content_reports_experience_evidence_private on public.content_reports as restrictive for select to authenticated
 using(target_type<>'experience' and not coalesce(target_type='post' and snapshot->>'anchor_type'='experience',false));

CREATE OR REPLACE FUNCTION public.can_view_target(p_target_type target_kind, p_target_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.moderation_available(p_target_type::text,p_target_id) and case p_target_type
    when 'experience' then private.can_view_experience(p_target_id)
    when 'post' then exists(select 1 from public.posts p where p.id=p_target_id and public.can_view_profile(p.author_id) and not public.users_are_blocked(p.author_id)
      and (p.anchor_type<>'experience' or exists(select 1 from public.experiences e where e.id=p.anchor_id and e.audience='profile' and private.can_view_experience(e.id))))
    when 'diary_entry' then exists (
      select 1 from public.passes d where d.id = p_target_id and public.can_view_profile(d.user_id)
    )
    when 'episode_watch' then exists (
      select 1 from public.episode_watches e where e.id = p_target_id and public.can_view_profile(e.user_id)
    )
    when 'club_post' then exists (
      select 1 from public.club_posts cp where cp.id = p_target_id and public.is_club_member(cp.club_id)
    )
    when 'comment' then exists (
      select 1 from public.comments c
      join public.interaction_targets t on t.id = c.interaction_target_id
      where c.id = p_target_id
        and public.can_view_target(t.kind, t.source_id)
    )
    when 'activity_checkpoint' then exists (
      select 1 from public.club_activity_checkpoints cc
      where cc.id = p_target_id
        and public.is_activity_participant(cc.activity_id)
        and public.has_reached_checkpoint(cc.id)
    )
    when 'club_activity' then public.is_activity_participant(p_target_id)
    when 'pass' then exists (
      select 1 from public.passes p where p.id = p_target_id and public.can_view_profile(p.user_id)
    )
    when 'progress_session' then exists (
      select 1 from public.progress_sessions s where s.id = p_target_id and public.can_view_profile(s.user_id)
    )
  end;
$function$;
CREATE OR REPLACE FUNCTION private.can_view_interaction_target(p_interaction_target_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.interaction_targets t
    where t.id = p_interaction_target_id and private.moderation_available(t.kind::text,t.source_id)
      and not public.users_are_blocked(t.owner_id)
      and case when t.kind='experience' then private.can_view_experience(t.source_id)
        when t.kind in ('post','comment') then public.can_view_target(t.kind,t.source_id)
        else case t.audience_kind
        when 'profile' then public.can_view_profile(t.audience_id)
        when 'club_member' then public.is_club_member(t.audience_id)
        when 'activity_participant' then public.is_activity_participant(t.audience_id)
        when 'checkpoint_reached' then public.can_view_target('activity_checkpoint'::public.target_kind, t.audience_id)
      end end
  );
$function$;
CREATE OR REPLACE FUNCTION private.social_target_owner_id(p_target_type target_kind, p_target_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case p_target_type
    when 'experience' then (select creator_id from public.experiences where id=p_target_id)
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
    when 'post' then (select po.author_id from public.posts po where po.id = p_target_id)
  end;
$function$;
CREATE OR REPLACE FUNCTION private.prepare_content_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reported_user_id uuid;
  v_snapshot jsonb;
begin
  case new.target_type
    when 'experience' then
      select e.creator_id,private.experience_evidence(e.id) into v_reported_user_id,v_snapshot from public.experiences e where e.id=new.target_id;
    when 'post' then
      select p.author_id,to_jsonb(p)||case when p.anchor_type='experience' then jsonb_build_object('experience',private.experience_evidence(p.anchor_id)) else '{}'::jsonb end
        into v_reported_user_id,v_snapshot from public.posts p where p.id=new.target_id;
    when 'diary_entry' then
      select p.user_id, jsonb_build_object(
        'review', p.review,
        'item_type', p.item_type,
        'item_id', p.item_id,
        'created_at', p.created_at
      ) into v_reported_user_id, v_snapshot
      from public.passes p where p.id = new.target_id;
    when 'pass' then
      select p.user_id, jsonb_build_object(
        'review', p.review,
        'item_type', p.item_type,
        'item_id', p.item_id,
        'created_at', p.created_at
      ) into v_reported_user_id, v_snapshot
      from public.passes p where p.id = new.target_id;
    when 'episode_watch' then
      select e.user_id, jsonb_build_object(
        'review', e.review,
        'series_id', e.series_id,
        'created_at', e.created_at
      ) into v_reported_user_id, v_snapshot
      from public.episode_watches e where e.id = new.target_id;
    when 'progress_session' then
      select s.user_id, jsonb_build_object(
        'note', s.note,
        'pass_id', s.pass_id,
        'created_at', s.created_at
      ) into v_reported_user_id, v_snapshot
      from public.progress_sessions s where s.id = new.target_id;
    when 'club_post' then
      select cp.author_id, jsonb_build_object(
        'body', cp.body,
        'kind', cp.kind,
        'club_id', cp.club_id,
        'created_at', cp.created_at
      ) into v_reported_user_id, v_snapshot
      from public.club_posts cp where cp.id = new.target_id;
    when 'comment' then
      -- El snapshot conserva la identidad del padre (registro canónico) y,
      -- desde las notas de voz, la ruta del audio: el moderador necesita
      -- poder escucharlo aunque el autor borre el comentario después.
      select c.author_id, jsonb_build_object(
        'body', c.body,
        'audio_path', c.audio_path,
        'audio_duration_ms', c.audio_duration_ms,
        'target_type', t.kind,
        'target_id', t.source_id,
        'created_at', c.created_at
      ) into v_reported_user_id, v_snapshot
      from public.comments c
      join public.interaction_targets t on t.id = c.interaction_target_id
      where c.id = new.target_id;
    when 'activity_checkpoint' then
      select cc.created_by, jsonb_build_object(
        'label', cc.label,
        'position', cc.position,
        'activity_id', cc.activity_id,
        'created_at', cc.created_at
      ) into v_reported_user_id, v_snapshot
      from public.club_activity_checkpoints cc where cc.id = new.target_id;
    when 'club_activity' then
      select ca.created_by, jsonb_build_object(
        'title', ca.title,
        'description', ca.description,
        'kind', ca.kind,
        'club_id', ca.club_id,
        'created_at', ca.created_at
      ) into v_reported_user_id, v_snapshot
      from public.club_activities ca where ca.id = new.target_id;
  end case;

  if v_reported_user_id is null or v_snapshot is null then
    raise exception 'invalid_report_target' using errcode = '23503';
  end if;

  new.reported_user_id := v_reported_user_id;
  new.snapshot := v_snapshot;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.moderation_available(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;
begin
  if p_id is null then return true; end if;
  if exists(select 1 from private.moderation_state s where s.kind=p_kind and s.target_id=p_id
    and (s.removed_at is not null or s.deleted_at is not null)) then return false; end if;
  if p_kind='post' then
    return coalesce((select case when p.anchor_type='experience' then private.moderation_available('experience',p.anchor_id) else true end from public.posts p where p.id=p_id),true);
  elsif p_kind='club_post' then
    return coalesce((select private.moderation_available('club',c.club_id) from public.club_posts c where c.id=p_id),true);
  elsif p_kind in ('club_activity','club_event') then
    return coalesce((select private.moderation_available('club',c.club_id) from public.club_activities c where c.id=p_id),true);
  elsif p_kind='club_round' then
    return coalesce((select private.moderation_available('club',c.club_id) from public.club_rounds c where c.id=p_id),true);
  elsif p_kind='activity_checkpoint' then
    return coalesce((select private.moderation_available('club_activity',c.activity_id) from public.club_activity_checkpoints c where c.id=p_id),true);
  elsif p_kind='comment' then
    select c.parent_id,t.kind::text kind,t.source_id into r from public.comments c
      join public.interaction_targets t on t.id=c.interaction_target_id where c.id=p_id;
    if found then
      return private.moderation_available(r.kind,r.source_id)
        and (r.parent_id is null or private.moderation_available('comment',r.parent_id));
    end if;
  end if;
  return true;
end;
$function$;
CREATE OR REPLACE FUNCTION private.admin_moderation_list(p_kind text, p_status text, p_query text, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; tbl text; q text; field text;
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'admin'::public.user_role then raise exception 'admin_required' using errcode='42501'; end if;
  if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'invalid_offset'; end if;
  q:='%'||left(coalesce(p_query,''),200)||'%';
  if p_kind='report' then
    select coalesce(jsonb_agg(x.row),'[]') into result from (
      select to_jsonb(r) row from public.content_reports r
      where (p_status='all' or r.status=p_status) and (r.snapshot::text ilike q or coalesce(r.details,'') ilike q or r.id::text ilike q)
      order by r.created_at desc,r.id limit 26 offset p_offset
    ) x;
  elsif p_kind='history' then
    select coalesce(jsonb_agg(x.row),'[]') into result from (
      select to_jsonb(h) row from private.moderation_history h
      where h.reason ilike q or h.snapshot::text ilike q or h.target_id::text ilike q
      order by h.created_at desc,h.id limit 26 offset p_offset
    ) x;
  else
    tbl:=case p_kind when 'experience' then 'experiences' when 'club' then 'clubs' when 'post' then 'posts' when 'club_post' then 'club_posts' when 'comment' then 'comments' end;
    if tbl is null or p_status not in ('all','active','removed') then raise exception 'invalid_filter'; end if;
    field:=case when p_kind='club' then 'owner_id' when p_kind='experience' then 'creator_id' else 'author_id' end;
    execute format($q$
      select coalesce(jsonb_agg(x.row),'[]') from (
        select jsonb_build_object('id',c.id,'kind',$1,'title',coalesce(to_jsonb(c)->>'title',to_jsonb(c)->>'name',to_jsonb(c)->>'body',''),
          'body',coalesce(to_jsonb(c)->>'body',to_jsonb(c)->>'description',''),'author_id',c.%I,
          'author_name',coalesce(p.display_name,p.username),'created_at',c.created_at,
          'removed_at',s.removed_at,'parent_removed',s.removed_at is null and not private.moderation_available($1,c.id),
          'snapshot',case when $1='experience' then private.experience_evidence(c.id) else to_jsonb(c) end) row
        from public.%I c left join private.moderation_state s on s.kind=$1 and s.target_id=c.id
          left join public.profiles p on p.user_id=c.%I
        where ($2='all' or ($2='removed' and not private.moderation_available($1,c.id)) or ($2='active' and private.moderation_available($1,c.id)))
          and (to_jsonb(c)::text ilike $3 or coalesce(p.username,'') ilike $3)
        order by c.created_at desc,c.id limit 26 offset $4
      ) x$q$,field,tbl,field) into result using p_kind,p_status,q,p_offset;
  end if;
  return jsonb_build_object('items',case when jsonb_array_length(result)>25 then result-25 else result end,'has_more',jsonb_array_length(result)>25);
end;
$function$;
create or replace function private.moderation_row_available(p_table text,r jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare k text; t record;
begin
  k:=case p_table when 'experiences' then 'experience' when 'clubs' then 'club' when 'posts' then 'post' when 'club_posts' then 'club_post' when 'comments' then 'comment' end;
  if k is not null and not private.moderation_available(k,(r->>'id')::uuid) then return false; end if;
  if r ? 'club_id' and not private.moderation_available('club',(r->>'club_id')::uuid) then return false; end if;
  if r ? 'activity_id' and not private.moderation_available('club_activity',(r->>'activity_id')::uuid) then return false; end if;
  if r ? 'checkpoint_id' and not private.moderation_available('activity_checkpoint',(r->>'checkpoint_id')::uuid) then return false; end if;
  if p_table in ('club_poll_options','club_poll_votes') and not private.moderation_available('club_post',(r->>'post_id')::uuid) then return false; end if;
  if p_table='comments' and not private.moderation_available('comment',(r->>'parent_id')::uuid) then return false; end if;
  if p_table='interaction_targets' and not private.moderation_available(r->>'kind',(r->>'source_id')::uuid) then return false; end if;
  if r->>'interaction_target_id' is not null then
    select kind::text kind,source_id into t from public.interaction_targets where id=(r->>'interaction_target_id')::uuid;
    if found and not private.moderation_available(t.kind,t.source_id) then return false; end if;
  end if;
  if p_table in ('notifications','content_reports') and not private.moderation_available(r->>'target_type',(r->>'target_id')::uuid) then return false; end if;
  return true;
end;
$$;
CREATE OR REPLACE FUNCTION private.admin_moderate_content(p_kind text, p_id uuid, p_action text, p_reason text, p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tbl text; snap jsonb; removed timestamptz; photo_paths jsonb:='[]'::jsonb;
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'admin'::public.user_role then raise exception 'admin_required' using errcode='42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'reason_required'; end if;
  if p_action is null or p_action not in ('remove','restore','delete') then raise exception 'invalid_action'; end if;
  tbl:=case p_kind when 'experience' then 'experiences' when 'club' then 'clubs' when 'post' then 'posts' when 'club_post' then 'club_posts' when 'comment' then 'comments' end;
  if tbl is null then raise exception 'invalid_kind'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin_moderation',0));
  execute format('select to_jsonb(c) from public.%I c where id=$1 for update',tbl) into snap using p_id;
  if p_kind='experience' and snap is not null then snap:=private.experience_evidence(p_id); end if;
  if snap is null then raise exception 'content_not_found' using errcode='P0002'; end if;
  select s.removed_at into removed from private.moderation_state s where s.kind=p_kind and s.target_id=p_id;
  if p_action='restore' and removed is null then raise exception 'content_not_removed'; end if;
  if p_action='remove' and removed is not null then raise exception 'content_already_removed'; end if;
  if p_action='delete' and p_confirmation is distinct from (case when p_kind='club' then snap->>'name' else 'ELIMINAR' end) then raise exception 'confirmation_required'; end if;
  insert into private.moderation_operations values(txid_current());
  insert into private.moderation_history(kind,target_id,action,reason,actor_id,snapshot)
    values(p_kind,p_id,p_action,btrim(p_reason),auth.uid(),snap);
  insert into private.moderation_state(kind,target_id,removed_at,deleted_at)
    values(p_kind,p_id,case when p_action<>'restore' then now() end,case when p_action='delete' then now() end)
    on conflict(kind,target_id) do update set removed_at=excluded.removed_at,deleted_at=excluded.deleted_at;
  if p_action='delete' then
    if p_kind='experience' then select coalesce(jsonb_agg(storage_path),'[]'::jsonb) into photo_paths from public.experience_photos where experience_id=p_id; end if;
    execute format('delete from public.%I where id=$1',tbl) using p_id;
  end if;
  delete from private.moderation_operations where transaction_id=txid_current();
  -- Audio is retained as restricted evidence; never delete its storage object.
  return jsonb_build_object('ok',true,'audio_paths','[]'::jsonb,'photo_paths',photo_paths);
end;
$function$;
CREATE OR REPLACE FUNCTION private.capture_moderation_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k text; why text;
begin
  if not exists(select 1 from private.moderation_operations where transaction_id=txid_current()) then return old; end if;
  if public.current_user_role() is distinct from 'admin'::public.user_role then return old; end if;
  k:=case tg_table_name when 'experiences' then 'experience' when 'clubs' then 'club' when 'posts' then 'post' when 'club_posts' then 'club_post' else 'comment' end;
  if not exists(select 1 from private.moderation_history where kind=k and target_id=old.id and action='delete') then
    select reason into why from private.moderation_history where actor_id=auth.uid() and action='delete' order by created_at desc limit 1;
    insert into private.moderation_history(kind,target_id,action,reason,actor_id,snapshot)
      values(k,old.id,'delete',coalesce(why,'Parent content deleted'),auth.uid(),case when k='experience' then private.experience_evidence(old.id) else to_jsonb(old) end);
  end if;
  return old;
end $function$;
CREATE OR REPLACE FUNCTION public.experience_delete(p_id uuid, p_confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.experiences; photos jsonb; begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select * into e from public.experiences where id=p_id for update;
  if not found or e.creator_id<>auth.uid() or not private.can_view_experience(p_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_confirmation is null or btrim(p_confirmation)<>e.title then raise exception 'invalid confirmation' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'path',storage_path)), '[]'::jsonb) into photos from public.experience_photos where experience_id=p_id;
  -- Owner identity/root revision were validated above; only this narrow trusted
  -- transaction can bypass guards while cascading independently removed children.
  insert into private.moderation_operations values(txid_current()) on conflict do nothing;
  -- Root deletion captures evidence first, then its AFTER trigger removes posts.
  delete from public.notifications where target_type='experience' and target_id=p_id;
  delete from public.interaction_targets where kind='experience' and source_id=p_id;
  delete from public.experiences where id=p_id;
  delete from private.moderation_operations where transaction_id=txid_current();
  return jsonb_build_object('photos',photos);
end $function$;

-- Reports/history capture paths before root cascades. Personal deletion without
-- reports or moderation does not create permanent evidence.
create function private.capture_experience_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (exists(select 1 from public.content_reports r where (r.target_type='experience' and r.target_id=old.id) or (r.target_type='post' and r.target_id in (select id from public.posts where anchor_type='experience' and anchor_id=old.id)))
    or exists(select 1 from private.moderation_state s where (s.kind='experience' and s.target_id=old.id) or (s.kind='post' and s.target_id in (select id from public.posts where anchor_type='experience' and anchor_id=old.id))))
    and not exists(select 1 from private.moderation_history where kind='experience' and target_id=old.id and action='delete') then
    insert into private.moderation_history(kind,target_id,action,reason,actor_id,snapshot)
      values('experience',old.id,'delete','Reported experience deleted',auth.uid(),private.experience_evidence(old.id));
  end if;
  return old;
end $$;
revoke all on function private.capture_experience_deletion() from public,anon,authenticated;
create trigger a_experience_capture_delete before delete on public.experiences for each row execute function private.capture_experience_deletion();
create trigger moderation_capture_delete before delete on public.experiences for each row execute function private.capture_moderation_deletion();
create trigger moderation_write_guard before insert or update or delete on public.experiences for each row execute function private.guard_moderated_write();
create function private.cleanup_experience_social() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into private.moderation_operations values(txid_current()) on conflict do nothing;
  delete from public.posts where anchor_type='experience' and anchor_id=old.id;
  -- admin moderation owns its marker until returning; other source deletion
  -- ends here, while experience_delete has already removed its social children.
  if public.current_user_role() is distinct from 'admin'::public.user_role then delete from private.moderation_operations where transaction_id=txid_current(); end if;
  return old;
end $$;
revoke all on function private.cleanup_experience_social() from public,anon,authenticated;
create trigger experiences_cleanup_posts after delete on public.experiences for each row execute function private.cleanup_experience_social();
create trigger experiences_cleanup_target after delete on public.experiences for each row execute function private.cleanup_social_target('experience');
create function private.experience_notification_visible(r jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare e uuid;
begin
  if r->>'target_type'='experience' then
    e:=(r->>'target_id')::uuid;
    return private.can_view_experience(e) or exists(select 1 from public.experience_participants p join public.experiences x on x.id=p.experience_id
      where p.experience_id=e and p.user_id=auth.uid() and p.invitation_state='invited' and x.audience<>'private'
        and private.moderation_available('experience',x.id) and not public.users_are_blocked(x.creator_id));
  end if;
  if r->>'target_type' in ('post','comment') then return public.can_view_target((r->>'target_type')::public.target_kind,(r->>'target_id')::uuid); end if;
  return true;
end $$;
revoke all on function private.experience_notification_visible(jsonb) from public;
grant execute on function private.experience_notification_visible(jsonb) to authenticated;
create policy notifications_experience_visible on public.notifications as restrictive for select to authenticated using(private.experience_notification_visible(to_jsonb(notifications)));

create function public.admin_moderation_photo(p_photo_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'admin'::public.user_role then raise exception 'admin_required' using errcode='42501'; end if;
  select jsonb_build_object('storage_path',p.storage_path,'mime_type',p.mime_type) into result from public.experience_photos p where p.id=p_photo_id and p.status='ready';
  if result is null then
    select jsonb_build_object('storage_path',p.value->>'storage_path','mime_type',p.value->>'mime_type') into result
    from (select snapshot from private.moderation_history union all select snapshot from public.content_reports) s,
      lateral jsonb_path_query(s.snapshot,'$.**.photos[*]') p(value) where p.value->>'id'=p_photo_id::text and p.value->>'status'='ready' limit 1;
  end if;
  return result;
end $$;
revoke all on function public.admin_moderation_photo(uuid) from public,anon;
grant execute on function public.admin_moderation_photo(uuid) to authenticated;
