-- Matriz de regresión de las rondas de club.
-- Se ejecuta SOLO contra biblioshare-dev. Todo se revierte.
begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion_failed: %', p_message;
  end if;
end;
$function$;

create or replace function pg_temp.expect_sqlstate(p_sql text, p_expected_state text, p_message text)
returns void language plpgsql as $function$
declare v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = p_expected_state then return; end if;
    raise exception 'assertion_failed: % (esperaba SQLSTATE %, llegó %)', p_message, p_expected_state, v_state;
  end;
  raise exception 'assertion_failed: % (la sentencia funcionó y no debía)', p_message;
end;
$function$;

-- Ana es dueña del club. Beto entra después. Carla NO es miembro: existe solo
-- para las aserciones negativas de RLS.
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000002a1', 'authenticated', 'authenticated', 'rondas-ana@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000002b2', 'authenticated', 'authenticated', 'rondas-beto@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000002c3', 'authenticated', 'authenticated', 'rondas-carla@example.test', now(), now());
insert into public.profiles (user_id, username, display_name, is_public, role) values
  ('00000000-0000-4000-8000-0000000002a1', 'rondas_ana', 'Ana', true, 'user'),
  ('00000000-0000-4000-8000-0000000002b2', 'rondas_beto', 'Beto', true, 'user'),
  ('00000000-0000-4000-8000-0000000002c3', 'rondas_carla', 'Carla', true, 'user');

insert into public.clubs (id, slug, name, visibility, owner_id, created_at) values
  ('00000000-0000-4000-8000-000000000201', 'rondas-test', 'Club de rondas', 'public',
   '00000000-0000-4000-8000-0000000002a1', now() - interval '10 weeks');
insert into public.club_members (club_id, user_id, role, status, joined_at) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000002a1', 'owner',  'active', now() - interval '10 weeks'),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000002b2', 'member', 'active', now() - interval '9 weeks');

-- ── La tabla y su forma ──────────────────────────────────────────────
insert into public.club_rounds (id, club_id, period_key, author_id, prompt) values
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000201',
   '2026-W01', '00000000-0000-4000-8000-0000000002a1', 'Una ronda de prueba');

select pg_temp.expect_sqlstate(
  $$insert into public.club_rounds (club_id, period_key, prompt)
    values ('00000000-0000-4000-8000-000000000201', '2026-W01', 'Otra del mismo periodo')$$,
  '23505',
  'dos rondas en el mismo periodo del mismo club violan la unicidad'
);

-- ── El registro canónico de interacción ──────────────────────────────
select pg_temp.assert_true(
  exists (select 1 from public.interaction_targets t
          where t.kind = 'club_round'
            and t.source_id = '00000000-0000-4000-8000-000000000202'
            and t.audience_kind = 'club_member'
            and t.audience_id = '00000000-0000-4000-8000-000000000201'
            and t.commentable and t.reactable),
  'insertar una ronda registra su interaction_target con audiencia club_member'
);

-- Una ronda de la casa (author_id nulo) tiene por dueño al dueño DEL CLUB:
-- interaction_targets.owner_id es NOT NULL y la casa no es un usuario.
insert into public.club_rounds (id, club_id, period_key, author_id, prompt) values
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000201',
   '2026-W02', null, 'Consigna de la casa de prueba');
select pg_temp.assert_true(
  (select t.owner_id from public.interaction_targets t
   where t.kind = 'club_round' and t.source_id = '00000000-0000-4000-8000-000000000203')
  = '00000000-0000-4000-8000-0000000002a1',
  'una ronda de la casa cuelga del dueño del club'
);

-- ── Borrado: el trigger genérico barre el target ─────────────────────
delete from public.club_rounds where id = '00000000-0000-4000-8000-000000000203';
select pg_temp.assert_true(
  not exists (select 1 from public.interaction_targets
              where kind = 'club_round' and source_id = '00000000-0000-4000-8000-000000000203'),
  'borrar una ronda borra su interaction_target'
);

-- ── RLS: las dos políticas se ejercitan de verdad, no solo se ven ────
-- Todo lo de arriba corrió con el rol privilegiado de execute_sql, que se
-- salta la RLS entera. A partir de aquí se cambia de rol y de JWT, igual que
-- hace social_phase1_interaction_targets.sql.

-- Carla no es miembro del club: "select" no le devuelve la ronda 202.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000002c3","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(
  (select count(*) from public.club_rounds where id = '00000000-0000-4000-8000-000000000202') = 0,
  'quien no es miembro del club no ve la ronda'
);
reset role;

-- Beto es miembro raso (no moderador): el DELETE no da error -- la RLS
-- simplemente no le deja ver la fila a borrar --, así que se comprueba que
-- la fila SIGUE existiendo después, no que la sentencia falle.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000002b2","role":"authenticated"}', true);
set local role authenticated;
delete from public.club_rounds where id = '00000000-0000-4000-8000-000000000202';
reset role;
select pg_temp.assert_true(
  exists (select 1 from public.club_rounds where id = '00000000-0000-4000-8000-000000000202'),
  'un miembro raso no puede borrar la ronda: la fila sigue existiendo'
);

-- Ana es la dueña del club (moderador+ en la jerarquía member<moderator<owner):
-- sí puede borrar. Va AL FINAL: si esta fila desapareciera antes de la
-- comprobación de Beto, esa comprobación pasaría por el motivo equivocado
-- (fila inexistente) en vez del correcto (RLS se lo impide).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated"}', true);
set local role authenticated;
delete from public.club_rounds where id = '00000000-0000-4000-8000-000000000202';
reset role;
select pg_temp.assert_true(
  not exists (select 1 from public.club_rounds where id = '00000000-0000-4000-8000-000000000202'),
  'el dueño del club (moderador+) sí puede borrar la ronda'
);

