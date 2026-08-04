-- Seguimiento de eventos de club (spec 2026-08-04).
--
-- Tres cosas a la vez, porque las tres son la misma feature:
--   1. El evento gana los datos que su ficha necesita (hora, zona, sitio, estado).
--   2. `club_event_followers`: quién sigue qué, y cuándo quiere que le avisemos.
--   3. El primer trabajo programado del repo (pg_cron + pg_net), que retira el
--      bloqueo de #394.
--
-- Por qué COLUMNAS y no `config jsonb`, que es donde van los campos por kind:
-- el barrido de recordatorios tiene que comparar y indexar `starts_at`. En jsonb
-- una fecha es una CADENA, y comparar fechas como cadenas es exactamente lo que
-- prohíbe §10 de la spec (y lo que calendar-marks.ts ya documenta como trampa).
--
-- SD-8 sigue en pie: el evento es un `kind` de club_activities, no una tabla
-- aparte. Estas columnas son nulas para los otros cuatro kinds, a propósito.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.event_modality as enum ('presencial', 'online', 'hibrida');
exception when duplicate_object then null; end $$;

-- Solo los tres estados que una PERSONA declara. "En curso" y "finalizado" NO
-- están aquí: se deducen del reloj (starts_at/ends_at) en una función pura
-- compartida por servidor y cliente. Un estado guardado es un estado que hay
-- que mantener sincronizado, y group-activities.ts ya dejó esa lección escrita
-- en este mismo módulo.
do $$ begin
  create type public.club_event_state as enum ('programado', 'cancelado', 'pospuesto');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Columnas del evento
-- ---------------------------------------------------------------------------

alter table public.club_activities
  add column if not exists starts_at      timestamptz,
  add column if not exists ends_at        timestamptz,
  add column if not exists event_timezone text not null default 'Europe/Madrid',
  add column if not exists location       text,
  add column if not exists modality       public.event_modality,
  add column if not exists online_url     text,
  add column if not exists event_state    public.club_event_state not null default 'programado',
  add column if not exists updated_at     timestamptz;

-- Los topes son los mismos que ya usa la tabla para title/description
-- (20260715_text_length_limits.sql): si divergieran, habría un rango de
-- longitudes que pasa la validación del cliente y muere en Postgres con un
-- 23514 crudo que la UI no traduce.
do $$ begin
  alter table public.club_activities
    add constraint club_activities_location_len check (char_length(location) <= 200);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.club_activities
    add constraint club_activities_online_url_len check (char_length(online_url) <= 500);
exception when duplicate_object then null; end $$;

-- Un fin anterior al inicio no es un dato, es un bug. En BD para que no dependa
-- de que todos los escritores se acuerden.
do $$ begin
  alter table public.club_activities
    add constraint club_activities_event_window check (ends_at is null or starts_at is null or ends_at >= starts_at);
exception when duplicate_object then null; end $$;

-- Backfill: los eventos que existen se crearon cuando el modelo no tenía hora.
-- 19:00 Europe/Madrid es una hora INVENTADA, y se asume a la vista: es la que
-- menos sorprende para un club de lectura. La alternativa (dejarlos sin
-- instante) obligaría a que toda la feature tratara "evento sin hora" como caso
-- especial permanente.
update public.club_activities
   set starts_at = (starts_on::text || ' 19:00')::timestamp at time zone 'Europe/Madrid'
 where kind = 'evento' and starts_on is not null and starts_at is null;

-- ---------------------------------------------------------------------------
-- 3. starts_on se mantiene solo, y no puede divergir
-- ---------------------------------------------------------------------------

