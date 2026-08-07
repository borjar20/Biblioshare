-- Regression matrix for Fase 2 «Pensamiento»: table `thoughts` + the `thought`
-- class of `interaction_targets`. Run against biblioshare-dev only. Every
-- write is rolled back.
begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion_failed: %', p_message;
  end if;
end;
$function$;

-- Alice publica el pensamiento. Bob es un seguidor ACEPTADO. Carol no sigue a
-- nadie: existe solo para la aserción negativa de visibilidad.
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000002a1', 'authenticated', 'authenticated', 'thoughts-alice@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000002b2', 'authenticated', 'authenticated', 'thoughts-bob@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000002c3', 'authenticated', 'authenticated', 'thoughts-carol@example.test', now(), now());
insert into public.profiles (user_id, username, display_name, is_public, role) values
  ('00000000-0000-4000-8000-0000000002a1', 'thoughts_alice', 'Alice', false, 'user'),
  ('00000000-0000-4000-8000-0000000002b2', 'thoughts_bob', 'Bob', false, 'user'),
  ('00000000-0000-4000-8000-0000000002c3', 'thoughts_carol', 'Carol', false, 'user');
insert into public.books (id, title, author) values
  ('00000000-0000-4000-8000-000000000201', 'Thoughts RLS book', 'Test author');
insert into public.follows (follower_id, followee_id, status) values
  ('00000000-0000-4000-8000-0000000002b2', '00000000-0000-4000-8000-0000000002a1', 'accepted');

