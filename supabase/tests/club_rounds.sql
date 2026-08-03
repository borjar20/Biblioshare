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

-- Un segundo club, misma composición (Ana + Beto, mismo delta de una semana
-- entre alta de club y alta del segundo miembro) pero nacido UNA semana antes
-- que el de arriba. Sirve para conducir get_club_round_state() de verdad: si
-- el titular avanza una posición por semana transcurrida, este club y el de
-- 10 semanas deben tener titulares distintos en el periodo actual.
insert into public.clubs (id, slug, name, visibility, owner_id, created_at) values
  ('00000000-0000-4000-8000-000000000204', 'rondas-test-11w', 'Club de rondas (11 semanas)', 'public',
   '00000000-0000-4000-8000-0000000002a1', now() - interval '11 weeks');
insert into public.club_members (club_id, user_id, role, status, joined_at) values
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-0000000002a1', 'owner',  'active', now() - interval '11 weeks'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-0000000002b2', 'member', 'active', now() - interval '10 weeks');

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

-- La aserción de arriba se mira al espejo: compara contra la MISMA expresión
-- que usa la función, así que solo distinguiría una implementación en UTC
-- durante el par de horas por semana en que ambos husos cruzan el límite.
-- Esta es determinista: Madrid nunca está en UTC+0 (ni en horario de
-- invierno, que es UTC+1), así que aguanta las 8760 horas del año y falla al
-- instante si alguien cambia club_now() a UTC. club_now() es de `private`,
-- así que corre con el rol privilegiado, igual que house_prompt() más abajo.
reset role;
select pg_temp.assert_true(
  private.club_now() is distinct from (now() at time zone 'UTC'),
  'club_now() usa Europe/Madrid, no UTC'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated"}';

select pg_temp.assert_true(
  (select holder_id from public.get_club_round_state('00000000-0000-4000-8000-000000000201'))
   in ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000002b2'),
  'el titular es uno de los dos miembros activos'
);

-- El titular avanza una posición por semana transcurrida. Reimplementar la
-- aritmética en el propio test (row_number + % 2) solo probaría "este club
-- tiene dos miembros", pasaría igual con % 1, con joined_at ignorado o con un
-- titular fijo: no conduce la función real. En su lugar, se compara la
-- función CONTRA SÍ MISMA en dos clubes con la misma composición y un año de
-- nacimiento desfasado una semana exacta -- si el delta de semanas o el
-- módulo estuvieran mal, ambos clubes coincidirían en el mismo titular.
select pg_temp.assert_true(
  (select holder_id from public.get_club_round_state('00000000-0000-4000-8000-000000000201'))
  is distinct from
  (select holder_id from public.get_club_round_state('00000000-0000-4000-8000-000000000204')),
  'el titular avanza una posición al comparar dos clubes nacidos con una semana de diferencia'
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

-- Ronda ya abierta por el titular: otro miembro que intenta proponer texto
-- encima NO puede recibir éxito silencioso -- eso perdería su texto sin que
-- nadie se entere y es justo lo que rompía el badge "se te pasó el turno".
do $$
declare v_holder uuid; v_otro uuid;
begin
  select holder_id into v_holder from public.get_club_round_state('00000000-0000-4000-8000-000000000201');
  select user_id into v_otro from public.club_members
   where club_id = '00000000-0000-4000-8000-000000000201' and status = 'active' and user_id <> v_holder limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_otro, 'role', 'authenticated')::text, true);
  perform pg_temp.expect_sqlstate(
    format('select public.ensure_club_round(%L, %L)', '00000000-0000-4000-8000-000000000201', 'Yo también quiero'),
    '42501',
    'un miembro que no escribió la ronda ya abierta no puede proponer texto encima');
  -- Deja el claim en el titular: es el que necesitan los bloques siguientes.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_holder, 'role', 'authenticated')::text, true);
end;
$$;

-- Idempotencia: repetir la llamada devuelve la MISMA ronda, no una segunda.
do $$
declare v_a uuid; v_b uuid;
begin
  select round_id into v_a from public.get_club_round_state('00000000-0000-4000-8000-000000000201');
  select public.ensure_club_round('00000000-0000-4000-8000-000000000201') into v_b;
  perform pg_temp.assert_true(v_a = v_b, 'ensure_club_round es idempotente dentro del periodo');
end;
$$;

-- ── house_prompt: la consigna pendiente de materializar ──────────────
-- get_club_round_state.house_prompt es lo que vio la review de la Task 4 que
-- faltaba: sin ella, el estado "consigna de la casa sin materializar" (día
-- >= 3, sin ronda todavía) pintaba el sello "Ronda de la casa" y el botón
-- "Responder" sin la pregunta a la vista.

-- Con ronda ya escrita para el periodo, house_prompt es null pase lo que
-- pase con el día: la ronda ya escrita manda, la consigna de la casa no
-- compite por el mismo periodo.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated"}';
select pg_temp.assert_true(
  (select house_prompt from public.get_club_round_state('00000000-0000-4000-8000-000000000201')) is null,
  'house_prompt es null cuando el periodo ya tiene ronda escrita'
);

-- Fuera de esa rama, house_prompt es una PROPIEDAD frente a
-- private.house_prompt(): coincide con ella cuando toca (día >= 3 y sin
-- ronda) y es null en cualquier otro caso. Sin costura de inyección para
-- forzar club_now() (issue diferida de la Task 2, #4: "el camino de
-- consigna de la casa no tiene cobertura"), se escribe como propiedad válida
-- sea cual sea el día real en que corra la matriz, en vez de asumirlo. Club
-- 204 nunca recibe una ronda en todo este fichero -- aísla el efecto del día
-- sin la ronda ya escrita de por medio. La lectura pasa por
-- get_club_round_state (rol authenticated, como un cliente real); la
-- comparación con private.house_prompt() necesita el rol privilegiado
-- (revocado a authenticated a propósito), así que el resultado se pasa de
-- una sesión de rol a otra por una tabla temporal -- mismo motivo que
-- reset role antes de llamar a private.house_prompt() más abajo.
create temporary table pg_temp.house_prompt_probe as
select day_index, round_id, house_prompt, period_key
from public.get_club_round_state('00000000-0000-4000-8000-000000000204');
reset role;
do $$
declare v_day int; v_round uuid; v_house text; v_period text;
begin
  select day_index, round_id, house_prompt, period_key
    into v_day, v_round, v_house, v_period
  from pg_temp.house_prompt_probe;
  if v_round is null and v_day >= 3 then
    perform pg_temp.assert_true(
      v_house = private.house_prompt('00000000-0000-4000-8000-000000000204', v_period),
      'house_prompt trae la consigna de la casa cuando toca (día >= 3, sin ronda)');
  else
    perform pg_temp.assert_true(
      v_house is null,
      'house_prompt es null fuera de la ventana de la casa (día < 3, sin ronda todavía)');
  end if;
end $$;
drop table pg_temp.house_prompt_probe;

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

-- Limpieza NECESARIA, no por si acaso: el claim SÍ sigue fijado en este
-- punto. Los bloques `do $$` de arriba llaman a set_config(..., true) con el
-- tercer argumento en true -- transaccional, no local a la sentencia --, así
-- que el último valor que fijaron sobrevive al bloque y seguiría activo hasta
-- el rollback si no se limpia aquí explícitamente.
select set_config('request.jwt.claims', '', true);

rollback;
