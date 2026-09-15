-- #1183: moderation state and evidence are private, independent from source FKs.
create table private.moderation_state (
  kind text not null check (kind in ('club','post','club_post','comment')),
  target_id uuid not null,
  removed_at timestamptz,
  deleted_at timestamptz,
  primary key (kind,target_id)
);
create table private.moderation_history (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  target_id uuid not null,
  action text not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  actor_id uuid,
  created_at timestamptz not null default now(),
  snapshot jsonb not null
);
create index moderation_history_created on private.moderation_history(created_at desc,id);
alter table private.moderation_state enable row level security;
alter table private.moderation_history enable row level security;
revoke all on private.moderation_state, private.moderation_history from public,anon,authenticated;
create policy moderation_state_no_direct_access on private.moderation_state using (false);
create policy moderation_history_no_direct_access on private.moderation_history using (false);

-- Availability is independent of identity: even admins use a separate RPC.
-- Missing ordinary targets remain available for BEFORE INSERT checks; references
-- are still validated by existing FKs, source triggers and audience checks.
create function private.moderation_available(p_kind text,p_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare r record;
begin
  if p_id is null then return true; end if;
  if exists(select 1 from private.moderation_state s where s.kind=p_kind and s.target_id=p_id
    and (s.removed_at is not null or s.deleted_at is not null)) then return false; end if;
  if p_kind='club_post' then
    return coalesce((select private.moderation_available('club',c.club_id) from public.club_posts c where c.id=p_id),true);
  elsif p_kind='club_activity' then
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
$$;
revoke all on function private.moderation_available(text,uuid) from public;
grant execute on function private.moderation_available(text,uuid) to anon,authenticated;

-- Apply availability to every row's direct and polymorphic parents, including
-- own-only policies and privileged write RPCs which otherwise bypass RLS.
create function private.moderation_row_available(p_table text,r jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare k text; t record;
begin
  k:=case p_table when 'clubs' then 'club' when 'posts' then 'post' when 'club_posts' then 'club_post' when 'comments' then 'comment' end;
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
revoke all on function private.moderation_row_available(text,jsonb) from public;
grant execute on function private.moderation_row_available(text,jsonb) to anon,authenticated;

create function private.guard_moderated_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- No client controls this private transaction marker. The mutation RPC inserts
  -- it only after validating admin identity and removes it before returning.
  if exists(select 1 from private.moderation_operations where transaction_id=txid_current()) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  -- Personal source updates must not recreate moderated feed posts, or fail
  -- because a generated post was removed. Preserve the underlying pass/session.
  if tg_table_name='posts' then
    if tg_op='INSERT' and new.source_id is not null and exists(
      select 1 from private.moderation_history h where h.kind='post' and h.action='delete'
      and h.snapshot->>'source_id'=new.source_id::text and h.snapshot->>'source_kind'=new.source_kind::text
      and h.snapshot->>'kind'=new.kind::text and h.snapshot->>'author_id'=new.author_id::text
    ) then return null; end if;
    if tg_op in ('UPDATE','DELETE') and pg_trigger_depth()>1 and not private.moderation_available('post',old.id) then return null; end if;
  end if;
  if (tg_op<>'INSERT' and not private.moderation_row_available(tg_table_name,to_jsonb(old)))
     or (tg_op<>'DELETE' and not private.moderation_row_available(tg_table_name,to_jsonb(new))) then
    raise exception 'content_unavailable' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.guard_moderated_write() from public,anon,authenticated;
create table private.moderation_operations(transaction_id bigint primary key);
alter table private.moderation_operations enable row level security;
revoke all on private.moderation_operations from public,anon,authenticated;
create policy moderation_operations_no_direct_access on private.moderation_operations using(false);

do $$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and
    (c.relname like 'club_%' or c.relname in ('clubs','posts','comments','interaction_targets','reactions','notifications'))
  loop
    execute format('create policy moderation_available on public.%I as restrictive for all to anon,authenticated using(private.moderation_row_available(%L,to_jsonb(%I))) with check(private.moderation_row_available(%L,to_jsonb(%I)))',t,t,t,t,t);
    execute format('create trigger moderation_write_guard before insert or update or delete on public.%I for each row execute function private.guard_moderated_write()',t);
  end loop;
end $$;

-- Report evidence is only accessible in administration after removal/deletion.
create policy moderation_evidence_visible on public.content_reports as restrictive
for select to authenticated using(target_deleted_at is null and private.moderation_row_available('content_reports',to_jsonb(content_reports)));

create or replace view public.club_identities as select id,slug,name,description,cover_url,visibility
from public.clubs c where private.moderation_available('club',c.id);
create or replace view public.club_stats as select c.id club_id,
 (select count(*) from public.club_members m where m.club_id=c.id and m.status='active')::integer member_count
from public.clubs c where private.moderation_available('club',c.id);

create function private.admin_moderation_list(p_kind text,p_status text,p_query text,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
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
    tbl:=case p_kind when 'club' then 'clubs' when 'post' then 'posts' when 'club_post' then 'club_posts' when 'comment' then 'comments' end;
    if tbl is null or p_status not in ('all','active','removed') then raise exception 'invalid_filter'; end if;
    field:=case when p_kind='club' then 'owner_id' else 'author_id' end;
    execute format($q$
      select coalesce(jsonb_agg(x.row),'[]') from (
        select jsonb_build_object('id',c.id,'kind',$1,'title',coalesce(to_jsonb(c)->>'name',to_jsonb(c)->>'body',''),
          'body',coalesce(to_jsonb(c)->>'body',to_jsonb(c)->>'description',''),'author_id',c.%I,
          'author_name',coalesce(p.display_name,p.username),'created_at',c.created_at,
          'removed_at',s.removed_at,'parent_removed',s.removed_at is null and not private.moderation_available($1,c.id),
          'snapshot',to_jsonb(c)) row
        from public.%I c left join private.moderation_state s on s.kind=$1 and s.target_id=c.id
          left join public.profiles p on p.user_id=c.%I
        where ($2='all' or ($2='removed' and not private.moderation_available($1,c.id)) or ($2='active' and private.moderation_available($1,c.id)))
          and (to_jsonb(c)::text ilike $3 or coalesce(p.username,'') ilike $3)
        order by c.created_at desc,c.id limit 26 offset $4
      ) x$q$,field,tbl,field) into result using p_kind,p_status,q,p_offset;
  end if;
  return jsonb_build_object('items',case when jsonb_array_length(result)>25 then result-25 else result end,'has_more',jsonb_array_length(result)>25);
end;
$$;

create function private.admin_moderate_content(p_kind text,p_id uuid,p_action text,p_reason text,p_confirmation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tbl text; snap jsonb; removed timestamptz; audio jsonb;
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'admin'::public.user_role then raise exception 'admin_required' using errcode='42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'reason_required'; end if;
  if p_action is null or p_action not in ('remove','restore','delete') then raise exception 'invalid_action'; end if;
  tbl:=case p_kind when 'club' then 'clubs' when 'post' then 'posts' when 'club_post' then 'club_posts' when 'comment' then 'comments' end;
  if tbl is null then raise exception 'invalid_kind'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin_moderation',0));
  execute format('select to_jsonb(c) from public.%I c where id=$1 for update',tbl) into snap using p_id;
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
    -- Audio storage cleanup is performed by the server after the transaction.
    select coalesce(jsonb_agg(c.audio_path) filter(where c.audio_path is not null),'[]') into audio
    from public.comments c where (p_kind='comment' and (c.id=p_id or c.parent_id=p_id)) or
      exists(select 1 from public.interaction_targets t where t.id=c.interaction_target_id and
        ((t.kind::text=p_kind and t.source_id=p_id) or (p_kind='club' and private.social_target_club_id(t.kind,t.source_id)=p_id)));
    execute format('delete from public.%I where id=$1',tbl) using p_id;
  end if;
  delete from private.moderation_operations where transaction_id=txid_current();
  -- Audio is retained as restricted evidence; never delete its storage object.
  return jsonb_build_object('ok',true,'audio_paths','[]'::jsonb);
end;
$$;

create function private.capture_moderation_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
declare k text; why text;
begin
  if not exists(select 1 from private.moderation_operations where transaction_id=txid_current()) then return old; end if;
  k:=case tg_table_name when 'clubs' then 'club' when 'posts' then 'post' when 'club_posts' then 'club_post' else 'comment' end;
  if not exists(select 1 from private.moderation_history where kind=k and target_id=old.id and action='delete') then
    select reason into why from private.moderation_history where actor_id=auth.uid() and action='delete' order by created_at desc limit 1;
    insert into private.moderation_history(kind,target_id,action,reason,actor_id,snapshot)
      values(k,old.id,'delete',coalesce(why,'Parent content deleted'),auth.uid(),to_jsonb(old));
  end if;
  return old;
end $$;
revoke all on function private.capture_moderation_deletion() from public,anon,authenticated;
create trigger moderation_capture_delete before delete on public.clubs for each row execute function private.capture_moderation_deletion();
create trigger moderation_capture_delete before delete on public.posts for each row execute function private.capture_moderation_deletion();
create trigger moderation_capture_delete before delete on public.club_posts for each row execute function private.capture_moderation_deletion();
create trigger moderation_capture_delete before delete on public.comments for each row execute function private.capture_moderation_deletion();

create function private.admin_moderation_audio(p_comment_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare path text;
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'admin'::public.user_role then raise exception 'admin_required' using errcode='42501'; end if;
  select audio_path into path from public.comments where id=p_comment_id;
  if path is null then select snapshot->>'audio_path' into path from private.moderation_history where kind='comment' and target_id=p_comment_id and snapshot->>'audio_path' is not null order by created_at desc limit 1; end if;
  if path is null then select snapshot->>'audio_path' into path from public.content_reports where target_type='comment' and target_id=p_comment_id and snapshot->>'audio_path' is not null order by created_at desc limit 1; end if;
  return jsonb_build_object('audio_path',path);
end $$;
create function public.admin_moderation_audio(p_comment_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.admin_moderation_audio(p_comment_id); $$;
revoke all on function public.admin_moderation_audio(uuid),private.admin_moderation_audio(uuid) from public,anon;
grant execute on function public.admin_moderation_audio(uuid),private.admin_moderation_audio(uuid) to authenticated;

create function private.admin_review_report(p_id uuid,p_status text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare snap jsonb;
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'admin'::public.user_role then raise exception 'admin_required' using errcode='42501'; end if;
  if p_status is null or p_status not in ('actioned','dismissed') then raise exception 'invalid_report_status'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'reason_required'; end if;
  update public.content_reports set status=p_status,resolution_note=btrim(p_reason) where id=p_id and status='pending' returning to_jsonb(content_reports) into snap;
  if snap is null then raise exception 'report_not_pending'; end if;
  insert into private.moderation_history(kind,target_id,action,reason,actor_id,snapshot)
    values('report',p_id,p_status,btrim(p_reason),auth.uid(),snap);
  return jsonb_build_object('ok',true);
end;
$$;

create function public.moderation_audio_is_evidence(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.moderation_history where snapshot->>'audio_path'=p_path)
    or exists(select 1 from public.content_reports where snapshot->>'audio_path'=p_path);
$$;
revoke all on function public.moderation_audio_is_evidence(text) from public,anon,authenticated;
grant execute on function public.moderation_audio_is_evidence(text) to service_role;

create function public.admin_moderation_list(p_kind text,p_status text,p_query text,p_offset integer)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.admin_moderation_list(p_kind,p_status,p_query,p_offset); $$;
create function public.admin_moderate_content(p_kind text,p_id uuid,p_action text,p_reason text,p_confirmation text)
returns jsonb language sql security invoker set search_path='' as $$ select private.admin_moderate_content(p_kind,p_id,p_action,p_reason,p_confirmation); $$;
create function public.admin_review_report(p_id uuid,p_status text,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$ select private.admin_review_report(p_id,p_status,p_reason); $$;
revoke all on function private.admin_moderation_list(text,text,text,integer),public.admin_moderation_list(text,text,text,integer),
  private.admin_moderate_content(text,uuid,text,text,text),public.admin_moderate_content(text,uuid,text,text,text),
  private.admin_review_report(uuid,text,text),public.admin_review_report(uuid,text,text) from public,anon;
grant execute on function private.admin_moderation_list(text,text,text,integer),public.admin_moderation_list(text,text,text,integer),
  private.admin_moderate_content(text,uuid,text,text,text),public.admin_moderate_content(text,uuid,text,text,text),
  private.admin_review_report(uuid,text,text),public.admin_review_report(uuid,text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.notify_club_join_request(p_club_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Solo puedes disparar el aviso de TU propia solicitud, y solo si existe.
  if not private.moderation_available('club',p_club_id) or not exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id
      and m.user_id = (select auth.uid())
      and m.status = 'requested'
  ) then
    raise exception 'no_pending_request';
  end if;

  insert into public.notifications (user_id, actor_id, type)
  select m.user_id, (select auth.uid()), 'club_join_request'
  from public.club_members m
  where m.club_id = p_club_id
    and m.status = 'active'
    and m.role in ('moderator', 'owner');
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_due_event_reminders(p_limit integer DEFAULT 200, p_activity_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(activity_id uuid, user_id uuid, club_id uuid, club_slug text, club_name text, title text, starts_at timestamp with time zone, event_timezone text, location text, modality event_modality, organizer_id uuid, minutes_before integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with due as (
    select f.activity_id, f.user_id
      from public.club_event_followers f
      join public.club_activities a on a.id = f.activity_id
      join public.club_members m
        on m.club_id = a.club_id and m.user_id = f.user_id and m.status = 'active'
     where private.moderation_available('club',a.club_id) and f.reminded_at is null
       and f.reminder_due_at is not null
       and f.reminder_due_at <= now()
       and a.kind = 'evento'
       and a.status = 'active'
       and a.event_state = 'programado'
       and a.starts_at > now()
       and (p_activity_id is null or f.activity_id = p_activity_id)
     order by f.reminder_due_at
     limit greatest(p_limit, 1)
     for update of f skip locked
  ),
  claimed as (
    update public.club_event_followers f
       set reminded_at = now()
      from due
     where f.activity_id = due.activity_id and f.user_id = due.user_id
    returning f.activity_id, f.user_id, f.remind_minutes_before
  )
  select c.activity_id, c.user_id, a.club_id, cl.slug, cl.name, a.title,
         a.starts_at, a.event_timezone, a.location, a.modality, a.created_by,
         c.remind_minutes_before
    from claimed c
    join public.club_activities a on a.id = c.activity_id
    join public.clubs cl on cl.id = a.club_id;
$function$;


-- Harden existing SECURITY DEFINER audience gates at the source.
CREATE OR REPLACE FUNCTION public.is_club_member(p_club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.moderation_available('club',p_club_id) and exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = auth.uid() and status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.club_member_row_exists(p_club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.moderation_available('club',p_club_id) and exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.club_is_private(p_club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.moderation_available('club',p_club_id) and exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.visibility = 'private'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_activity_participant(p_activity_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.moderation_available('club_activity',p_activity_id) and exists (
    select 1 from public.club_activity_participants
    where activity_id = p_activity_id and user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_voted_in_club_poll(p_post_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.moderation_available('club_post',p_post_id) and exists (
    select 1 from public.club_poll_votes
    where post_id = p_post_id and user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_reached_checkpoint(p_checkpoint_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.moderation_available('activity_checkpoint',p_checkpoint_id) and exists (
    select 1 from public.club_activity_checkpoint_reads
    where checkpoint_id = p_checkpoint_id and user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.club_role(p_club_id uuid)
 RETURNS club_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select role from public.club_members
  where private.moderation_available('club',p_club_id) and club_id = p_club_id and user_id = auth.uid() and status = 'active';
$function$;

CREATE OR REPLACE FUNCTION public.can_view_target(p_target_type target_kind, p_target_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.moderation_available(p_target_type::text,p_target_id) and case p_target_type
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
      and case t.audience_kind
        when 'profile' then public.can_view_profile(t.audience_id)
        when 'club_member' then public.is_club_member(t.audience_id)
        when 'activity_participant' then public.is_activity_participant(t.audience_id)
        when 'checkpoint_reached' then public.can_view_target('activity_checkpoint'::public.target_kind, t.audience_id)
      end
  );
$function$;

CREATE OR REPLACE FUNCTION private.can_moderate_target(p_target_type target_kind, p_target_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.moderation_available(p_target_type::text,p_target_id) and case
    when (select auth.uid()) is null then false
    when public.has_min_role('admin') then true
    when private.social_target_owner_id(p_target_type, p_target_id) = (select auth.uid()) then true
    else coalesce(
      public.has_min_club_role(
        private.social_target_club_id(p_target_type, p_target_id),
        'moderator'
      ),
      false
    )
  end;
$function$;

CREATE OR REPLACE FUNCTION private.can_moderate_comment(p_comment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.comments c
    where c.id = p_comment_id and private.moderation_available('comment',c.id)
      and (
        c.author_id = (select auth.uid())
        or exists (
          select 1
          from public.interaction_targets t
          where t.id = c.interaction_target_id
            and private.can_moderate_target(t.kind, t.source_id)
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.club_burrow_pets(p_club_id uuid)
 RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text, pet_name text, pet_class text, pet_stage text, pet_level integer, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  viewer uuid := (select auth.uid());
begin
  if not private.moderation_available('club',p_club_id) or viewer is null or not exists (
    select 1 from public.club_members cm
    where cm.club_id = p_club_id and cm.user_id = viewer and cm.status = 'active'
  ) then
    raise exception 'club_burrow_unavailable' using errcode = '42501';
  end if;
  return query
  with visible as materialized (
    select ps.user_id, pr.username, pr.display_name, pr.avatar_url,
           ps.name as pet_name, ps.class as pet_class, ps.last_stage as pet_stage,
           ps.last_level as pet_level
    from public.club_members cm
    join public.pet_state ps on ps.user_id = cm.user_id
    join public.profiles pr on pr.user_id = cm.user_id
    where cm.club_id = p_club_id and cm.status = 'active'
      and public.can_view_profile(cm.user_id)
      and not public.users_are_blocked(cm.user_id)
  )
  select v.*, count(*) filter (where v.user_id <> viewer) over () as total
  from visible v
  order by (v.user_id = viewer) desc,
    pg_catalog.md5(viewer::text || p_club_id::text || (pg_catalog.now() at time zone 'utc')::date::text || v.user_id::text),
    v.user_id
  limit 60 + (case when exists (select 1 from visible o where o.user_id = viewer) then 1 else 0 end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_visible_via_club_share(p_source_table text, p_row_id uuid, p_owner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.club_posts cp
    where private.moderation_available('club_post',cp.id) and cp.kind = 'activity_share'
      and (
        cp.ref->>'sourceTable' = p_source_table
        or (p_source_table = 'diary_entries' and cp.ref->>'sourceTable' = 'diary_entries_added')
      )
      and cp.ref->>'rowId' = p_row_id::text
      and cp.author_id = p_owner_id
      and public.is_club_member(cp.club_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.reassign_club_ownership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_next_user uuid;
begin
  if old.role <> 'owner' or not exists(select 1 from public.clubs where id=old.club_id) then
    return null;
  end if;

  select user_id into v_next_user
    from public.club_members
    where club_id = old.club_id and user_id <> old.user_id and status = 'active'
    order by (role = 'moderator') desc, joined_at asc
    limit 1;

  if v_next_user is null then
    delete from public.clubs where id = old.club_id;
  else
    update public.club_members set role = 'owner'
      where club_id = old.club_id and user_id = v_next_user;
    update public.clubs set owner_id = v_next_user where id = old.club_id;
  end if;

  return null;
end;
$function$;
