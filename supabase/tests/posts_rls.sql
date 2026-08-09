-- Regression matrix for Fase «Post»: table `posts` + the `post` class of
-- `interaction_targets`. Run against biblioshare-dev only. Every write is
-- rolled back.
begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion_failed: %', p_message;
  end if;
end;
$function$;

-- Alice publica el post (perfil privado). Bob es un seguidor ACEPTADO. Carol no
-- sigue a nadie: existe solo para la aserción negativa de visibilidad. Dana es
-- admin global, solo para las aserciones de borrado por moderación.
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000003a1', 'authenticated', 'authenticated', 'posts-alice@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000003b2', 'authenticated', 'authenticated', 'posts-bob@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000003c3', 'authenticated', 'authenticated', 'posts-carol@example.test', now(), now()),
  ('00000000-0000-4000-8000-0000000003d4', 'authenticated', 'authenticated', 'posts-dana@example.test', now(), now());
insert into public.profiles (user_id, username, display_name, is_public, role) values
  ('00000000-0000-4000-8000-0000000003a1', 'posts_alice', 'Alice', false, 'user'),
  ('00000000-0000-4000-8000-0000000003b2', 'posts_bob', 'Bob', false, 'user'),
  ('00000000-0000-4000-8000-0000000003c3', 'posts_carol', 'Carol', false, 'user'),
  ('00000000-0000-4000-8000-0000000003d4', 'posts_dana', 'Dana', false, 'admin');
insert into public.books (id, title, author) values
  ('00000000-0000-4000-8000-000000000301', 'Posts RLS book', 'Test author');
insert into public.follows (follower_id, followee_id, status) values
  ('00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003a1', 'accepted');

