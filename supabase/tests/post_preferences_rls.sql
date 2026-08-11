-- Regression matrix for Fase «Post»: table `post_preferences` (ajustes de
-- auto-publicación por usuario, self-only). Run against biblioshare-dev only.
-- Every write is rolled back. No hay targets de interacción ni visibilidad por
-- follow aquí: cada quien ve y escribe SOLO su propia fila.
begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion_failed: %', p_message;
  end if;
end;
$function$;

-- Alice (dueña) y Carol (tercero, solo para las aserciones negativas). La FK de
-- post_preferences apunta a auth.users, no a profiles -> no hacen falta perfiles.
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000004a1', 'authenticated', 'authenticated', 'postprefs-alice@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000004c3', 'authenticated', 'authenticated', 'postprefs-carol@example.test', now(), now());

-- === Aserción 1: la dueña inserta nombrando solo user_id -> aplican los defaults
-- (opt-out): finished ON, started y dropped OFF. Esta es la semántica que el
-- lector asume para «sin fila». ===
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.post_preferences (user_id) values ('00000000-0000-4000-8000-0000000004a1');
select pg_temp.assert_true(
  exists (
    select 1 from public.post_preferences
    where user_id = '00000000-0000-4000-8000-0000000004a1'
      and autopost_finished is true
      and autopost_started is false
      and autopost_dropped is false
  ),
  'la duena inserta y lee su fila; los defaults son finished ON, started/dropped OFF'
);

-- === Aserción 2: la dueña actualiza sus 3 columnas de auto-publicación ===
update public.post_preferences
  set autopost_finished = false, autopost_started = true
  where user_id = '00000000-0000-4000-8000-0000000004a1';
select pg_temp.assert_true(
  (select autopost_finished from public.post_preferences where user_id = '00000000-0000-4000-8000-0000000004a1') is false
  and (select autopost_started from public.post_preferences where user_id = '00000000-0000-4000-8000-0000000004a1') is true,
  'la duena actualiza su propia fila (finished OFF, started ON)'
);
reset role;

-- === Aserción 3: un tercero NO ve la fila de otro (RLS filtra el SELECT) ===
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004c3","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(
  not exists (select 1 from public.post_preferences where user_id = '00000000-0000-4000-8000-0000000004a1'),
  'un tercero no ve la fila de preferencias de otra persona (RLS SELECT own)'
);

-- === Aserción 4: un tercero NO puede actualizar la fila de otro (RLS filtra por
-- USING: 0 filas afectadas, sin excepción). Se verifica el valor tras `reset
-- role` como rol de conexión (dueño de la tabla, RLS no forzada) porque Carol no
-- tiene visibilidad de la fila. ===
update public.post_preferences set autopost_finished = true
  where user_id = '00000000-0000-4000-8000-0000000004a1';

-- === Aserción 5: un tercero NO puede insertar una fila a nombre de otro (la
-- WITH CHECK de "post_prefs upsert own" la rechaza -> 42501). El subbloque
-- captura la excepción esperada; si el insert cuela, el RAISE aborta la prueba. ===
do $$
begin
  begin
    insert into public.post_preferences (user_id, autopost_finished)
      values ('00000000-0000-4000-8000-0000000004a1', true);
    raise exception 'assertion_failed: un tercero pudo insertar una fila a nombre de otro (WITH CHECK no filtró)';
  exception
    when insufficient_privilege then null;  -- 42501: RLS WITH CHECK, esperado
  end;
end$$;
reset role;

-- Verificación de la aserción 4: la fila de Alice sigue como ella la dejó
-- (finished OFF), el UPDATE de Carol no tocó nada.
select pg_temp.assert_true(
  (select autopost_finished from public.post_preferences where user_id = '00000000-0000-4000-8000-0000000004a1') is false,
  'el UPDATE de un tercero no altera la fila de otro (RLS filtra la fila, 0 afectadas)'
);

select 'ALL ASSERTIONS PASSED' as result;

rollback;