-- `starts_on` SE QUEDA: de él cuelgan el calendario, group-activities, la tira
-- "Próximo" del feed y los eventos que ya existen. Lo deriva un trigger.
--
-- NO es una columna generada porque no PUEDE serlo: timezone(text, timestamptz)
-- es STABLE, no IMMUTABLE (depende de la base de datos de zonas), y Postgres
-- rechaza una GENERATED que la invoque. El trigger consigue lo mismo —
-- divergencia estructuralmente imposible, sea quien sea quien escriba — y deja
-- intactos TODOS los lectores actuales: ni una consulta del calendario cambia.
create or replace function private.sync_club_event_date()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.kind = 'evento' and new.starts_at is not null then
    new.starts_on := (new.starts_at at time zone new.event_timezone)::date;
  end if;

  -- updated_at lo pone la BD, nunca el cliente: es el dato de "última
  -- actualización" que la ficha muestra, y un cliente puede mentir.
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists sync_club_event_date on public.club_activities;
create trigger sync_club_event_date
  before insert or update on public.club_activities
  for each row execute function private.sync_club_event_date();

-- ---------------------------------------------------------------------------
-- 4. Cuándo toca avisar
-- ---------------------------------------------------------------------------

-- STABLE, no IMMUTABLE: mira now() para no armar nunca el recordatorio de algo
-- que ya terminó. Por eso tampoco puede ir en un índice; el índice va sobre la
-- columna que esta función rellena.
create or replace function private.club_event_reminder_due(
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_event_state public.club_event_state,
  p_minutes     integer
) returns timestamptz
language sql
stable
set search_path to ''
as $$
  select case
    -- Sin preferencia = sin recordatorio. Es una elección, no un hueco.
    when p_minutes is null then null
    when p_starts_at is null then null
    -- Cancelado o pospuesto: los recordatorios futuros se apagan (§9.4).
    when p_event_state <> 'programado' then null
    -- Ya empezado (en curso) o terminado: no hay nada que anticipar. Un
    -- «recordatorio» de algo que ya está pasando no es un recordatorio -- por
    -- definición avisa ANTES. Ojo: la condición es sobre `starts_at`, NO sobre
    -- `coalesce(ends_at, starts_at)`; con la segunda, seguir un evento en curso
    -- con «24 horas antes» disparaba un aviso inmediato de algo ya empezado.
    when p_starts_at <= now() then null
    -- Si el momento ya pasó pero el evento no ha empezado ("muy próximo"), el
    -- resultado queda en el pasado y el primer barrido lo coge. No hace falta
    -- un caso especial: `reminder_due_at <= now()` ya es cierto.
    else p_starts_at - make_interval(mins => p_minutes)
  end;
$$;

-- ---------------------------------------------------------------------------
-- 5. La tabla de seguimiento
-- ---------------------------------------------------------------------------

create table if not exists public.club_event_followers (
  activity_id           uuid        not null references public.club_activities(id) on delete cascade,
  user_id               uuid        not null references auth.users(id)             on delete cascade,
  followed_at           timestamptz not null default now(),
  -- null = "sin recordatorio". Los valores que ofrece la UI son 0, 15, 60,
  -- 1440 y 10080; el CHECK deja cualquier positivo porque el tope real lo pone
  -- la UI y un valor raro no rompe nada (solo adelanta el aviso).
  remind_minutes_before integer,
  -- DERIVADO por trigger, nunca escrito a mano. Es la única desnormalización de
  -- la feature y tiene justificación: el barrido corre cada 5 min sobre TODOS
  -- los clubes, y con el instante precalculado es una búsqueda por índice.
  -- Calculando `starts_at - interval` por fila no hay índice posible.
  reminder_due_at       timestamptz,
  -- Sello de entrega: es la idempotencia del barrido y del reclamo atómico.
  reminded_at           timestamptz,
  -- La PK compuesta ES la restricción única de "un usuario sigue una vez" Y el
  -- índice de "seguidores de este evento". Una columna `id` sintética añadiría
  -- una unique aparte para no ganar nada.
  primary key (activity_id, user_id),
  constraint club_event_followers_remind_positive
    check (remind_minutes_before is null or remind_minutes_before >= 0)
);

comment on table public.club_event_followers is
  'Interés en un evento de club (kind=evento). Seguir NO es asistir: expresa interés y arma un recordatorio.';