-- Dana: admin global, solo para las aserciones de borrado por moderación
-- (issue #525 / task-delete). No sigue a nadie -- no lo necesita, admin ve y
-- borra por `has_min_role('admin')`, no por visibilidad de seguidor.
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000002d4', 'authenticated', 'authenticated', 'thoughts-dana@example.test', now(), now());
insert into public.profiles (user_id, username, display_name, is_public, role) values
  ('00000000-0000-4000-8000-0000000002d4', 'thoughts_dana', 'Dana', false, 'admin');

-- Alice inserta su propio pensamiento anclado al libro de fixture. `id` NO se
-- nombra en el INSERT: no tiene grant (columna generada, #375) y nombrarla
-- explícitamente, aunque fuese con el valor que pondría el default, dispara
-- 42501 igual que si faltase el grant de una columna real.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.thoughts (user_id, anchor_type, anchor_id, body, is_spoiler) values
  ('00000000-0000-4000-8000-0000000002a1', 'book',
   '00000000-0000-4000-8000-000000000201', 'Un pensamiento de prueba sobre Rayuela', false);
select pg_temp.assert_true(
  exists (select 1 from public.thoughts where user_id = '00000000-0000-4000-8000-0000000002a1'),
  'la dueña ve/inserta su propio pensamiento'
);
reset role;

-- Guarda los ids generados (thought + su target canónico) para no depender de
-- lookups posteriores una vez el thought se borre al final.
create temp table thoughts_rls_ids as
select th.id as thought_id, t.id as target_id
  from public.thoughts th
  join public.interaction_targets t on t.kind = 'thought' and t.source_id = th.id
 where th.user_id = '00000000-0000-4000-8000-0000000002a1';
-- El propietario de la tabla temporal es el rol de conexión, no `authenticated`
-- (a quien se le impersona vía set local role): sin este grant explícito, los
-- bloques que corren como Bob/Carol no podrían ni leer los ids de fixture.
grant select on thoughts_rls_ids to authenticated;

-- El resolutor materializó el target canónico con la forma esperada.
select pg_temp.assert_true(
  exists (
    select 1 from public.interaction_targets t
    join thoughts_rls_ids ids on ids.target_id = t.id
    where t.owner_id = '00000000-0000-4000-8000-0000000002a1'
      and t.audience_kind = 'profile' and t.audience_id = '00000000-0000-4000-8000-0000000002a1'
      and t.href = '/libro/00000000-0000-4000-8000-000000000201'
      and t.commentable and t.reactable
      and t.comment_notification_type = 'thought_commented'
      and t.reaction_notification_type = 'thought_liked'
  ),
  'el trigger resolutor materializa el target thought con la forma esperada'
);

-- Un tercero que Alice no sigue y que no le sigue tampoco: perfil privado,
-- sin relación de follow -> no ve el pensamiento ni su target canónico.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000002c3","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(
  not exists (select 1 from public.thoughts where user_id = '00000000-0000-4000-8000-0000000002a1'),
  'un tercero que no sigue a la dueña no ve su pensamiento (perfil privado)'
);
select pg_temp.assert_true(
  not public.can_view_interaction_target((select target_id from thoughts_rls_ids)),
  'un tercero que no sigue a la dueña tampoco ve el target canónico del pensamiento'
);
reset role;

-- Bob sigue a Alice con status 'accepted': sí lo ve.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000002b2","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(
  exists (select 1 from public.thoughts where user_id = '00000000-0000-4000-8000-0000000002a1'),
  'un seguidor aceptado ve el pensamiento'
);
select pg_temp.assert_true(
  public.can_view_interaction_target((select target_id from thoughts_rls_ids)),
  'un seguidor aceptado ve el target canónico del pensamiento'
);
-- Y hereda el hilo estándar: puede comentar aportando solo el id canónico.
insert into public.comments (id, interaction_target_id, author_id, body) values
  ('00000000-0000-4000-8000-000000000203', (select target_id from thoughts_rls_ids),
   '00000000-0000-4000-8000-0000000002b2', 'Comentario de un seguidor');
select pg_temp.assert_true(
  exists (select 1 from public.comments where id = '00000000-0000-4000-8000-000000000203'),
  'un seguidor aceptado puede comentar el pensamiento por la vía canónica'
);
-- Bob no puede tocar un pensamiento ajeno: la policy de UPDATE filtra la fila
-- por USING (no lanza excepción, simplemente no hay fila que actualizar).
update public.thoughts set body = 'Secuestro de pensamiento ajeno'
  where user_id = '00000000-0000-4000-8000-0000000002a1';
select pg_temp.assert_true(
  (select body from public.thoughts where user_id = '00000000-0000-4000-8000-0000000002a1') = 'Un pensamiento de prueba sobre Rayuela',
  'un no-dueño no puede actualizar el pensamiento de otra persona (RLS filtra la fila)'
);
reset role;

-- Borrado: dueña, no-dueña-no-admin y admin global (task-delete, #525).
-- Segundo pensamiento de Alice dedicado a esto, para no interferir con el
-- primero (que la cascada de más abajo necesita intacto hasta el final).
-- `id` NO se nombra en el INSERT (mismo motivo que el primer pensamiento,
-- arriba): se recupera después por `body`, que es único en este fixture.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.thoughts (user_id, anchor_type, anchor_id, body, is_spoiler) values
  ('00000000-0000-4000-8000-0000000002a1', 'book',
   '00000000-0000-4000-8000-000000000201', 'Segundo pensamiento, para las pruebas de borrado', false);
reset role;

create temp table thoughts_rls_ids2 as
select id as thought_id from public.thoughts
 where body = 'Segundo pensamiento, para las pruebas de borrado';
grant select on thoughts_rls_ids2 to authenticated;

-- Carol: ni dueña ni admin. La policy USING filtra la fila -> el DELETE
-- afecta 0 filas, sin excepción; el pensamiento sigue ahí. La comprobación
-- usa `social_target_owner_id` (SECURITY DEFINER) en vez de un `exists`
-- normal: Carol no tiene visibilidad de la fila por RLS (no sigue a Alice),
-- así que un `exists` bajo su propio rol daría igual con o sin borrado --
-- necesita una vía que no dependa de la policy de SELECT. La aserción corre
-- ANTES de `reset role`, dentro del mismo turno de Carol.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000002c3","role":"authenticated"}', true);
set local role authenticated;
delete from public.thoughts where id = (select thought_id from thoughts_rls_ids2);
select pg_temp.assert_true(
  private.social_target_owner_id('thought', (select thought_id from thoughts_rls_ids2)) is not null,
  'una no-dueña sin rol admin no puede borrar el pensamiento de otra persona (0 filas afectadas)'
);
reset role;

-- Dana: admin global. can_moderate_target -> has_min_role('admin') = true,
-- sin pasar por la rama de dueño/club. Borra el pensamiento ajeno.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000002d4","role":"authenticated"}', true);
set local role authenticated;
delete from public.thoughts where id = (select thought_id from thoughts_rls_ids2);
select pg_temp.assert_true(
  not exists (select 1 from public.thoughts where id = (select thought_id from thoughts_rls_ids2)),
  'un admin global puede borrar el pensamiento de otra persona'
);
reset role;

-- Cascada de borrado: al borrar el pensamiento desaparecen su target,
-- comentario y notificaciones asociadas (mismo contrato que el resto de
-- fuentes autorales).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated"}', true);
set local role authenticated;
delete from public.thoughts where user_id = '00000000-0000-4000-8000-0000000002a1';
reset role;
select pg_temp.assert_true(
  not exists (select 1 from public.interaction_targets t join thoughts_rls_ids ids on ids.target_id = t.id),
  'borrar el pensamiento borra su target canónico'
);
select pg_temp.assert_true(
  not exists (select 1 from public.comments where id = '00000000-0000-4000-8000-000000000203'),
  'la cascada del target se lleva por delante el comentario heredado'
);

rollback;
