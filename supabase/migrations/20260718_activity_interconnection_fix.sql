-- EPIC-05 — Interconexión de actividades: fix de la revisión de Task 1.
-- (1) Endurece la invariante "oferta única" de la tierlist de cierre: un índice único parcial
--     como backstop duro, más FOR UPDATE sobre la fila del padre que serializa los spawns
--     concurrentes del mismo padre (cierra también la carrera de cambio de estado del padre a
--     mitad de spawn).
-- (2) El guard de título vacío ahora también cubre NULL (trim(NULL) = '' es NULL, no disparaba).

create unique index if not exists club_activities_one_tierlist_per_parent
  on public.club_activities (spawned_from_activity_id)
  where kind = 'tierlist' and spawned_from_activity_id is not null;

create or replace function public.spawn_linked_activity(
  p_parent_activity_id uuid,
  p_kind public.activity_kind,
  p_title text,
  p_from_item_type public.item_type,
  p_from_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_parent_kind public.activity_kind;
  v_parent_status public.activity_status;
  v_created_by uuid;
  v_child_id uuid;
  v_title text := trim(p_title);
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
  else
    raise exception 'unsupported child kind';
  end if;

  insert into public.club_activities (
    club_id, kind, title, status, created_by,
    spawned_from_activity_id, spawned_from_item_type, spawned_from_item_id
  ) values (
    v_club_id, p_kind, v_title, 'active', auth.uid(),
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