-- "Eventos que sigue esta persona" (§16).
create index if not exists club_event_followers_user_idx
  on public.club_event_followers (user_id, activity_id);

-- El barrido. Parcial: las filas ya entregadas no ocupan índice.
create index if not exists club_event_followers_due_idx
  on public.club_event_followers (reminder_due_at)
  where reminded_at is null;

-- El recordatorio es un CAMPO de la fila de seguimiento, mantenido en la MISMA
-- transacción que la escritura que lo provoca. De ahí sale, sin código, que no
-- pueda existir un seguidor sin recordatorio ni un recordatorio sin seguidor:
-- no hay dos escrituras que puedan quedar desparejadas (§21).
create or replace function private.sync_event_follower_reminder()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_starts_at   timestamptz;
  v_ends_at     timestamptz;
  v_event_state public.club_event_state;
begin
  select starts_at, ends_at, event_state
    into v_starts_at, v_ends_at, v_event_state
    from public.club_activities
   where id = new.activity_id;

  new.reminder_due_at := private.club_event_reminder_due(
    v_starts_at, v_ends_at, v_event_state, new.remind_minutes_before
  );
  return new;
end;
$$;

drop trigger if exists sync_event_follower_reminder on public.club_event_followers;
create trigger sync_event_follower_reminder
  before insert or update on public.club_event_followers
  for each row execute function private.sync_event_follower_reminder();

-- Cambia la fecha, la zona o el estado del evento ⇒ se reprograma a TODOS sus
-- seguidores. El cálculo no se repite aquí: este trigger solo toca `reminded_at`
-- y deja que el trigger de arriba recalcule (un UPDATE dispara su BEFORE aunque
-- el valor no cambie). Un solo sitio calcula el instante.
--
-- Que un cambio de fecha re-arme incluso un recordatorio YA entregado es
-- deliberado: quien recibió "mañana a las 18:00" necesita enterarse cuando pase
-- a ser el jueves.
create or replace function private.reschedule_event_reminders()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  update public.club_event_followers
     set reminded_at = case
           when new.starts_at is distinct from old.starts_at then null
           else reminded_at
         end
   where activity_id = new.id;
  return null;
end;
$$;

drop trigger if exists reschedule_event_reminders on public.club_activities;
create trigger reschedule_event_reminders
  after update of starts_at, ends_at, event_state, event_timezone
  on public.club_activities
  for each row
  when (new.kind = 'evento')
  execute function private.reschedule_event_reminders();

-- ---------------------------------------------------------------------------
-- 6. RLS y grants
-- ---------------------------------------------------------------------------

alter table public.club_event_followers enable row level security;

-- Ver quién sigue un evento = ser miembro ACTIVO de su club. Mismo gate que el
-- calendario, y el que decide la privacidad de §12: aunque el club sea público,
-- la lista de seguidores es de sus miembros. Se prioriza la privacidad.
drop policy if exists "members read event followers" on public.club_event_followers;
create policy "members read event followers"
  on public.club_event_followers for select
  using (
    exists (
      select 1 from public.club_activities a
       where a.id = club_event_followers.activity_id
         and public.is_club_member(a.club_id)
    )
  );

-- Sin política insert/update/delete a propósito (SD-8): se escribe SOLO por RPC
-- SECURITY DEFINER, igual que el resto del motor de actividades.

revoke all on public.club_event_followers from anon, authenticated;
grant select on public.club_event_followers to authenticated;

-- club_activities tiene grant POR COLUMNA. Postgres exige privilegio sobre toda
-- columna nombrada en un INSERT/UPDATE aunque su valor sea NULL, así que una
-- columna nueva sin grant rompe la escritura ENTERA de la tabla, no solo el
-- campo nuevo. Ha pasado dos veces (issue #375, superficie 6 de DRIFT-CHECK).
grant insert (starts_at, ends_at, event_timezone, location, modality, online_url, event_state, updated_at),
      update (starts_at, ends_at, event_timezone, location, modality, online_url, event_state, updated_at)
   on public.club_activities to authenticated, anon, service_role;
