CREATE OR REPLACE FUNCTION private.cleanup_social_target()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_target_type text;
begin
  foreach v_target_type in array tg_argv loop
    update public.content_reports cr
      set status = 'actioned',
          target_deleted_at = coalesce(cr.target_deleted_at, now()),
          reviewed_at = coalesce(cr.reviewed_at, now())
      where cr.target_type::text = v_target_type
        and cr.target_id = old.id
        and cr.target_deleted_at is null;
    delete from public.interaction_targets t
      where t.kind::text = v_target_type and t.source_id = old.id;
    delete from public.notifications n
      where (n.target_type = v_target_type or (v_target_type='club_activity' and n.target_type='club_event'))
        and n.target_id = old.id;
  end loop;
  return old;
end;
$function$;

-- #1183: legacy event notification target names and remove obsolete audio cleanup.
create or replace function private.moderation_available(p_kind text,p_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare r record;
begin
  if p_id is null then return true; end if;
  if exists(select 1 from private.moderation_state s where s.kind=p_kind and s.target_id=p_id
    and (s.removed_at is not null or s.deleted_at is not null)) then return false; end if;
  if p_kind='club_post' then
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
$$;
create or replace function private.admin_moderate_content(p_kind text,p_id uuid,p_action text,p_reason text,p_confirmation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tbl text; snap jsonb; removed timestamptz;
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
    execute format('delete from public.%I where id=$1',tbl) using p_id;
  end if;
  delete from private.moderation_operations where transaction_id=txid_current();
  -- Audio is retained as restricted evidence; never delete its storage object.
  return jsonb_build_object('ok',true,'audio_paths','[]'::jsonb);
end;
$$;