-- === Aserción 1: la dueña inserta y ve; el trigger materializa el target ===
-- `id` NO se nombra en el INSERT: no tiene grant (columna generada, #375) y
-- nombrarla dispara 42501 igual que una columna real sin grant.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.posts (author_id, kind, anchor_type, anchor_id, body, is_spoiler) values
  ('00000000-0000-4000-8000-0000000003a1', 'thought', 'book',
   '00000000-0000-4000-8000-000000000301', 'Un post de prueba sobre Rayuela', false);
select pg_temp.assert_true(
  exists (select 1 from public.posts where author_id = '00000000-0000-4000-8000-0000000003a1'),
  'la duena ve/inserta su propio post'
);
reset role;

-- Guarda los ids generados (post + su target canónico) para no depender de
-- lookups posteriores una vez el post se borre al final.
create temp table posts_rls_ids as
select po.id as post_id, t.id as target_id
  from public.posts po
  join public.interaction_targets t on t.kind = 'post' and t.source_id = po.id
 where po.body = 'Un post de prueba sobre Rayuela';
-- El propietario de la temp table es el rol de conexión, no `authenticated`
-- (impersonado vía set local role): sin este grant, Bob/Carol no leerían los ids.
grant select on posts_rls_ids to authenticated;

-- El resolutor materializó el target canónico con la forma esperada. Diferencia
-- clave con thoughts: href a /post/[id], no a la ficha del ancla.
select pg_temp.assert_true(
  exists (
    select 1 from public.interaction_targets t
    join posts_rls_ids ids on ids.target_id = t.id
    where t.owner_id = '00000000-0000-4000-8000-0000000003a1'
      and t.audience_kind = 'profile' and t.audience_id = '00000000-0000-4000-8000-0000000003a1'
      and t.href = '/post/' || (select post_id from posts_rls_ids)::text
      and t.commentable and t.reactable
      and t.comment_notification_type = 'post_commented'
      and t.reaction_notification_type = 'post_liked'
  ),
  'el trigger resolutor materializa el target post con href /post/[id], commentable y reactable'
);

-- === Aserción 2: un tercero sin follow no ve el post ni su target ===
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003c3","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(
  not exists (select 1 from public.posts where author_id = '00000000-0000-4000-8000-0000000003a1'),
  'un tercero que no sigue a la duena no ve su post (perfil privado)'
);
select pg_temp.assert_true(
  not public.can_view_interaction_target((select target_id from posts_rls_ids)),
  'un tercero que no sigue a la duena tampoco ve el target canónico del post'
);
reset role;

-- === Aserción 3: un seguidor aceptado lo ve y lo comenta por la vía canónica ===
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003b2","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true(
  exists (select 1 from public.posts where author_id = '00000000-0000-4000-8000-0000000003a1'),
  'un seguidor aceptado ve el post'
);
select pg_temp.assert_true(
  public.can_view_interaction_target((select target_id from posts_rls_ids)),
  'un seguidor aceptado ve el target canónico del post'
);
-- Hereda el hilo estándar: comenta aportando solo el id canónico del target.
insert into public.comments (id, interaction_target_id, author_id, body) values
  ('00000000-0000-4000-8000-000000000303', (select target_id from posts_rls_ids),
   '00000000-0000-4000-8000-0000000003b2', 'Comentario de un seguidor sobre el post');
select pg_temp.assert_true(
  exists (select 1 from public.comments where id = '00000000-0000-4000-8000-000000000303'),
  'un seguidor aceptado puede comentar el post por la vía canónica'
);

-- === Aserción 4: un no-dueño no puede modificarlo (RLS filtra la fila, no lanza) ===
-- La policy de UPDATE filtra por USING: 0 filas afectadas, sin excepción.
update public.posts set body = 'Secuestro de post ajeno'
  where author_id = '00000000-0000-4000-8000-0000000003a1';
select pg_temp.assert_true(
  (select body from public.posts where author_id = '00000000-0000-4000-8000-0000000003a1')
    = 'Un post de prueba sobre Rayuela',
  'un no-dueno no puede actualizar el post de otra persona (RLS filtra la fila, no excepción)'
);
reset role;

-- === Borrado por moderación (rama 'post' de social_target_owner_id, Step 3) ===
-- Segundo post de Alice dedicado a esto, para no interferir con el primero (que
-- la cascada del final necesita intacto). `id` NO se nombra (mismo motivo).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.posts (author_id, kind, anchor_type, anchor_id, body, is_spoiler) values
  ('00000000-0000-4000-8000-0000000003a1', 'thought', 'book',
   '00000000-0000-4000-8000-000000000301', 'Segundo post, para las pruebas de borrado', false);
reset role;

create temp table posts_rls_ids2 as
select id as post_id from public.posts
 where body = 'Segundo post, para las pruebas de borrado';
grant select on posts_rls_ids2 to authenticated;

-- Carol: ni dueña ni admin. La policy USING filtra la fila -> DELETE afecta 0
-- filas, sin excepción. Se comprueba con social_target_owner_id (SECURITY
-- DEFINER), que no depende de la visibilidad RLS de Carol.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003c3","role":"authenticated"}', true);
set local role authenticated;
delete from public.posts where id = (select post_id from posts_rls_ids2);
reset role;
select pg_temp.assert_true(
  private.social_target_owner_id('post', (select post_id from posts_rls_ids2)) is not null,
  'una no-duena sin rol admin no puede borrar el post de otra persona (0 filas afectadas)'
);

-- Dana: admin global. can_moderate_target('post', …) -> has_min_role('admin')
-- = true, sin pasar por la rama de dueño. Borra el post ajeno.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003d4","role":"authenticated"}', true);
set local role authenticated;
delete from public.posts where id = (select post_id from posts_rls_ids2);
reset role;
select pg_temp.assert_true(
  private.social_target_owner_id('post', (select post_id from posts_rls_ids2)) is null,
  'un admin global puede borrar el post de otra persona'
);

-- === Aserción 5: borrar el post cascadea target + comentarios; el report se conserva ===
-- El report SOBRE UN POST no es insertable por la vía normal todavía: la capa de
-- reportes (private.prepare_content_report / public.can_view_target) aún no tiene
-- rama 'post' (igual que thoughts). Se siembra la fila directamente con el
-- trigger de preparación desactivado, como rol de conexión (dueño de la tabla,
-- RLS no forzada), para probar SOLO la rama 'post' de cleanup_social_target.
alter table public.content_reports disable trigger trg_content_reports_prepare;
insert into public.content_reports (id, reporter_id, reported_user_id, target_type, target_id, reason, snapshot) values
  ('00000000-0000-4000-8000-000000000305',
   '00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003a1',
   'post', (select post_id from posts_rls_ids), 'spam',
   '{"body":"Un post de prueba sobre Rayuela","kind":"thought"}'::jsonb);
alter table public.content_reports enable trigger trg_content_reports_prepare;

-- Alice borra su primer post: cleanup_social_target('post') borra su target
-- canónico (que cascadea el comentario heredado vía FK) y conserva el report.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
set local role authenticated;
delete from public.posts where author_id = '00000000-0000-4000-8000-0000000003a1';
reset role;

select pg_temp.assert_true(
  not exists (select 1 from public.interaction_targets t join posts_rls_ids ids on ids.target_id = t.id),
  'borrar el post borra su target canónico'
);
select pg_temp.assert_true(
  not exists (select 1 from public.comments where id = '00000000-0000-4000-8000-000000000303'),
  'la cascada del target se lleva por delante el comentario heredado'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.content_reports
    where id = '00000000-0000-4000-8000-000000000305'
      and status = 'actioned'
      and target_deleted_at is not null
      and snapshot ? 'body'
  ),
  'borrar el post conserva el content_report como fila de auditoría (actioned, snapshot intacto)'
);

select 'ALL ASSERTIONS PASSED' as result;

rollback;
