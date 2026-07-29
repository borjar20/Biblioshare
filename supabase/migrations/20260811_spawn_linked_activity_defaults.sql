-- #133 (2), tercer call site: `spawn_linked_activity` tenía el mismo síntoma que
-- las RPCs de evento -- `p_from_item_type`/`p_from_item_id` sin DEFAULT, así que
-- el generador de tipos los marcaba no-nulables aunque la función acepte NULL a
-- propósito (la tierlist de cierre no lleva ítem de origen). Eso obligaba a un
-- `as ItemType` / `as string` en `core.ts` mintiendo sobre el tipo.
--
-- El cuerpo se reproduce SIN CAMBIOS (no se puede añadir un default con ALTER
-- FUNCTION; hay que reescribir la función entera). Lo único que cambia respecto
-- a `20260713_club_activities.sql` son los dos `default null` y el `pg_temp` del
-- search_path (#130).
create or replace function public.spawn_linked_activity(
  p_parent_activity_id uuid,
  p_kind public.activity_kind,
  p_title text,
  p_from_item_type public.item_type default null,
  p_from_item_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club_id uuid;
  v_parent_kind public.activity_kind;
  v_parent_status public.activity_status;
  v_created_by uuid;
  v_child_id uuid;
  v_title text := trim(p_title);
  v_config jsonb;
begin
  -- FOR UPDATE serializa los spawns concurrentes sobre el mismo padre: cierra tanto la carrera
  -- de la "oferta única" de tierlist como la de un cambio de estado del padre a mitad de spawn.
  select club_id, kind, status, created_by
    into v_club_id, v_parent_kind, v_parent_status, v_created_by
    from public.club_activities where id = p_parent_activity_id
    for update;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if v_created_by <> auth.uid() and not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_title is null or v_title = '' then
    raise exception 'title_required';
  end if;
  if v_parent_kind <> 'list_challenge' then
    raise exception 'unsupported parent kind';
  end if;

  if p_kind = 'buddy_read' then
    if v_parent_status <> 'active' then
      raise exception 'parent must be active';
    end if;
    if p_from_item_type is null or p_from_item_id is null then
      raise exception 'from item required';
    end if;
    if p_from_item_type not in ('book', 'series') then
      raise exception 'buddy read only for book or series';
    end if;
    if not exists (
      select 1 from public.club_activity_items
      where activity_id = p_parent_activity_id
        and item_type = p_from_item_type and item_id = p_from_item_id
    ) then
      raise exception 'item not in parent pool';
    end if;
  elsif p_kind = 'tierlist' then
    if v_parent_status <> 'finished' then
      raise exception 'parent must be finished';
    end if;
    if exists (
      select 1 from public.club_activities
      where spawned_from_activity_id = p_parent_activity_id and kind = 'tierlist'
    ) then
      raise exception 'tierlist already linked';
    end if;
    -- Niveles por defecto (espejo de DEFAULT_TIERS, ver cabecera).
    v_config := jsonb_build_object('tiers', jsonb_build_array(
      jsonb_build_object('label', 'S', 'color', 'var(--status-dropped)'),
      jsonb_build_object('label', 'A', 'color', 'var(--gold)'),
      jsonb_build_object('label', 'B', 'color', 'var(--status-completed)'),
      jsonb_build_object('label', 'C', 'color', 'var(--type-movie)'),
      jsonb_build_object('label', 'D', 'color', 'var(--muted-foreground)')
    ));
  else
    raise exception 'unsupported child kind';
  end if;

  insert into public.club_activities (
    club_id, kind, title, status, created_by, config,
    spawned_from_activity_id, spawned_from_item_type, spawned_from_item_id
  ) values (
    v_club_id, p_kind, v_title, 'active', auth.uid(), v_config,
    p_parent_activity_id,
    case when p_kind = 'buddy_read' then p_from_item_type else null end,
    case when p_kind = 'buddy_read' then p_from_item_id else null end
  )
  returning id into v_child_id;

  if p_kind = 'buddy_read' then
    insert into public.club_activity_items (activity_id, item_type, item_id, added_by, position)
    values (v_child_id, p_from_item_type, p_from_item_id, auth.uid(), 0);
  else -- tierlist: copia todos los ítems del padre conservando el orden
    insert into public.club_activity_items (activity_id, item_type, item_id, added_by, position)
    select v_child_id, item_type, item_id, auth.uid(), position
      from public.club_activity_items
      where activity_id = p_parent_activity_id;
  end if;

  return v_child_id;
end;
$$;

revoke execute on function public.spawn_linked_activity(uuid, public.activity_kind, text, public.item_type, uuid) from public, anon;
grant execute on function public.spawn_linked_activity(uuid, public.activity_kind, text, public.item_type, uuid) to authenticated;
