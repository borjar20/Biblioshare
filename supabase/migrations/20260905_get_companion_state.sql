-- Mascota: lectura LIGERA de la compañera en UNA consulta (issue #1023).
--
-- Corre en CADA página del shell (app-shell.tsx → getCompanionState). Antes
-- eran cinco viajes: pet_state + cuatro sondas limit(1) de última actividad.
-- Aquí es un único RPC que devuelve la fila de pet_state y el último día con
-- actividad VIVIDA, o null si el usuario no ha eclosionado.
--
-- SECURITY INVOKER: corre con la RLS del que llama; solo ve sus propias filas.
--
-- "Última actividad" es la misma definición que lastActivityISO en
-- src/lib/pet/get-pet-counts.ts (issue #1041): día de sesión ∪ cierre de un
-- pase VIVIDO ∪ post ∪ voto. Un pase es historial (NO actividad) si cumple
-- cualquiera de las tres reglas de splitPassHistory (src/lib/pet/counts.ts):
--   * finished_on anterior al día de alta (lectura pasada registrada hoy);
--   * created_at es medianoche UTC exacta (solo lo escribe el importador);
--   * su día de alta tiene >= 10 pases (volcado). 10 = BALANCE.history.burstMin
--     (src/lib/pet/balance.ts): si cambia allí, cambia aquí.
-- "Día" = Europe/Madrid, la misma convención que get_widget_snapshot y
-- club_rounds (la app en TS usa el día local del servidor).
create or replace function public.get_companion_state()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with pet as (
    select name, class, hatched_at, companion_hidden, last_level
    from public.pet_state
    where user_id = auth.uid()
  ),
  mine as (
    select finished_on,
           created_at,
           (timezone('Europe/Madrid', created_at))::date as created_day
    from public.passes
    where user_id = auth.uid()
  ),
  bursts as (
    select created_day from mine group by created_day having count(*) >= 10
  ),
  lived as (
    select finished_on
    from mine
    where finished_on is not null
      and finished_on >= created_day
      and created_at <> (date_trunc('day', created_at at time zone 'utc') at time zone 'utc')
      and created_day not in (select created_day from bursts)
  ),
  last_activity as (
    select max(d) as day
    from (
      select max(session_date) as d from public.progress_sessions where user_id = auth.uid()
      union all
      select max(finished_on) from lived
      union all
      select max((timezone('Europe/Madrid', created_at))::date) from public.club_posts where author_id = auth.uid()
      union all
      select max((timezone('Europe/Madrid', voted_at))::date) from public.club_poll_votes where user_id = auth.uid()
    ) x
  )
  select jsonb_build_object(
    'name', pet.name,
    'class', pet.class,
    'hatched_at', to_char(pet.hatched_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'companion_hidden', pet.companion_hidden,
    'last_level', pet.last_level,
    'last_activity', to_char((select day from last_activity), 'YYYY-MM-DD')
  )
  from pet;
$$;

comment on function public.get_companion_state() is
  'Mascota: pet_state + último día con actividad VIVIDA (misma regla que get-pet-counts.ts) en una consulta para el shell. null sin mascota.';

revoke all on function public.get_companion_state() from public, anon;
grant execute on function public.get_companion_state() to authenticated;
