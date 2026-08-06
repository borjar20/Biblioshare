-- #129 (Bloque 6 del triage #496): el gate de rol va PRIMERO.
--
-- Estas RPCs son SECURITY DEFINER, así que sus `raise exception` se evaluaban en
-- el orden equivocado: `not found` / `not an event` / `not active` ANTES de
-- `forbidden`. Cualquier `authenticated` (sin ser miembro) podía distinguir por
-- el mensaje si un uuid existe, si es un evento y si está activo — reabriendo por
-- la puerta de atrás lo que la RLS de SELECT (`club_activities select member`)
-- protege. Es fuga de INFO, no de escritura: el gate en sí siempre fue correcto.
--
-- Arreglo: comprobar `has_min_club_role` primero. Con la fila inexistente,
-- v_club_id es null y `has_min_club_role(null, ...)` es false (coalesce), así que
-- el no-autorizado recibe `forbidden` genérico y no aprende nada. Solo tras pasar
-- el gate (= eres moderador del club dueño, que ya puede ver la fila por RLS) se
-- revela kind/estado. Los WHERE de los UPDATE mantienen kind/status como guard.
--
-- Se incluye `set_club_event_state` (nace en 20260823, DESPUÉS de #129, con el
-- mismo patrón heredado): dejarla fuera repetiría el mismo leak. `create_club_event`
-- ya comprueba rol primero desde 20260823 — no se toca.

-- (1) update_club_event -- firma de 10 args (última def: 20260823).
create or replace function public.update_club_event(
  p_activity_id uuid,
  p_title       text,
  p_description text default null,
  p_starts_on   date default null,
  p_starts_time time default null,
  p_ends_time   time default null,
  p_timezone    text default null,
  p_location    text default null,
  p_modality    public.event_modality default null,
  p_online_url  text default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_club_id uuid;
  v_kind public.activity_kind;
  v_status public.activity_status;
  v_old_tz text;
  v_old_time time;
  v_title text := trim(p_title);
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_location text := nullif(trim(coalesce(p_location, '')), '');
  v_online_url text := nullif(trim(coalesce(p_online_url, '')), '');
  v_tz text;
  v_starts_time time;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  select club_id, kind, status, event_timezone,
         (starts_at at time zone event_timezone)::time
    into v_club_id, v_kind, v_status, v_old_tz, v_old_time
    from public.club_activities where id = p_activity_id;

  -- Gate de rol PRIMERO (#129). v_club_id null -> false -> forbidden genérico.
  if not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_club_id is null then
    raise exception 'not_found';
  end if;
  if v_kind <> 'evento' then
    raise exception 'not_an_event';
  end if;
  if v_status <> 'active' then
    raise exception 'event_not_active';
  end if;
  if p_starts_on is null then
    raise exception 'starts_on_required';
  end if;
  if coalesce(v_title, '') = '' then
    raise exception 'title_required';
  end if;
  if char_length(v_title) > 120 then
    raise exception 'title_too_long';
  end if;
  if char_length(coalesce(v_description, '')) > 2000 then
    raise exception 'description_too_long';
  end if;

  v_tz := coalesce(p_timezone, v_old_tz, 'Europe/Madrid');
  v_starts_time := coalesce(p_starts_time, v_old_time, '19:00'::time);

  perform private.validate_event_fields(
    v_tz, v_location, v_online_url, p_modality, v_starts_time, p_ends_time
  );

  v_starts_at := (p_starts_on::text || ' ' || v_starts_time::text)::timestamp
                   at time zone v_tz;
  if p_ends_time is not null then
    v_ends_at := (p_starts_on::text || ' ' || p_ends_time::text)::timestamp
                   at time zone v_tz;
  end if;

  update public.club_activities
     set title = v_title,
         description = v_description,
         starts_at = v_starts_at,
         ends_at = v_ends_at,
         event_timezone = v_tz,
         location = v_location,
         modality = p_modality,
         online_url = v_online_url
   where id = p_activity_id and kind = 'evento' and status = 'active';
end;
$$;

-- (2) set_club_event_state -- última def: 20260823.
create or replace function public.set_club_event_state(
  p_activity_id uuid,
  p_state public.club_event_state
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_club_id uuid;
  v_kind public.activity_kind;
  v_status public.activity_status;
begin
  select club_id, kind, status into v_club_id, v_kind, v_status
    from public.club_activities where id = p_activity_id;

  if not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_club_id is null then
    raise exception 'not_found';
  end if;
  if v_kind <> 'evento' then
    raise exception 'not_an_event';
  end if;
  if v_status <> 'active' then
    raise exception 'event_not_active';
  end if;

  update public.club_activities set event_state = p_state where id = p_activity_id;
end;
$$;

-- (3) finish_club_activity -- última def: 20260810. Rama creador-O-moderador, así
-- que el gate usa `coalesce(v_created_by = auth.uid(), false)`: con la fila
-- inexistente v_created_by es null y `null = auth.uid()` daría NULL (no true, no
-- false), que en un AND dejaría pasar el gate silenciosamente.
create or replace function public.finish_club_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club_id uuid;
  v_status public.activity_status;
  v_kind public.activity_kind;
  v_created_by uuid;
begin
  select club_id, status, kind, created_by into v_club_id, v_status, v_kind, v_created_by
    from public.club_activities where id = p_activity_id;

  if not (coalesce(v_created_by = auth.uid(), false)
          or public.has_min_club_role(v_club_id, 'moderator')) then
    raise exception 'forbidden';
  end if;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if v_kind = 'evento' then
    raise exception 'events cannot be finished';
  end if;
  if v_status <> 'active' then
    raise exception 'activity is not active';
  end if;
  update public.club_activities set status = 'finished' where id = p_activity_id;
end;
$$;

-- (4) archive_club_activity -- última def: 20260713.
create or replace function public.archive_club_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_status public.activity_status;
begin
  select club_id, status into v_club_id, v_status from public.club_activities where id = p_activity_id;
  if not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if v_status not in ('proposed', 'active') then
    raise exception 'activity cannot be archived from its current state';
  end if;
  update public.club_activities set status = 'archived' where id = p_activity_id;
end;
$$;
