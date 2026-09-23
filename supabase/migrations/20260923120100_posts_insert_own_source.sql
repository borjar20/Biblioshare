-- #1188. `posts insert own` solo exigía auth.uid() = author_id, y
-- source_kind/source_id los escribe el cliente: cualquiera que viera el id de un
-- pase ajeno (perfil público) podía colgar un post SUYO de él. Eso ocupaba
-- unique(source_kind, source_id, kind), el hito del dueño fallaba con 23505 (que
-- maybeAutopostMilestone se traga) y el post plantado sobrevivía al borrado del
-- pase. Reproducido en dev el 2026-09-23; 0 casos en prod.
--
-- Ahora, si hay fuente, tiene que ser del autor. Subconsultas INVOKER, sin
-- función security definer: pasan por la RLS de quien inserta (el dueño siempre
-- ve sus fuentes) y no se convierten en un oráculo de «¿el pase X es de Y?».
-- source_id con source_kind nulo o sin rama → rechazado. service_role ignora RLS.
-- Spec 2026-09-23-posts-hitos-coherentes-design.md.
alter policy "posts insert own" on public.posts
  with check (
    (select auth.uid()) = author_id
    and (
      source_id is null
      or (source_kind = 'pass'
          and exists (select 1 from public.passes s where s.id = source_id and s.user_id = author_id))
      or (source_kind = 'progress_session'
          and exists (select 1 from public.progress_sessions s where s.id = source_id and s.user_id = author_id))
      or (source_kind = 'episode_watch'
          and exists (select 1 from public.episode_watches s where s.id = source_id and s.user_id = author_id))
    )
  );