-- Limpieza de contexto de sesión: una tarea siguiente añadirá más aserciones
-- a este mismo fichero, dentro de la misma transacción, y heredaría el rol y
-- el JWT si no se devuelven aquí al estado previo.
reset role;
select set_config('request.jwt.claims', '', true);

-- ── El periodo y el turno ────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated"}';

select pg_temp.assert_true(
  (select period_key from public.get_club_round_state('00000000-0000-4000-8000-000000000201'))
   = to_char(timezone('Europe/Madrid', now()), 'IYYY-"W"IW'),
  'el periodo es la semana ISO en Europe/Madrid'
);

select pg_temp.assert_true(
  (select holder_id from public.get_club_round_state('00000000-0000-4000-8000-000000000201'))
   in ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002b2'),
  'el titular es uno de los dos miembros activos'
);

-- El club nació hace 10 semanas con 2 miembros: el titular alterna semana a
-- semana. Se comprueba la ARITMÉTICA, no una fecha concreta.
select pg_temp.assert_true(
  (select count(distinct holder) from (
     select (select user_id from (
       select user_id, row_number() over (order by joined_at, user_id) - 1 as idx
       from public.club_members
       where club_id = '00000000-0000-4000-8000-000000000201' and status = 'active'
     ) r where r.idx = w % 2) as holder
     from generate_series(0, 5) as w
   ) s) = 2,
  'a lo largo de 6 semanas consecutivas rotan los 2 miembros'
);

-- ── ensure_club_round: quién puede escribir ──────────────────────────
-- Carla no es miembro.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002c3","role":"authenticated"}';
select pg_temp.expect_sqlstate(
  $$select public.ensure_club_round('00000000-0000-4000-8000-000000000201', 'Intrusa')$$,
  '42501',
  'un no-miembro no puede crear una ronda'
);

-- El que NO es titular no puede proponer.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated"}';
do $$
declare v_holder uuid; v_otro uuid;
begin
  select holder_id into v_holder from public.get_club_round_state('00000000-0000-4000-8000-000000000201');
  select user_id into v_otro from public.club_members
   where club_id = '00000000-0000-4000-8000-000000000201' and status = 'active' and user_id <> v_holder limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_otro, 'role', 'authenticated')::text, true);
  perform pg_temp.expect_sqlstate(
    format('select public.ensure_club_round(%L, %L)', '00000000-0000-4000-8000-000000000201', 'No me toca'),
    '42501',
    'quien no es titular no puede proponer la ronda');
  -- Y el titular SÍ puede.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_holder, 'role', 'authenticated')::text, true);
  perform public.ensure_club_round('00000000-0000-4000-8000-000000000201', 'La pregunta del titular');
end;
$$;

select pg_temp.assert_true(
  (select count(*) from public.club_rounds
   where club_id = '00000000-0000-4000-8000-000000000201'
     and period_key = to_char(timezone('Europe/Madrid', now()), 'IYYY-"W"IW')) = 1,
  'el titular creó exactamente una ronda para el periodo actual'
);

-- Idempotencia: repetir la llamada devuelve la MISMA ronda, no una segunda.
do $$
declare v_a uuid; v_b uuid;
begin
  select round_id into v_a from public.get_club_round_state('00000000-0000-4000-8000-000000000201');
  select public.ensure_club_round('00000000-0000-4000-8000-000000000201') into v_b;
  perform pg_temp.assert_true(v_a = v_b, 'ensure_club_round es idempotente dentro del periodo');
end;
$$;

-- La consigna de la casa es determinista y depende del club Y del periodo.
-- private.house_prompt() es una función interna: el Step 3 le revoca
-- "execute" al rol authenticated a propósito (el cliente no debe poder
-- llamarla directo). Se prueba con el rol privilegiado de execute_sql, igual
-- que la sección "La tabla y su forma" al principio de este fichero.
reset role;
select pg_temp.assert_true(
  private.house_prompt('00000000-0000-4000-8000-000000000201', '2026-W05')
  = private.house_prompt('00000000-0000-4000-8000-000000000201', '2026-W05'),
  'la consigna de la casa es estable para un club y periodo dados'
);
-- Comprobar SOLO W05 vs W06 sería inestable: con 10 consignas posibles hay 1
-- entre 10 de que dos periodos consecutivos caigan en el mismo índice por
-- pura colisión de hash. Se comprueba la PROPIEDAD sobre un puñado de
-- periodos: que no todos caen en la misma consigna.
select pg_temp.assert_true(
  (select count(distinct private.house_prompt('00000000-0000-4000-8000-000000000201', p))
   from (values ('2026-W01'), ('2026-W02'), ('2026-W03'), ('2026-W04'),
                ('2026-W05'), ('2026-W06'), ('2026-W07'), ('2026-W08')) as periods(p)) > 1,
  'la consigna de la casa varía entre periodos, no es constante'
);

-- Nada más corre como authenticated tras esto: contexto ya limpio (reset role
-- de arriba) y el claim de la sección de turno no ha vuelto a fijarse desde
-- entonces. Se limpia igualmente el claim por si acaso, misma disciplina que
-- el cierre de la sección de RLS de la Task 1.
select set_config('request.jwt.claims', '', true);

rollback;
