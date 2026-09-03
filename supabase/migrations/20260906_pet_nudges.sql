-- Mascota fase 3: avisos push por racha y humor
-- (docs/superpowers/specs/2026-09-02-mascota-avisos-push-design.md).
--
-- Un push al día como mucho. Sin fila en `notifications`: el rastro y la
-- idempotencia son `pet_nudges` (unique user_id, day). Claim en SQL, envío en
-- Node (/api/cron/pet-nudges), calcado de 20260824_club_event_reminder_scheduler.

-- 1. Preferencia: categoría «Mascota». Grant de tabla entera (20260829): no hay
--    grant por columna que añadir, pero pasa la superficie 6 de DRIFT-CHECK.
alter table public.notification_preferences
  add column if not exists category_pet boolean not null default true;

comment on column public.notification_preferences.category_pet is
  'Avisos push de la mascota (racha en peligro, humor). Sin fila = activa.';

-- 2. Rastro de los avisos.
create table public.pet_nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Día LOCAL (Europe/Madrid) del barrido que lo decidió.
  day date not null,
  kind text not null check (kind in ('streak_at_risk', 'mood_sleepy', 'mood_sad')),
  -- Longitud de la racha en peligro; null en los de humor.
  streak integer,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

comment on table public.pet_nudges is
  'Mascota fase 3: un aviso push por usuario y día (racha en peligro o humor). Lo escribe SOLO claim_pet_nudges() (service_role). Ver spec 2026-09-02-mascota-avisos-push.';

alter table public.pet_nudges enable row level security;

create policy "pet_nudges select own" on public.pet_nudges
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.pet_nudges from anon, authenticated;
grant select on public.pet_nudges to authenticated;

-- 3. Días con actividad VIVIDA de un usuario dado. Misma regla que
--    get_companion_state() (20260905) y splitPassHistory (src/lib/pet/counts.ts):
--    historial = finished_on < día de alta, o created_at medianoche UTC exacta,
--    o día de alta con >= 10 pases (BALANCE.history.burstMin). Recibe un user_id
--    arbitrario: en `private` y sin execute para anon/authenticated.
create or replace function private.pet_lived_activity_days(p_user uuid)
returns table (day date)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select finished_on,
           created_at,
           (timezone('Europe/Madrid', created_at))::date as created_day
    from public.passes
    where user_id = p_user
  ),
  bursts as (
    select created_day from mine group by created_day having count(*) >= 10
  ),
  lived as (
    select finished_on as day
    from mine
    where finished_on is not null
      and finished_on >= created_day
      and created_at <> (date_trunc('day', created_at at time zone 'utc') at time zone 'utc')
      and created_day not in (select created_day from bursts)
  )
  select distinct d.day
  from (
    select session_date as day from public.progress_sessions where user_id = p_user
    union all
    select day from lived
    union all
    select (timezone('Europe/Madrid', created_at))::date from public.club_posts where author_id = p_user
    union all
    select (timezone('Europe/Madrid', voted_at))::date from public.club_poll_votes where user_id = p_user
  ) d
  where d.day is not null;
$$;

revoke all on function private.pet_lived_activity_days(uuid) from public, anon, authenticated;

-- 4. El claim. Para cada candidato (mascota visible, algún dispositivo push
--    activo, category_pet no apagada) calcula el último día vivido y la racha
--    que termina AYER, decide el tipo e inserta; devuelve SOLO las filas nuevas.
--    Un segundo claim el mismo día devuelve cero. Umbrales copiados de
--    src/lib/pet/balance.ts: streak >= 3 (nudges.streakMin), 2 = mood.sleepyFrom,
--    4 = mood.sadFrom.
--    En `public` (PostgREST solo expone public) pero solo service_role puede
--    ejecutarla, como claim_due_event_reminders.
create or replace function public.claim_pet_nudges(
  p_day date default (timezone('Europe/Madrid', now()))::date
)
returns table (user_id uuid, name text, kind text, streak integer)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select p.user_id, p.name
    from public.pet_state p
    where p.companion_hidden = false
      and exists (
        select 1 from public.push_devices d
        where d.user_id = p.user_id and d.enabled = true
      )
      and coalesce(
        (select np.category_pet from public.notification_preferences np where np.user_id = p.user_id),
        true
      )
  ),
  activity as (
    select c.user_id, c.name, a.day
    from candidates c
    cross join lateral private.pet_lived_activity_days(c.user_id) a
  ),
  last_day as (
    select user_id, name, max(day) as last_day
    from activity
    group by user_id, name
  ),
  -- Racha que termina en p_day - 1: con los días en orden descendente y
  -- numerados desde 1, la fila n forma parte de la racha sii day + n = p_day
  -- (días distintos: el primer hueco rompe la igualdad para siempre).
  streaks as (
    select user_id, count(*) filter (where day + rn = p_day)::integer as streak
    from (
      select user_id, day,
             row_number() over (partition by user_id order by day desc)::integer as rn
      from activity
      where day < p_day
    ) x
    group by user_id
  ),
  decided as (
    select l.user_id, l.name,
      case
        when l.last_day = p_day - 1 and coalesce(s.streak, 0) >= 3 then 'streak_at_risk'
        when l.last_day = p_day - 2 then 'mood_sleepy'
        when l.last_day = p_day - 4 then 'mood_sad'
      end as kind,
      case when l.last_day = p_day - 1 and coalesce(s.streak, 0) >= 3 then s.streak end as streak
    from last_day l
    left join streaks s on s.user_id = l.user_id
  ),
  inserted as (
    insert into public.pet_nudges (user_id, day, kind, streak)
    select d.user_id, p_day, d.kind, d.streak
    from decided d
    where d.kind is not null
    on conflict (user_id, day) do nothing
    returning pet_nudges.user_id, pet_nudges.kind, pet_nudges.streak
  )
  select i.user_id, d.name, i.kind, i.streak
  from inserted i
  join decided d on d.user_id = i.user_id;
$$;

revoke all on function public.claim_pet_nudges(date) from public, anon, authenticated;
grant execute on function public.claim_pet_nudges(date) to service_role;

-- 5. Despacho: cada hora, pero solo actúa a las 20:00 de Europe/Madrid. pg_cron
--    programa en UTC y una hora fija se movería con el cambio de hora; mirar la
--    hora local aquí lo evita sin tocar el job. Mismos secretos de Vault que el
--    cron de recordatorios (app_base_url, cron_secret): no hay que crear nada.
create or replace function private.dispatch_pet_nudges()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if extract(hour from timezone('Europe/Madrid', now())) <> 20 then
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    raise warning 'dispatch_pet_nudges: faltan los secretos app_base_url/cron_secret en Vault; no se despacha nada';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/api/cron/pet-nudges',
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-cron-secret', v_secret
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;

revoke all on function private.dispatch_pet_nudges() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'pet-nudges') then
    perform cron.unschedule('pet-nudges');
  end if;
  perform cron.schedule(
    'pet-nudges',
    '0 * * * *',
    $job$ select private.dispatch_pet_nudges(); $job$
  );
end $$;
