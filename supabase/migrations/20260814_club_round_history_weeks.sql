-- Huecos "Sin ronda" en el histórico de rondas (issue #403). `listRoundHistory`
-- listaba las últimas N rondas que EXISTEN, no las últimas N semanas de
-- calendario: una semana muerta (nadie propuso, nadie respondió a la casa, así
-- que club_rounds nunca ganó fila -- ver el comentario de
-- private.house_prompt() en 20260803_club_rounds.sql) simplemente desaparecía
-- de la lista en vez de pintar un hueco en su sitio cronológico.
--
-- La serie de semanas ISO se genera AQUÍ, en SQL, no en TypeScript: la
-- decisión del 2026-08-03 ("la semana y el turno de una ronda se calculan en
-- SQL, el cliente nunca envía el periodo") existe precisamente para que nadie
-- reconstruya IYYY-"W"IW a mano fuera de la base -- reconstruirlo en TS para
-- el histórico sería la misma clase de bug con otro nombre.

create or replace function public.list_club_round_weeks(
  p_club_id uuid,
  p_weeks   int default 4
) returns table (
  period_key text,
  round_id   uuid,
  author_id  uuid,
  prompt     text
)
-- SECURITY DEFINER, como get_club_round_state: hace falta para poder llamar a
-- private.club_now() (su EXECUTE está revocado incluso a `authenticated`, a
-- propósito -- el cliente no calcula "ahora"). El gate de socio se pone a
-- mano con is_club_member(), igual que get_club_round_state, porque un
-- SECURITY DEFINER no hereda la RLS de quien llama.
language sql stable security definer set search_path = '' as $function$
  with ctx as (
    -- Semana de nacimiento del club, mismo cálculo que la CTE `turno` de
    -- get_club_round_state. Sin fila si quien llama no es socio: mismo
    -- criterio que esa función (silencio, no excepción -- la puerta de
    -- verdad ya la puso la página).
    select date_trunc('week', timezone('Europe/Madrid', c.created_at)) as club_week_start
    from public.clubs c
    where c.id = p_club_id and public.is_club_member(p_club_id)
  ),
  weeks as (
    -- Las p_weeks semanas ISO (lunes 00:00 Europe/Madrid) INMEDIATAMENTE
    -- ANTERIORES a la actual -- nunca incluye la semana de hoy, igual que el
    -- `.neq(period_key, currentPeriodKey)` que sustituye. Recortadas a partir
    -- de `club_week_start`: sin el filtro, un club de una semana de vida
    -- pintaría "Sin ronda" en semanas anteriores a su propia creación.
    select w.week_start
    from ctx, generate_series(
           date_trunc('week', private.club_now()) - make_interval(weeks => p_weeks),
           date_trunc('week', private.club_now()) - interval '1 week',
           interval '1 week'
         ) as w(week_start)
    where w.week_start >= ctx.club_week_start
  )
  select to_char(w.week_start, 'IYYY-"W"IW') as period_key,
         rd.id, rd.author_id, rd.prompt
  from weeks w
  left join public.club_rounds rd
    on rd.club_id = p_club_id
   and rd.period_key = to_char(w.week_start, 'IYYY-"W"IW')
  order by w.week_start desc;
$function$;

comment on function public.list_club_round_weeks(uuid, int) is
  'Últimas p_weeks semanas ISO (Europe/Madrid) anteriores a la actual, con la ronda de club_rounds si existe -- round_id NULL = semana sin ronda ("Sin ronda" en el histórico, issue #403). Serie generada en SQL a propósito, ver comentario de la migración 20260814_club_round_history_weeks.';

revoke execute on function public.list_club_round_weeks(uuid, int) from public, anon;
grant  execute on function public.list_club_round_weeks(uuid, int) to authenticated;
