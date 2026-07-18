-- EPIC-05 — Interconexión de actividades de club. Ver
-- docs/superpowers/specs/2026-07-18-club-activity-interconnection-design.md
-- Una actividad puede nacer ENLAZADA a otra: una lectura conjunta desde un ítem de un reto por
-- lista (frame 14), o una tierlist con los ítems del reto al cerrarlo (frame 15). Solo las lanza
-- el creador del reto o moderator+ del club, y nacen ya 'active' (no pasan por moderación), por
-- lo que su creación NO puede ir por INSERT de cliente (la RLS fuerza 'proposed') — va por esta
-- RPC atómica.

alter table public.club_activities
  add column spawned_from_activity_id uuid references public.club_activities(id) on delete set null,
  add column spawned_from_item_type public.item_type,
  add column spawned_from_item_id uuid;

create index idx_club_activities_spawned_from
  on public.club_activities (spawned_from_activity_id);

comment on column public.club_activities.spawned_from_activity_id is
  'Actividad padre de la que nació esta (interconexión). Agrupa la cadena en el detalle del reto.';
comment on column public.club_activities.spawned_from_item_type is
  'Tipo del ítem de origen (solo lecturas conjuntas nacidas de un ítem; null en tierlist de cierre).';
comment on column public.club_activities.spawned_from_item_id is
  'Ítem de origen (solo lecturas conjuntas nacidas de un ítem; null en tierlist de cierre).';

-- spawn_linked_activity: crea una actividad hija ya 'active', copia el pool desde el padre y
-- graba el enlace, todo en una transacción. Autorización: creador del padre O moderator+.
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
  select club_id, kind, status, created_by
    into v_club_id, v_parent_kind, v_parent_status, v_created_by
    from public.club_activities where id = p_parent_activity_id;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if v_created_by <> auth.uid() and not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_title = '' then
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

revoke execute on function public.spawn_linked_activity(uuid, public.activity_kind, text, public.item_type, uuid) from public, anon;
grant execute on function public.spawn_linked_activity(uuid, public.activity_kind, text, public.item_type, uuid) to authenticated;

comment on function public.spawn_linked_activity(uuid, public.activity_kind, text, public.item_type, uuid) is
  'Crea una actividad hija ya active enlazada a un reto por lista: buddy_read desde un ítem (book/series, padre active) o tierlist con todos los ítems (padre finished, oferta única). Solo creador del padre o moderator+.';

alter type public.notification_type add value 'club_activity_spawned';
