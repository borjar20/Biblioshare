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

rollback;
