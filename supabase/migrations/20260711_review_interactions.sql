-- EPIC-05 (social), Bloque B — reacciones y comentarios en reseñas (SD-3).
--
-- Dos tablas polimórficas sobre las reseñas ya existentes (diary_entries.review,
-- episode_watches.review) — no se mueven ni se promueven a una tabla `reviews`
-- propia. target_kind solo declara los dos valores reales hoy; club_post/comment
-- (Bloque F/H1) se añadirán con su propia migración cuando existan.

create type public.target_kind as enum ('diary_entry', 'episode_watch');

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  target_type public.target_kind not null,
  target_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'like',
  created_at timestamptz not null default now(),
  unique (target_type, target_id, user_id, kind)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  target_type public.target_kind not null,
  target_id uuid not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_reactions_target on public.reactions (target_type, target_id);
create index idx_comments_target on public.comments (target_type, target_id, created_at);

comment on table public.reactions is 'Reacciones polimórficas de EPIC-05 (SD-3): "me gusta" sobre reseñas (diary_entry/episode_watch). kind abierto a más valores futuros, hoy solo "like".';
comment on table public.comments is 'Comentarios en hilo plano de EPIC-05 (SD-3) sobre reseñas (diary_entry/episode_watch). Sin anidación ni edición en este MVP: solo alta y borrado de lo propio.';

-- Helper SECURITY DEFINER: resuelve el dueño a través del target polimórfico y
-- delega en can_view_profile (SD-2), mismo patrón que is_club_member.
create or replace function public.can_view_target(p_target_type public.target_kind, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case p_target_type
    when 'diary_entry' then exists (
      select 1 from public.diary_entries d where d.id = p_target_id and public.can_view_profile(d.user_id)
    )
    when 'episode_watch' then exists (
      select 1 from public.episode_watches e where e.id = p_target_id and public.can_view_profile(e.user_id)
    )
  end;
$$;

comment on function public.can_view_target(public.target_kind, uuid) is 'True si el usuario actual puede ver el target polimórfico (reseña) indicado, delegando en can_view_profile del dueño (SD-2/SD-3, EPIC-05).';

alter table public.reactions enable row level security;
alter table public.comments enable row level security;

create policy "reactions select visible" on public.reactions
  for select to anon, authenticated
  using (public.can_view_target(target_type, target_id));

create policy "reactions insert own on visible target" on public.reactions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.can_view_target(target_type, target_id)
  );

create policy "reactions delete own" on public.reactions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "comments select visible" on public.comments
  for select to anon, authenticated
  using (public.can_view_target(target_type, target_id));

create policy "comments insert own on visible target" on public.comments
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and public.can_view_target(target_type, target_id)
  );

create policy "comments delete own" on public.comments
  for delete to authenticated
  using ((select auth.uid()) = author_id);

-- Enganche de notificaciones (E5.B4): dos tipos nuevos sobre el enum de Bloque D.
-- Esta migración no inserta ninguna notificación con estos valores (solo DDL),
-- así que la restricción de Postgres de no poder usar un valor de enum recién
-- añadido dentro de la misma transacción que lo crea no aplica aquí.
alter type public.notification_type add value 'review_liked';
alter type public.notification_type add value 'review_commented';
