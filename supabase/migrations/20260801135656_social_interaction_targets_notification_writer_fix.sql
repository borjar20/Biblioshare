-- Trusted notification writers may address a canonical interaction target
-- directly. Legacy clients remain authoritative whenever they provide the
-- complete target pair, and UPDATE never trusts a canonical-only change.
create or replace function private.resolve_notification_interaction_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target_id uuid;
begin
  if tg_op = 'INSERT'
     and new.target_type is null
     and new.target_id is null then
    return new;
  end if;

  if new.target_type is null or new.target_id is null then
    new.interaction_target_id := null;
  else
    select t.id
    into v_target_id
    from public.interaction_targets t
    where t.kind::text = new.target_type
      and t.source_id = new.target_id;

    new.interaction_target_id := v_target_id;
  end if;

  return new;
end;
$function$;

revoke execute on function private.resolve_notification_interaction_target()
  from public, anon, authenticated, service_role;
