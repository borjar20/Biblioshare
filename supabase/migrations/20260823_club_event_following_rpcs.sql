-- RPCs del seguimiento de eventos (spec 2026-08-04).
--
-- Todo SECURITY DEFINER: club_activities no tiene política UPDATE (SD-8) y
-- club_event_followers no tiene ninguna política de escritura, a propósito. La
-- autoridad de permisos está aquí, en servidor, no en que la UI esconda un botón.

-- ---------------------------------------------------------------------------
-- 1. create/update de evento, con los campos nuevos
-- ---------------------------------------------------------------------------

-- Se AMPLÍAN las firmas con DROP + CREATE, no con overload: una sobrecarga de 10
-- argumentos con defaults conviviría con la de 4, y una llamada de 4 argumentos
-- quedaría AMBIGUA (42725). Con DROP + CREATE, la llamada de 4 argumentos del
-- bundle ANTERIOR sigue resolviendo contra la función nueva usando sus defaults
-- — que es lo que hace segura la regla «migración primero, merge después» (#393).
--
-- La hora viaja como `time` aparte de `p_starts_on date`, no como un timestamptz
-- ya resuelto por el cliente: así el instante lo construye SQL con la zona del
-- evento y el horario de verano lo resuelve la base de datos de zonas, no
-- aritmética nuestra. Sin hora se asume 19:00, la misma que el backfill.

drop function if exists public.create_club_event(uuid, text, text, date);
drop function if exists public.update_club_event(uuid, text, text, date);

create or replace function private.validate_event_fields(
  p_timezone   text,
  p_location   text,
  p_online_url text,
  p_modality   public.event_modality,
  p_starts_time time,
  p_ends_time   time
) returns void
language plpgsql
set search_path to ''
as $$
begin
  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then
    raise exception 'invalid_timezone';
  end if;
  if char_length(coalesce(p_location, '')) > 200 then
    raise exception 'location_too_long';
  end if;
  if char_length(coalesce(p_online_url, '')) > 500 then
    raise exception 'online_url_too_long';
  end if;
  -- Un evento online sin enlace es admisible (puede llegar después), pero un
  -- enlace que no es http(s) es un error del formulario, no un dato.
  if p_online_url is not null and p_online_url !~* '^https?://' then
    raise exception 'invalid_online_url';
  end if;
  if p_modality = 'online' and p_location is not null then
    raise exception 'online_event_has_location';
  end if;
  if p_ends_time is not null and p_starts_time is not null and p_ends_time <= p_starts_time then
    raise exception 'ends_before_starts';
  end if;
end;
$$;

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
  p_online_url  text default null
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
  v_starts_time time := coalesce(p_starts_time, '19:00'::time);
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  if not public.has_min_club_role(p_club_id, 'moderator') then
    raise exception 'forbidden';
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
  if p_starts_on is null then
    raise exception 'starts_on_required';
  end if;

  perform private.validate_event_fields(
    p_timezone, v_location, v_online_url, p_modality, v_starts_time, p_ends_time
  );

  v_starts_at := (p_starts_on::text || ' ' || v_starts_time::text)::timestamp
                   at time zone p_timezone;
  if p_ends_time is not null then
    v_ends_at := (p_starts_on::text || ' ' || p_ends_time::text)::timestamp
                   at time zone p_timezone;
  end if;

  -- Un evento nace ACTIVO: no se propone ni se activa (la política de INSERT
  -- fuerza status='proposed', y por eso esto va por RPC).
  insert into public.club_activities (
    club_id, kind, title, description, status, created_by,
    starts_at, ends_at, event_timezone, location, modality, online_url
  ) values (
    p_club_id, 'evento', v_title, v_description, 'active', auth.uid(),
    v_starts_at, v_ends_at, p_timezone, v_location, p_modality, v_online_url
  ) returning id into v_id;

  -- El organizador queda como seguidor desde la creación (§18): figura entre
  -- quienes lo siguen y recibe su recordatorio, y puede apagarlo sin dejar de
  -- ser el organizador. Seguir y organizar siguen siendo cosas distintas: esto
  -- solo declara que quien lo monta también está interesado.
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

  if v_club_id is null then
    raise exception 'not_found';
  end if;
  if v_kind <> 'evento' then
    raise exception 'not_an_event';
  end if;
  if v_status <> 'active' then
    raise exception 'event_not_active';
  end if;
  if not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
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

  -- Sin zona ni hora explícitas se conservan las que tenía: así el bundle
  -- anterior, que solo manda título/descripción/fecha, no borra la hora.
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

-- ---------------------------------------------------------------------------
-- 2. Seguir / dejar de seguir / recordatorio / estado
-- ---------------------------------------------------------------------------

-- Los seis valores que ofrece la UI (§9.2), validados en SQL para que un cliente
-- no pueda colar un offset arbitrario.
create or replace function private.valid_event_reminder(p_minutes integer)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_minutes is null or p_minutes in (0, 15, 60, 1440, 10080);
$$;

create or replace function private.assert_can_follow_event(p_activity_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v record;
begin
  select club_id, kind, status, event_state, starts_at, ends_at
    into v
    from public.club_activities where id = p_activity_id;

  if v.club_id is null then
    raise exception 'not_found';
  end if;
  if v.kind <> 'evento' then
    raise exception 'not_an_event';
  end if;
  -- Archivado o propuesto: no es un evento vigente del club.
  if v.status <> 'active' then
    raise exception 'event_not_active';
  end if;
  -- Cubre de una vez a quien no es miembro, a quien lo dejó, al expulsado y al
  -- invitado que no ha aceptado: is_club_member exige status='active'.
  if not public.is_club_member(v.club_id) then
    raise exception 'not_a_member';
  end if;
  if v.event_state = 'cancelado' then
    raise exception 'event_cancelled';
  end if;
  if coalesce(v.ends_at, v.starts_at) is not null
     and coalesce(v.ends_at, v.starts_at) <= now() then
    raise exception 'event_finished';
  end if;

  return v.club_id;
end;
$$;

-- IDEMPOTENTE por construcción: el `on conflict do update` hace que dos
-- peticiones simultáneas dejen UNA fila en vez de un 23505 en la cara del
-- usuario. Es la garantía de «pulsar varias veces rápido» y de «dos solicitudes
-- concurrentes» (§20) en la BD, no en la UI.
create or replace function public.follow_club_event(
  p_activity_id uuid,
  p_remind_minutes_before integer default 1440
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not private.valid_event_reminder(p_remind_minutes_before) then
    raise exception 'invalid_reminder';
  end if;
  perform private.assert_can_follow_event(p_activity_id);

  insert into public.club_event_followers (activity_id, user_id, remind_minutes_before)
  values (p_activity_id, auth.uid(), p_remind_minutes_before)
  on conflict (activity_id, user_id)
    do update set remind_minutes_before = excluded.remind_minutes_before;
end;
$$;

-- Borrar lo que no está no es un error: idempotente sin mirar antes. Y se
-- permite SIEMPRE, incluso en un evento cancelado o ya pasado — dejar de seguir
-- nunca puede quedar bloqueado.
create or replace function public.unfollow_club_event(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  delete from public.club_event_followers
   where activity_id = p_activity_id and user_id = auth.uid();
end;
$$;

create or replace function public.set_club_event_reminder(
  p_activity_id uuid,
  p_remind_minutes_before integer
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not private.valid_event_reminder(p_remind_minutes_before) then
    raise exception 'invalid_reminder';
  end if;
  perform private.assert_can_follow_event(p_activity_id);

  update public.club_event_followers
     set remind_minutes_before = p_remind_minutes_before
   where activity_id = p_activity_id and user_id = auth.uid();

  -- Cambiar el recordatorio de algo que no sigues es un error del cliente, no un
  -- alta implícita: distinguirlo evita que un fallo de estado en la UI cree
  -- seguimientos que nadie pidió.
  if not found then
    raise exception 'not_following';
  end if;
end;
$$;

-- Cancelar / posponer / reprogramar. Los recordatorios los apaga y los vuelve a
-- armar el trigger; aquí solo se declara el estado.
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

  if v_club_id is null then
    raise exception 'not_found';
  end if;
  if v_kind <> 'evento' then
    raise exception 'not_an_event';
  end if;
  if v_status <> 'active' then
    raise exception 'event_not_active';
  end if;
  if not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;

  update public.club_activities set event_state = p_state where id = p_activity_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. El barrido: reclamo atómico y compensación
-- ---------------------------------------------------------------------------

-- Reclamar y devolver en la MISMA sentencia es lo que hace que dos barridos
-- solapados no entreguen el mismo aviso dos veces: el segundo ya no encuentra
-- `reminded_at is null`, y `skip locked` evita además que se queden esperándose.
--
-- El precio es que una caída entre reclamar y entregar PIERDE el aviso, así que
-- la ruta compensa: si la entrega falla, llama a release_event_reminders y la
-- fila vuelve a estar disponible para el barrido siguiente. Es la compensación
-- explícita que pide §21, no un «ya se verá».
--
-- El join con club_members es la pieza que resuelve de una vez «abandona el
-- club», «es expulsado» y «pierde permisos» (§20): un seguimiento sin membresía
-- activa es INERTE. No se borra la fila — si vuelve al club, su interés sigue
-- ahí — se invalida.
-- `p_activity_id` opcional para poder reclamar SOLO los de un evento. Lo necesita
-- la entrega inmediata: al seguir un evento que empieza dentro del propio offset
-- elegido, §9.1 pide avisar ya en vez de esperar al barrido. Sin este parámetro
-- una acción de usuario tendría que llamar al reclamo GLOBAL, y acabaría
-- entregando los avisos de todos los clubes — trabajo no acotado dentro de un clic.
create or replace function public.claim_due_event_reminders(
  p_limit integer default 200,
  p_activity_id uuid default null
)
returns table (
  activity_id     uuid,
  user_id         uuid,
  club_id         uuid,
  club_slug       text,
  club_name       text,
  title           text,
  starts_at       timestamptz,
  event_timezone  text,
  location        text,
  modality        public.event_modality,
  organizer_id    uuid,
  minutes_before  integer
)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  with due as (
    select f.activity_id, f.user_id
      from public.club_event_followers f
      join public.club_activities a on a.id = f.activity_id
      join public.club_members m
        on m.club_id = a.club_id and m.user_id = f.user_id and m.status = 'active'
     where f.reminded_at is null
       and f.reminder_due_at is not null
       and f.reminder_due_at <= now()
       and a.kind = 'evento'
       and a.status = 'active'
       and a.event_state = 'programado'
       -- Nunca se recuerda algo ya terminado (§9.1). El trigger ya no arma
       -- recordatorios de eventos pasados, pero un evento puede TERMINAR sin que
       -- nadie escriba nada: esta condición es la autoridad.
       and coalesce(a.ends_at, a.starts_at) > now()
       and (p_activity_id is null or f.activity_id = p_activity_id)
     order by f.reminder_due_at
     limit greatest(p_limit, 1)
     for update of f skip locked
  ),
  claimed as (
    update public.club_event_followers f
       set reminded_at = now()
      from due
     where f.activity_id = due.activity_id and f.user_id = due.user_id
    returning f.activity_id, f.user_id, f.remind_minutes_before
  )
  select c.activity_id, c.user_id, a.club_id, cl.slug, cl.name, a.title,
         a.starts_at, a.event_timezone, a.location, a.modality, a.created_by,
         c.remind_minutes_before
    from claimed c
    join public.club_activities a on a.id = c.activity_id
    join public.clubs cl on cl.id = a.club_id;
$$;

-- Devuelve al barrido las filas que se reclamaron y no se pudieron entregar.
-- Ante la duda, ruido antes que silencio.
create or replace function public.release_event_reminders(
  p_activity_id uuid,
  p_user_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_count integer;
begin
  update public.club_event_followers
     set reminded_at = null
   where activity_id = p_activity_id
     and user_id = any(p_user_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Las dos son del barrido, no de la app: solo service_role. Sin esto, cualquier
-- sesión autenticada podría sellar los recordatorios de todo el mundo (y con ello
-- impedir que se entreguen).
revoke all on function public.claim_due_event_reminders(integer, uuid) from public, anon, authenticated;
revoke all on function public.release_event_reminders(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.claim_due_event_reminders(integer, uuid) to service_role;
grant execute on function public.release_event_reminders(uuid, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Tipos de notificación
-- ---------------------------------------------------------------------------

-- Ampliar un enum es la dirección INOFENSIVA (el bundle anterior no conoce los
-- valores nuevos y no los recibe); retirar valores es la peligrosa. Ningún objeto
-- de esta migración USA los valores nuevos, así que pueden añadirse aquí mismo.
alter type public.notification_type add value if not exists 'club_event_reminder';
alter type public.notification_type add value if not exists 'club_event_updated';
alter type public.notification_type add value if not exists 'club_event_cancelled';
