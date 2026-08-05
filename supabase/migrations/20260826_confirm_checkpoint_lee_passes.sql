-- Issue #470 — confirm_checkpoint validaba contra library_entries, CONGELADA desde el
-- pase-hub (PR #42): addSession solo escribe en passes y no hay trigger que sincronice,
-- así que la RPC comparaba contra una posición muerta y lanzaba checkpoint_not_reached
-- aunque la UI (getActivityCheckpoints, que ya lee passes) diera el hito por alcanzable.
-- Verificado en prod (2026-08-05): en las 3 buddy_read con pases activos, 4/4 posiciones
-- de passes difieren de library_entries. Único cambio: la posición del usuario sale del
-- pase ACTIVO. El resto del cuerpo se preserva verbatim de 20260713_activity_checkpoints.sql.

create or replace function public.confirm_checkpoint(p_checkpoint_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_order smallint;
  v_target_position jsonb;
  v_item_type public.item_type;
  v_item_id uuid;
  v_item_count int;
  v_user_position jsonb;
begin
  select activity_id, "order", position into v_activity_id, v_order, v_target_position
    from public.club_activity_checkpoints
    where id = p_checkpoint_id;

  if v_activity_id is null then
    raise exception 'not found';
  end if;
  if not public.is_activity_participant(v_activity_id) then
    raise exception 'forbidden';
  end if;

  select count(*) into v_item_count
    from public.club_activity_items
    where activity_id = v_activity_id;
  if v_item_count = 0 then
    raise exception 'no item in activity';
  end if;

  -- buddy_read = exactamente un ítem en el pool (enforce_buddy_read_item_rules lo garantiza)
  -- -- limit 1 es solo defensivo, no una elección arbitraria entre varios.
  select item_type, item_id into v_item_type, v_item_id
    from public.club_activity_items
    where activity_id = v_activity_id
    limit 1;

  select p.position into v_user_position
    from public.passes p
    where p.user_id = auth.uid()
      and p.item_type = v_item_type
      and p.item_id = v_item_id
      and p.is_active;

  if v_user_position is null then
    raise exception 'checkpoint_not_reached';
  end if;

  if v_item_type = 'book' then
    if coalesce((v_user_position->>'page')::numeric, 0) < coalesce((v_target_position->>'page')::numeric, 0) then
      raise exception 'checkpoint_not_reached';
    end if;
  elsif v_item_type = 'series' then
    if row(
      coalesce((v_user_position->>'season')::int, 0),
      coalesce((v_user_position->>'episode')::int, 0)
    ) < row(
      coalesce((v_target_position->>'season')::int, 0),
      coalesce((v_target_position->>'episode')::int, 0)
    ) then
      raise exception 'checkpoint_not_reached';
    end if;
  else
    raise exception 'unsupported item type for buddy_read';
  end if;

  insert into public.club_activity_checkpoint_reads (checkpoint_id, user_id)
  select id, auth.uid()
    from public.club_activity_checkpoints
    where activity_id = v_activity_id and "order" <= v_order
  on conflict (checkpoint_id, user_id) do nothing;
end;
$$;

comment on table public.club_activity_checkpoint_reads is 'Quién ha confirmado haber llegado a qué checkpoint (tablero de progreso grupal). Sin política de escritura de cliente -- solo vía confirm_checkpoint() (SECURITY DEFINER), que revalida server-side contra la posición del pase ACTIVO (passes) antes de insertar.';
