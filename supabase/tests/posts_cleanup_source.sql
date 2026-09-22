-- Regresión de `private.cleanup_source_posts` (migración
-- 20260922120000_posts_cleanup_on_source_delete.sql). Ver la spec
-- docs/superpowers/specs/2026-09-22-posts-limpieza-al-borrar-pase-design.md y
-- docs/requirements/data-model.md §5.1 ("Un post con fuente muere con ella").
-- Disposable/local o dev only: filas sintéticas, rollback incluso si pasa.
-- Ejecutar con psql -v ON_ERROR_STOP=1.
begin;
do $test$
declare
  a uuid := gen_random_uuid();  -- autor cuyo pase/sesión/episodio se borra
  b uuid := gen_random_uuid();  -- tercero: su post cuelga de la fuente de A
  book_id uuid := gen_random_uuid();
  series_id uuid := gen_random_uuid();
  pass_id uuid := gen_random_uuid();
  session_id uuid := gen_random_uuid();
  episode_watch_id uuid := gen_random_uuid();
  started_post uuid := gen_random_uuid();
  finished_post uuid := gen_random_uuid();
  progressed_post uuid := gen_random_uuid();
  watched_post uuid := gen_random_uuid();
  b_post_on_pass uuid := gen_random_uuid();
  thought_post uuid := gen_random_uuid();
  comment_id uuid := gen_random_uuid();
  started_target uuid;
begin
  insert into auth.users(id) values (a), (b);
  insert into public.profiles(user_id, username) values
    (a, 'cleanup_a_' || left(replace(a::text, '-', ''), 10)),
    (b, 'cleanup_b_' || left(replace(b::text, '-', ''), 10));
  insert into public.books(id, title) values (book_id, '[TEST] cleanup book');
  insert into public.series(id, title) values (series_id, '[TEST] cleanup series');

  insert into public.passes(id, user_id, item_type, item_id, is_active)
    values (pass_id, a, 'book', book_id, true);
  insert into public.progress_sessions(id, user_id, pass_id) values (session_id, a, pass_id);
  insert into public.episode_watches(id, user_id, series_id, season_number, episode_number)
    values (episode_watch_id, a, series_id, 1, 1);

  insert into public.posts(id, author_id, kind, anchor_type, anchor_id, source_kind, source_id)
    values
      (started_post, a, 'started', 'book', book_id, 'pass', pass_id),
      (finished_post, a, 'finished', 'book', book_id, 'pass', pass_id),
      (progressed_post, a, 'progressed', 'book', book_id, 'progress_session', session_id),
      (watched_post, a, 'watched', 'series', series_id, 'episode_watch', episode_watch_id),
      -- Tercero: no puede repetir kind 'finished' contra el mismo pase (índice
      -- único (source_kind, source_id, kind)), así que prueba el filtro
      -- author_id con 'dropped' -- SOLO se filtra por autor, no por dueño de
      -- la fuente.
      (b_post_on_pass, b, 'dropped', 'book', book_id, 'pass', pass_id);
  -- `thought`: sin fuente, no le afecta nada de esto.
  insert into public.posts(id, author_id, kind, anchor_type, anchor_id)
    values (thought_post, a, 'thought', 'book', book_id);

  select id into started_target from public.interaction_targets
    where kind = 'post' and source_id = started_post;
  if started_target is null then
    raise exception 'invalid fixture: no interaction_target for started_post';
  end if;
  insert into public.comments(id, author_id, interaction_target_id, body)
    values (comment_id, b, started_target, '[TEST] comment');

  -- Borrar el pase: el trigger de fila borra directamente sus posts 'pass'
  -- (started/finished) del MISMO autor, y en cascada (progress_sessions FK on
  -- delete cascade) se lleva la sesión, cuyo propio trigger borra el
  -- 'progressed'.
  delete from public.passes where id = pass_id;

  if exists (select 1 from public.posts where id = started_post) then
    raise exception 'FAIL: el post started sobrevivió al borrado del pase';
  end if;
  if exists (select 1 from public.posts where id = finished_post) then
    raise exception 'FAIL: el post finished sobrevivió al borrado del pase';
  end if;
  if exists (select 1 from public.progress_sessions where id = session_id) then
    raise exception 'FAIL fixture: la sesión no cascadeó con el pase';
  end if;
  if exists (select 1 from public.posts where id = progressed_post) then
    raise exception 'FAIL: el post progressed sobrevivió a la cascada pase -> sesión';
  end if;
  if not exists (select 1 from public.posts where id = b_post_on_pass) then
    raise exception 'FAIL: el post ajeno (autor B) sobre el pase de A no debía borrarse';
  end if;
  if not exists (select 1 from public.posts where id = thought_post) then
    raise exception 'FAIL: un thought (sin fuente) no debía verse afectado';
  end if;

  -- El post borrado se lleva su hilo: interaction_target e hijos (comentario)
  -- por FK on delete cascade desde `posts_cleanup_social_target`.
  if exists (select 1 from public.interaction_targets where id = started_target) then
    raise exception 'FAIL: el interaction_target del post borrado sobrevivió';
  end if;
  if exists (select 1 from public.comments where id = comment_id) then
    raise exception 'FAIL: el comentario del post borrado sobrevivió';
  end if;

  -- Caso nuevo: borrar un episode_watch se lleva su post 'watched'.
  delete from public.episode_watches where id = episode_watch_id;
  if exists (select 1 from public.posts where id = watched_post) then
    raise exception 'FAIL: el post watched sobrevivió al borrado del episode_watch';
  end if;
end $test$;
rollback;
