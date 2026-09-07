-- R4a: concesión derivada, funciones de escritura y sus grants. Requiere SET ROLE.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'assertion_failed: %', message; end if; end; $$;

-- Usuarios A (con actividad) y B (sin nada)
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('20260908-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'adv-sql-a@example.test', now(), now()),
  ('20260908-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'adv-sql-b@example.test', now(), now());
insert into public.profiles (user_id, username, is_public, role) values
  ('20260908-0000-4000-8000-00000000000a', 'adv_sql_a', true, 'user'),
  ('20260908-0000-4000-8000-00000000000b', 'adv_sql_b', true, 'user');
insert into public.pet_state (user_id, name, class) values ('20260908-0000-4000-8000-00000000000a', 'Nuez', 'wizard');

-- Actividad de A: hoy, hoy-6 (entra), hoy-7 (fuera de ventana). Un pase basta como ancla de sesión.
-- Se usa el primer libro y un pase propio para no depender de fixtures.
insert into public.passes (id, user_id, item_type, item_id, is_active)
select '20260908-0000-4000-8000-0000000000aa', '20260908-0000-4000-8000-00000000000a', 'book', b.id, true
from public.books b order by b.created_at limit 1;
insert into public.progress_sessions (user_id, pass_id, duration_minutes, session_date, position)
select '20260908-0000-4000-8000-00000000000a', '20260908-0000-4000-8000-0000000000aa', 20, d, '{}'::jsonb
from unnest(array[
  (timezone('Europe/Madrid', now()))::date,
  (timezone('Europe/Madrid', now()))::date - 6,
  (timezone('Europe/Madrid', now()))::date - 7
]) as d;

-- Grants
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.get_pet_adventure_days()', 'execute')
  and has_function_privilege('authenticated', 'public.get_pet_adventure_days()', 'execute'),
  'wrapper de concesión: authenticated sí, anon no');
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.start_pet_adventure(uuid,text,uuid,text,text,text,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.start_pet_adventure(uuid,text,uuid,text,text,text,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.start_pet_adventure(uuid,text,uuid,text,text,text,jsonb)', 'execute'),
  'start_pet_adventure: solo service_role');
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.resolve_pet_adventure(uuid,uuid,jsonb,jsonb,text,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.resolve_pet_adventure(uuid,uuid,jsonb,jsonb,text,jsonb)', 'execute'),
  'resolve_pet_adventure: solo service_role');
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'private.pet_pending_adventure_days(uuid)', 'execute'),
  'la concesión pura no es llamable por authenticated');

