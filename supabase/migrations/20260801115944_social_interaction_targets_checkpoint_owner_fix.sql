-- A checkpoint is independently authored. Its canonical owner therefore comes
-- from the checkpoint row, not from the activity that contains it.
create or replace function private.sync_checkpoint_interaction_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_slug text;
begin
  select c.slug into v_slug
  from public.club_activities a
  join public.clubs c on c.id = a.club_id
  where a.id = new.activity_id;

  perform private.upsert_interaction_target(
    'activity_checkpoint',
    new.id,
    new.created_by,
    'checkpoint_reached',
    new.id,
    '/club/' || v_slug || '/actividad/' || new.activity_id::text,
    true,
    false,
    'checkpoint_commented',
    null
  );
  return new;
end;
$function$;

revoke execute on function private.sync_checkpoint_interaction_target()
  from public, anon, authenticated;

-- Repair canonical rows emitted/backfilled by the previous definition.
update public.interaction_targets as target
set owner_id = checkpoint.created_by
from public.club_activity_checkpoints as checkpoint
where target.kind = 'activity_checkpoint'
  and target.source_id = checkpoint.id
  and target.owner_id is distinct from checkpoint.created_by;

create index if not exists interaction_targets_owner_id_idx
  on public.interaction_targets (owner_id);
