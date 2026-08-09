-- Tipos de evento (spec 2026-08-09). Se AMPLÍAN las firmas con DROP + CREATE (no
-- overload): con defaults, la llamada del bundle ANTERIOR (10 args, sin
-- p_event_type/p_config) sigue resolviendo -- «migración primero, merge después».
--
-- Dos cambios de comportamiento:
--   1. p_event_type + p_config: el config es OPACO (se guarda tal cual, como
--      tierlist/reto). event_type NO se cambia al editar (update lo lee de la fila).
--   2. Hora opcional: sin hora, el evento es de «todo el día» y starts_at se ancla
--      a 00:00 en su zona. Encuentro sigue exigiendo hora (starts_time_required).

drop function if exists public.create_club_event(uuid, text, text, date, time, time, text, text, public.event_modality, text);
drop function if exists public.update_club_event(uuid, text, text, date, time, time, text, text, public.event_modality, text);

create or replace function public.create_club_event(
  p_club_id     uuid,
  p_title       text,
  p_description text default null,
  p_starts_on   date default null,
  p_starts_time time default null,
  p_ends_time   time default null,
  p_timezone    text default 'Europe/Madrid',
  p_location    text default null,
  p_modality    public.event_modality default null,
  p_online_url  text default null,
  p_event_type  public.club_event_type default 'encuentro',
  p_config      jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
  v_title text := trim(p_title);
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_location text := nullif(trim(coalesce(p_location, '')), '');
  v_online_url text := nullif(trim(coalesce(p_online_url, '')), '');
  v_starts_time time := coalesce(p_starts_time, '00:00'::time);
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  if not public.has_min_club_role(p_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if coalesce(v_title, '') = '' then raise exception 'title_required'; end if;
  if char_length(v_title) > 120 then raise exception 'title_too_long'; end if;
  if char_length(coalesce(v_description, '')) > 2000 then raise exception 'description_too_long'; end if;
  if p_starts_on is null then raise exception 'starts_on_required'; end if;
  -- Encuentro exige hora; lanzamiento/fecha_destacada pueden ser de todo el día.
  if p_event_type = 'encuentro' and p_starts_time is null then
    raise exception 'starts_time_required';
  end if;

  perform private.validate_event_fields(
    p_timezone, v_location, v_online_url, p_modality, v_starts_time, p_ends_time
  );

  v_starts_at := (p_starts_on::text || ' ' || v_starts_time::text)::timestamp at time zone p_timezone;
  if p_ends_time is not null then
    v_ends_at := (p_starts_on::text || ' ' || p_ends_time::text)::timestamp at time zone p_timezone;
  end if;

  insert into public.club_activities (
    club_id, kind, event_type, title, description, status, created_by,
    starts_at, ends_at, event_timezone, location, modality, online_url, config
  ) values (
    p_club_id, 'evento', p_event_type, v_title, v_description, 'active', auth.uid(),
    v_starts_at, v_ends_at, p_timezone, v_location, p_modality, v_online_url,
    nullif(p_config, '{}'::jsonb)
  ) returning id into v_id;

  insert into public.club_event_followers (activity_id, user_id, remind_minutes_before)
  values (v_id, auth.uid(), 1440)
  on conflict (activity_id, user_id) do nothing;

  return v_id;
end;
$$;

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
  p_online_url  text default null,
  p_config      jsonb default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_club_id uuid;
  v_kind public.activity_kind;
  v_status public.activity_status;
  v_event_type public.club_event_type;
  v_old_tz text;
  v_old_time time;
  v_title text := trim(p_title);
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_location text := nullif(trim(coalesce(p_location, '')), '');
  v_online_url text := nullif(trim(coalesce(p_online_url, '')), '');
  v_tz text;
  v_all_day boolean;
  v_starts_time time;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  select club_id, kind, status, event_type, event_timezone,
         (starts_at at time zone event_timezone)::time
    into v_club_id, v_kind, v_status, v_event_type, v_old_tz, v_old_time
    from public.club_activities where id = p_activity_id;

  -- Gate de rol PRIMERO (#129): con la fila inexistente v_club_id es null ->
  -- has_min_club_role(null,...) es false -> forbidden genérico, sin oráculo.
  if not public.has_min_club_role(v_club_id, 'moderator') then raise exception 'forbidden'; end if;
  if v_club_id is null then raise exception 'not_found'; end if;
  if v_kind <> 'evento' then raise exception 'not_an_event'; end if;
  if v_status <> 'active' then raise exception 'event_not_active'; end if;
  if p_starts_on is null then raise exception 'starts_on_required'; end if;
  if coalesce(v_title, '') = '' then raise exception 'title_required'; end if;
  if char_length(v_title) > 120 then raise exception 'title_too_long'; end if;
  if char_length(coalesce(v_description, '')) > 2000 then raise exception 'description_too_long'; end if;

  v_tz := coalesce(p_timezone, v_old_tz, 'Europe/Madrid');

  -- El tipo NO cambia al editar. Encuentro conserva su hora (coalesce a la vieja
  -- para no borrarla si el cliente no la manda); los demás tipos son de todo el
  -- día cuando config.allDay es true o no llega hora.
  if v_event_type = 'encuentro' then
    v_starts_time := coalesce(p_starts_time, v_old_time, '00:00'::time);
  else
    v_all_day := coalesce((p_config->>'allDay')::boolean, p_starts_time is null);
    v_starts_time := case when v_all_day then '00:00'::time
                          else coalesce(p_starts_time, v_old_time, '00:00'::time) end;
  end if;

  perform private.validate_event_fields(
    v_tz, v_location, v_online_url, p_modality, v_starts_time, p_ends_time
  );

  v_starts_at := (p_starts_on::text || ' ' || v_starts_time::text)::timestamp at time zone v_tz;
  if p_ends_time is not null then
    v_ends_at := (p_starts_on::text || ' ' || p_ends_time::text)::timestamp at time zone v_tz;
  end if;

  update public.club_activities
     set title = v_title,
         description = v_description,
         starts_at = v_starts_at,
         ends_at = v_ends_at,
         event_timezone = v_tz,
         location = v_location,
         modality = p_modality,
         online_url = v_online_url,
         -- p_config null (bundle viejo) => no tocar; forma nueva => set (nullif '{}').
         config = case when p_config is null then config else nullif(p_config, '{}'::jsonb) end
   where id = p_activity_id and kind = 'evento' and status = 'active';
end;
$$;
