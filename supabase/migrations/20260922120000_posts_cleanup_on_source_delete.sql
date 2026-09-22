-- Un post de hito es una afirmación sobre su fuente (pase, sesión, visionado de
-- episodio). Si la fuente se borra, la afirmación es falsa: el post se va con
-- ella, con su hilo (posts_cleanup_social_target se lleva target, comentarios,
-- reacciones y avisos). Revisa la regla de la spec de posts 2026-08-09 §5
-- («borrar la fuente no cascadea»); ver decisiones.md 2026-09-22 y la spec
-- 2026-09-22-posts-limpieza-al-borrar-pase-design.md.
--
-- `author_id = old.user_id` es defensa: source_kind/source_id los escribe el
-- cliente al insertar, así que alguien puede colgar un post suyo de un pase
-- AJENO. Sin el filtro, borrar tu pase borraría el post de un tercero.
--
-- Los triggers de fila también saltan en las cascadas: borrar un pase borra sus
-- progress_sessions (FK on delete cascade) y con ellas sus posts `progressed`.
create or replace function private.cleanup_source_posts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from public.posts p
  where p.source_kind = tg_argv[0]::public.post_source_kind
    and p.source_id = old.id
    and p.author_id = old.user_id;
  return old;
end;
$function$;

revoke execute on function private.cleanup_source_posts() from public, anon, authenticated;

create trigger passes_cleanup_source_posts
  after delete on public.passes
  for each row execute function private.cleanup_source_posts('pass');

create trigger progress_sessions_cleanup_source_posts
  after delete on public.progress_sessions
  for each row execute function private.cleanup_source_posts('progress_session');

create trigger episode_watches_cleanup_source_posts
  after delete on public.episode_watches
  for each row execute function private.cleanup_source_posts('episode_watch');
