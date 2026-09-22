-- Limpieza ÚNICA de los posts cuya fuente ya se borró antes de que existiera
-- private.cleanup_source_posts (20260922120000). Misma regla que el trigger:
-- un post con fuente muere con ella. Recuento medido antes de aplicar (dev y
-- prod) en la PR; spec 2026-09-22-posts-limpieza-al-borrar-pase-design.md §4.3.
-- posts_cleanup_social_target se lleva el hilo de cada post borrado.
delete from public.posts p
where p.source_kind = 'pass'
  and not exists (select 1 from public.passes s where s.id = p.source_id);

delete from public.posts p
where p.source_kind = 'progress_session'
  and not exists (select 1 from public.progress_sessions s where s.id = p.source_id);

delete from public.posts p
where p.source_kind = 'episode_watch'
  and not exists (select 1 from public.episode_watches s where s.id = p.source_id);