-- Concesión como A: dos días (hoy y hoy-6), no hoy-7
select set_config('request.jwt.claims', '{"sub":"20260908-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 2 from public.get_pet_adventure_days()), 'ventana: hoy y hoy-6 entran, hoy-7 no');
select pg_temp.assert_true((select min(day) = (timezone('Europe/Madrid', now()))::date - 6 from public.get_pet_adventure_days()), 'el más antiguo es hoy-6');
select pg_temp.assert_true((select count(*) = 0 from private.pet_adventure_days('20260908-0000-4000-8000-00000000000b')), 'identidad ajena: cero filas');
reset role;

-- Como postgres: la función pura sí ve los dos días pendientes de A (sin guarda de identidad)
select pg_temp.assert_true((select count(*) = 2 from private.pet_pending_adventure_days('20260908-0000-4000-8000-00000000000a')), 'la función pura sí ve los dos días de A');

-- Como B (sin actividad): nada pendiente, y tampoco puede leer los días pendientes de A
select set_config('request.jwt.claims', '{"sub":"20260908-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.get_pet_adventure_days()), 'sin actividad no hay aventura');
select pg_temp.assert_true((select count(*) = 0 from private.pet_adventure_days('20260908-0000-4000-8000-00000000000a')), 'identidad ajena: B no lee los días pendientes de A');
reset role;

-- Escritura (como postgres, que es quien tiene service_role de facto en el test)
create temp table adv as
select * from public.start_pet_adventure('20260908-0000-4000-8000-00000000000a', repeat('1', 32),
  '20260908-0000-4000-8000-000000000101', 'brote,caparazon,brote', 'r4.1', repeat('a', 64), '{"name":"Nuez","petClass":"wizard","stage":"young","attributes":{"FUE":0,"CON":0,"INT":0,"SAB":0,"CAR":0,"DES":0},"tier":1,"hpMax":110,"atk":10}'::jsonb);
select pg_temp.assert_true((select count(*) = 1 and min(attempt) = 1 and min(adventure_day) = (timezone('Europe/Madrid', now()))::date - 6 from adv), 'start consume el día pendiente más antiguo como intento 1');
-- Segundo start con otro seed/intent: devuelve el MISMO abierto y no consume otro día
select pg_temp.assert_true((select intent_id = '20260908-0000-4000-8000-000000000101' from public.start_pet_adventure('20260908-0000-4000-8000-00000000000a', repeat('2', 32), '20260908-0000-4000-8000-000000000102', 'brote', 'r4.1', repeat('a', 64), '{}'::jsonb)), 'un intento abierto se devuelve; nunca se abre otro');
select pg_temp.assert_true((select count(*) = 1 from public.pet_battles where user_id = '20260908-0000-4000-8000-00000000000a' and kind = 'adventure'), 'sigue habiendo una fila');
-- Pendientes ya solo hoy
select set_config('request.jwt.claims', '{"sub":"20260908-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 1 and min(day) = (timezone('Europe/Madrid', now()))::date from public.get_pet_adventure_days()), 'el día con fila deja de estar pendiente');
reset role;
-- Derrota → el siguiente start es el intento 2 del mismo día
select pg_temp.assert_true((select status = 'resolved' and reward is null from public.resolve_pet_adventure('20260908-0000-4000-8000-00000000000a', '20260908-0000-4000-8000-000000000101', '[]'::jsonb, '{"outcome":"lose","reason":"ko","fight":1}'::jsonb, repeat('b', 64), '[]'::jsonb)), 'resolver una derrota no da botín');
select pg_temp.assert_true((select attempt = 2 and adventure_day = (timezone('Europe/Madrid', now()))::date - 6 from public.start_pet_adventure('20260908-0000-4000-8000-00000000000a', repeat('3', 32), '20260908-0000-4000-8000-000000000103', 'brote', 'r4.1', repeat('a', 64), '{}'::jsonb)), 'tras perder, el mismo día se reintenta como intento 2 antes de consumir otro día');
-- Victoria con lista de botín vacía: se rechaza, el intento sigue abierto
do $$ begin
  perform public.resolve_pet_adventure('20260908-0000-4000-8000-00000000000a', '20260908-0000-4000-8000-000000000103', '[]'::jsonb, '{"outcome":"win","reason":"ko","fight":3}'::jsonb, repeat('9', 64), '[]'::jsonb);
  raise exception 'assertion_failed: una victoria con lista de botín vacía debería rechazarse';
exception when others then
  if sqlerrm <> 'EMPTY_REWARD_ORDER' then raise; end if;
end $$;
select pg_temp.assert_true((select status = 'open' from public.pet_battles where intent_id = '20260908-0000-4000-8000-000000000103'), 'el intento sigue abierto tras rechazar la victoria sin botín');
-- Victoria con permutación: primer no poseído
select pg_temp.assert_true((select reward->>'itemId' = 'heavy_ink_quill' from public.resolve_pet_adventure('20260908-0000-4000-8000-00000000000a', '20260908-0000-4000-8000-000000000103', '[]'::jsonb, '{"outcome":"win","reason":"ko","fight":3}'::jsonb, repeat('c', 64), '[{"itemId":"heavy_ink_quill","slot":"weapon"},{"itemId":"loan_pendant","slot":"amulet"}]'::jsonb)), 'la victoria entrega el primer objeto de la lista');
-- Resolver otra vez: devuelve la guardada sin cambiarla
select pg_temp.assert_true((select digest = repeat('c', 64) and reward->>'itemId' = 'heavy_ink_quill' from public.resolve_pet_adventure('20260908-0000-4000-8000-00000000000a', '20260908-0000-4000-8000-000000000103', '[{"seq":0}]'::jsonb, '{"outcome":"lose"}'::jsonb, repeat('d', 64), '[]'::jsonb)), 'un resultado guardado gana sobre el reintento');
-- Tercer start: el día ganado no se reabre; consume hoy
select pg_temp.assert_true((select adventure_day = (timezone('Europe/Madrid', now()))::date and attempt = 1 from public.start_pet_adventure('20260908-0000-4000-8000-00000000000a', repeat('4', 32), '20260908-0000-4000-8000-000000000104', 'brote', 'r4.1', repeat('a', 64), '{}'::jsonb)), 'un día ganado no se reabre; se consume el siguiente pendiente');
-- Victoria de hoy: ya se posee heavy_ink_quill → salta al siguiente de la permutación
select pg_temp.assert_true((select reward->>'itemId' = 'loan_pendant' from public.resolve_pet_adventure('20260908-0000-4000-8000-00000000000a', '20260908-0000-4000-8000-000000000104', '[]'::jsonb, '{"outcome":"win","reason":"ko","fight":3}'::jsonb, repeat('e', 64), '[{"itemId":"heavy_ink_quill","slot":"weapon"},{"itemId":"loan_pendant","slot":"amulet"}]'::jsonb)), 'prefiere el primer objeto no poseído');
-- Sin pendientes: cero filas
select pg_temp.assert_true((select count(*) = 0 from public.start_pet_adventure('20260908-0000-4000-8000-00000000000a', repeat('5', 32), '20260908-0000-4000-8000-000000000105', 'brote', 'r4.1', repeat('a', 64), '{}'::jsonb)), 'sin días pendientes no se abre nada');
-- CHECK de forma
do $$ begin
  insert into public.pet_battles (user_id, intent_id, kind, enemy_id, ruleset_version, content_hash, seed, snapshot, attempt)
  values ('20260908-0000-4000-8000-00000000000a', gen_random_uuid(), 'training', 'brote', 'r4.1', repeat('a', 64), repeat('9', 32), '{}'::jsonb, 1);
  raise exception 'assertion_failed: training con attempt debería violar el CHECK';
exception when check_violation then null; end $$;
-- Índice de una victoria por día
do $$ begin
  insert into public.pet_battles (user_id, intent_id, kind, enemy_id, ruleset_version, content_hash, seed, snapshot, status, inputs, result, digest, resolved_at, adventure_day, attempt)
  values ('20260908-0000-4000-8000-00000000000a', gen_random_uuid(), 'adventure', 'brote', 'r4.1', repeat('a', 64), repeat('8', 32), '{}'::jsonb, 'resolved', '[]'::jsonb, '{"outcome":"win"}'::jsonb, repeat('f', 64), now(), (timezone('Europe/Madrid', now()))::date, 9);
  raise exception 'assertion_failed: segunda victoria del mismo día debería violar el índice';
exception when unique_violation then null; end $$;
rollback;
