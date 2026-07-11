-- EPIC-05 (social), Bloque A — grafo de seguidores + visibilidad por seguidor.
--
-- Introduce el grafo social (follows) y generaliza la visibilidad de contenido
-- de perfil de "público u propio" a "público u propio O seguidor aceptado"
-- mediante el helper SECURITY DEFINER can_view_profile() (SD-2 del backlog
-- docs/requirements/social-epic.md). Mismo patrón anti-recursión que el RBAC
-- (has_min_role / current_user_role, §7.35).

-- ── Helper: visibilidad de un perfil sin recursión de RLS ────────────────────
-- profiles.is_public de un perfil AJENO Y PRIVADO no es legible por la RLS de
-- profiles ("public or own"). Las políticas de follows necesitan conocer ese
-- flag (para decidir accepted vs pending y blindar el hueco de privacidad), así
-- que se expone vía SECURITY DEFINER, que bypassa la RLS. Perfil inexistente ->
-- false (tratado como no-público).
create or replace function public.profile_is_public(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select is_public from public.profiles where user_id = target_user_id),
    false
  );
$$;

comment on function public.profile_is_public(uuid) is 'True si el perfil de target_user_id existe y es público. SECURITY DEFINER para poder leer el flag de perfiles privados ajenos desde las políticas RLS de follows (EPIC-05, SD-2).';

-- ── Grafo de seguidores ──────────────────────────────────────────────────────
create type public.follow_status as enum ('pending', 'accepted');

create table public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  status public.follow_status not null default 'accepted',
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- Para "¿quién me sigue?" y contar seguidores por usuario.
create index idx_follows_followee on public.follows (followee_id, status);

comment on table public.follows is 'Grafo social de EPIC-05 (SD-2). Seguir a un perfil público = accepted directo; a uno privado = pending hasta que el followee acepta. La visibilidad de contenido para seguidores aceptados la resuelve can_view_profile().';

alter table public.follows enable row level security;

-- SELECT: las dos partes ven la relación (incl. solicitudes pending). Además,
-- las relaciones ACEPTADAS de un perfil PÚBLICO son legibles por cualquiera
-- (listas de seguidores/seguidos públicas, estilo Letterboxd); las de perfiles
-- privados quedan solo entre las dos partes.
create policy "follows visible to parties or public accepted" on public.follows
  for select to anon, authenticated
  using (
    (select auth.uid()) = follower_id
    or (select auth.uid()) = followee_id
    or (status = 'accepted' and public.profile_is_public(followee_id))
  );

-- INSERT: solo puedes crear follows tuyos, y el status DEBE respetar la regla de
-- auto-accept — accepted solo si el followee es público; pending si es privado.
-- Esto blinda el hueco de privacidad: nadie puede auto-insertarse como seguidor
-- ACEPTADO de un perfil privado (lo que le daría visibilidad vía can_view_profile).
create policy "follows insert own with accept rule" on public.follows
  for insert to authenticated
  with check (
    (select auth.uid()) = follower_id
    and (
      (status = 'accepted' and public.profile_is_public(followee_id))
      or (status = 'pending' and not public.profile_is_public(followee_id))
    )
  );

-- UPDATE: solo el followee cambia el status (aceptar una solicitud pending).
create policy "follows update by followee" on public.follows
  for update to authenticated
  using ((select auth.uid()) = followee_id)
  with check ((select auth.uid()) = followee_id);

-- DELETE: el follower deja de seguir / retira la solicitud; el followee puede
-- rechazar una solicitud o quitar a un seguidor.
create policy "follows delete by parties" on public.follows
  for delete to authenticated
  using (
    (select auth.uid()) = follower_id
    or (select auth.uid()) = followee_id
  );

-- ── Visibilidad de contenido de perfil por seguidor (SD-2) ──────────────────
-- Generaliza "público u propio" a "público u propio O seguidor aceptado".
-- SECURITY DEFINER para bypass de RLS sin recursión, igual que has_min_role.
-- (Cuando llegue E5.J1 se añadirá aquí el corte por user_blocks.)
create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  -- coalesce del primer término: para anon (auth.uid() null) "null = uuid" es
  -- NULL; sin coalesce la función devolvería NULL en vez de false (en USING se
  -- trata como false igualmente, pero devolver un booleano limpio es más seguro).
  select
    coalesce((select auth.uid()) = target_user_id, false)
    or public.profile_is_public(target_user_id)
    or exists (
      select 1 from public.follows f
      where f.follower_id = (select auth.uid())
        and f.followee_id = target_user_id
        and f.status = 'accepted'
    );
$$;

comment on function public.can_view_profile(uuid) is 'True si el usuario actual puede ver el contenido de perfil de target_user_id: es el dueño, el perfil es público, o es seguidor aceptado (SD-2, EPIC-05).';

-- Recablear las 4 políticas SELECT de contenido de perfil para usar el helper.
drop policy "library entries select public or own" on public.library_entries;
create policy "library entries select visible" on public.library_entries
  for select to anon, authenticated
  using (public.can_view_profile(user_id));

drop policy "diary entries select public or own" on public.diary_entries;
create policy "diary entries select visible" on public.diary_entries
  for select to anon, authenticated
  using (public.can_view_profile(user_id));

drop policy "progress sessions select public or own" on public.progress_sessions;
create policy "progress sessions select visible" on public.progress_sessions
  for select to anon, authenticated
  using (public.can_view_profile(user_id));

drop policy "episode_watches select public or own" on public.episode_watches;
create policy "episode_watches select visible" on public.episode_watches
  for select to anon, authenticated
  using (public.can_view_profile(user_id));
