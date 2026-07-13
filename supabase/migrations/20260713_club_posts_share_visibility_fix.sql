-- EPIC-05 Bloque F — fix: is_visible_via_club_share() solo cubría
-- diary_entries/episode_watches, pero activity_share puede compartir
-- CUALQUIER FeedEvent (Bloque C: también library_entries/progress_sessions,
-- "altas de biblioteca" per el spec de diseño). Sin este fix, compartir un
-- alta de biblioteca o una sesión de progreso desde un perfil privado fallaba
-- en silencio para compañeros de club que no siguen al que comparte (RLS
-- deniega, resolveSharedActivity devuelve null, el post muestra "ya no
-- disponible") -- fail-closed, no una fuga de datos, pero la mitad del
-- alcance prometido por la decisión de diseño quedaba sin implementar.
-- Encontrado en la revisión final de rama completa, no por la propia batería
-- de la Task 1 (que solo probó diary_entry/episode_watch).

-- Las políticas de diary_entries/episode_watches dependen de la firma vieja
-- de la función (postgres rechaza el DROP FUNCTION si algo la referencia
-- todavía, 2BP01) -- hay que soltarlas primero. Se recrean más abajo ya
-- apuntando a la firma nueva.
drop policy "diary entries select visible" on public.diary_entries;
drop policy "episode_watches select visible" on public.episode_watches;

-- La función original acoplaba p_target_type a target_kind (que no incluye
-- library_entries/progress_sessions -- esas tablas nunca son targets de
-- reacciones/comentarios). Se desacopla a un p_source_table de texto plano,
-- comparado directamente contra ref->>'sourceTable' (mismo valor que
-- FeedEvent.id ya usa) -- más simple y ahora reusable por las 4 tablas.
drop function if exists public.is_visible_via_club_share(public.target_kind, uuid);

create or replace function public.is_visible_via_club_share(p_source_table text, p_row_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_posts cp
    where cp.kind = 'activity_share'
      and cp.ref->>'sourceTable' = p_source_table
      and cp.ref->>'rowId' = p_row_id::text
      and public.is_club_member(cp.club_id)
  );
$$;

comment on function public.is_visible_via_club_share(text, uuid) is 'True si p_row_id de p_source_table fue compartido como activity_share en un club del que el usuario actual es miembro (EPIC-05 Bloque F). p_source_table es el literal de tabla (diary_entries/episode_watches/library_entries/progress_sessions), no target_kind -- desacoplado para cubrir también las dos fuentes de FeedEvent que nunca son target de reacciones/comentarios.';

-- Re-crea diary_entries/episode_watches apuntando a la nueva firma (mismo
-- OR, mismo comportamiento, solo cambia cómo se invoca la función). Ya
-- soltadas arriba.
create policy "diary entries select visible" on public.diary_entries
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('diary_entries', id)
  );

create policy "episode_watches select visible" on public.episode_watches
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('episode_watches', id)
  );

-- Extiende el mismo OR a library_entries/progress_sessions -- el gap real
-- que cierra este fix.
drop policy "library entries select visible" on public.library_entries;
create policy "library entries select visible" on public.library_entries
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('library_entries', id)
  );

drop policy "progress sessions select visible" on public.progress_sessions;
create policy "progress sessions select visible" on public.progress_sessions
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('progress_sessions', id)
  );
