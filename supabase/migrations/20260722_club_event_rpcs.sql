-- RPCs de eventos de club (spec 2026-07-22 §2.2). Separadas del `add value`
-- (20260722_activity_kind_evento.sql) por la restricción transaccional de enums.

-- create_club_event: existe porque la política "club_activities insert member"
-- FUERZA status='proposed' -- y un evento no se propone: lo crea quien tiene
-- autoridad para fijar la fecha, y al crearlo ya está fijada.
create or replace function public.create_club_event(
  p_club_id uuid,
  p_title text,
  p_description text,
  p_starts_on date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_min_club_role(p_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if p_starts_on is null then
    raise exception 'starts_on required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;

  insert into public.club_activities
    (club_id, kind, title, description, status, created_by, starts_on)
  values
    (p_club_id,
     'evento',
     trim(p_title),
     nullif(trim(coalesce(p_description, '')), ''),
     'active',
     auth.uid(),
     p_starts_on)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_club_event(uuid, text, text, date) from public, anon;
grant execute on function public.create_club_event(uuid, text, text, date) to authenticated;

-- update_club_event: el UPDATE que club_activities no tiene -- Bloque G dejó la
-- tabla sin política UPDATE a propósito, con las transiciones encapsuladas en RPCs.
--
-- OJO: el `and kind = 'evento'` del UPDATE es OBLIGATORIO, no defensivo. Sin él,
-- esta función -- SECURITY DEFINER y gateada solo por rol -- deja a un moderador
-- reescribir título, descripción y fechas de cualquier buddy_read o
-- list_challenge por la puerta de atrás. Eso es exactamente la edición arbitraria
-- que SD-8 evitó al no crear la política.
create or replace function public.update_club_event(
  p_activity_id uuid,
  p_title text,
  p_description text,
  p_starts_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_kind public.activity_kind;
begin
  select club_id, kind into v_club_id, v_kind
  from public.club_activities where id = p_activity_id;

  if v_club_id is null then
    raise exception 'not found';
  end if;
  if v_kind <> 'evento' then
    raise exception 'not an event';
  end if;
  if not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if p_starts_on is null then
    raise exception 'starts_on required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;

  update public.club_activities
  set title = trim(p_title),
      description = nullif(trim(coalesce(p_description, '')), ''),
      starts_on = p_starts_on
  where id = p_activity_id and kind = 'evento';
end;
$$;

revoke execute on function public.update_club_event(uuid, text, text, date) from public, anon;
grant execute on function public.update_club_event(uuid, text, text, date) to authenticated;

comment on function public.create_club_event(uuid, text, text, date) is
  'Crea un evento de club (kind=evento, status=active) saltando la RLS de INSERT que fuerza proposed. Moderador+.';
comment on function public.update_club_event(uuid, text, text, date) is
  'Edita título/descripción/fecha de un EVENTO. Moderador+. Restringida a kind=evento a propósito.';
