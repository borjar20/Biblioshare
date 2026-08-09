-- Fase «Post»: tabla `posts` + clase 'post' de interaction_targets. Espejo del
-- patrón de thoughts/passes/progress_sessions (fuente autoral personal,
-- audiencia 'profile', trigger AFTER INSERT que materializa el target canónico
-- vía private.upsert_interaction_target). DIFERENCIA CLAVE con thoughts: el post
-- SÍ tiene página propia -> href = '/post/'||id (el pensamiento usaba la ficha
-- del ancla).

create type public.post_kind as enum
  ('started', 'finished', 'dropped', 'progressed', 'watched', 'thought');
create type public.post_anchor_type as enum
  ('book', 'movie', 'series', 'saga', 'person');
create type public.post_source_kind as enum
  ('pass', 'progress_session', 'episode_watch');

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  kind public.post_kind not null,
  anchor_type public.post_anchor_type not null,
  anchor_id uuid not null,           -- polimórfico, sin FK (como thoughts/saga_items)
  source_kind public.post_source_kind,
  source_id uuid,
  body text check (body is null or (char_length(body) <= 2000 and char_length(btrim(body)) > 0)),
  is_spoiler boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- source_kind y source_id van juntos o ninguno
  constraint posts_source_shape check ((source_kind is null) = (source_id is null))
);

-- Idempotencia: 1 post por (acción fuente, kind). Un pase puede tener 'started'
-- y 'finished' (distinto kind), pero no dos 'finished'. Parcial: los post sin
-- fuente (thought, source null) no entran en la unicidad.
create unique index posts_source_kind_uidx
  on public.posts (source_kind, source_id, kind)
  where source_id is not null;

create index posts_author_created_idx on public.posts (author_id, created_at desc, id desc);
create index posts_anchor_idx on public.posts (anchor_type, anchor_id);

alter table public.posts enable row level security;

-- Rama 'post' de social_target_owner_id ANTES de la policy de delete que la
-- consume vía can_moderate_target (mismo patrón que 20260836 para thoughts).
-- La audiencia de un post es 'profile' (sin club) -> can_moderate_target('post', …)
-- = autor OR admin global, que es la regla de borrado pedida.
create or replace function private.social_target_owner_id(p_target_type target_kind, p_target_id uuid)
returns uuid
language sql
stable security definer
set search_path to ''
as $function$
  select case p_target_type
    when 'diary_entry' then (select p.user_id from public.passes p where p.id = p_target_id)
    when 'pass' then (select p.user_id from public.passes p where p.id = p_target_id)
    when 'episode_watch' then (select e.user_id from public.episode_watches e where e.id = p_target_id)
    when 'progress_session' then (select s.user_id from public.progress_sessions s where s.id = p_target_id)
    when 'club_post' then (select cp.author_id from public.club_posts cp where cp.id = p_target_id)
    when 'comment' then (select c.author_id from public.comments c where c.id = p_target_id)
    when 'activity_checkpoint' then (
      select cc.created_by from public.club_activity_checkpoints cc where cc.id = p_target_id
    )
    when 'club_activity' then (
      select ca.created_by from public.club_activities ca where ca.id = p_target_id
    )
    when 'thought' then (select th.user_id from public.thoughts th where th.id = p_target_id)
    when 'post' then (select po.author_id from public.posts po where po.id = p_target_id)
  end;
$function$;

create policy "posts select visible" on public.posts for select
  using (public.can_view_profile(author_id));
-- SELECT de moderación (espejo de "comments select moderate"): sin ella, un
-- admin/mod NO puede LOCALIZAR (y por tanto borrar) un post de un perfil privado
-- que no sigue. Un DELETE con WHERE exige que la fila sea visible por alguna
-- policy de SELECT; el permiso de la policy de DELETE no basta por sí solo.
-- can_moderate_target('post', …) = autor OR admin global (los posts no tienen
-- club) -> no expone posts privados a usuarios normales.
create policy "posts select moderate" on public.posts for select
  using (private.can_moderate_target('post', id));
create policy "posts insert own" on public.posts for insert
  with check ((select auth.uid()) = author_id);
create policy "posts update own" on public.posts for update
  using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
-- delete: dueño O admin/moderador global, vía can_moderate_target (rama 'post'
-- añadida arriba). can_moderate_target ya incluye la rama de dueño; el
-- `author_id` explícito es redundante pero documenta la intención.
-- NOTA: la función vive en `private`, no en `public`.
create policy "posts delete own or moderate" on public.posts for delete
  using ((select auth.uid()) = author_id
         or private.can_moderate_target('post', id));

create trigger posts_set_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

-- Resolutor del target canónico. href a /post/[id]: el post SÍ tiene página
-- propia (a diferencia del pensamiento, que usaba la ficha del ancla). Esta es
-- la diferencia clave con private.sync_thought_interaction_target.
create or replace function private.sync_post_interaction_target()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.upsert_interaction_target(
    'post', new.id, new.author_id, 'profile', new.author_id,
    '/post/' || new.id::text, true, true, 'post_commented', 'post_liked');
  return new;
end;
$function$;

create trigger posts_sync_interaction_target
  after insert on public.posts
  for each row execute function private.sync_post_interaction_target();

create trigger posts_cleanup_social_target
  after delete on public.posts
  for each row execute function private.cleanup_social_target('post');

-- Grants por columna (#375, DRIFT-CHECK superficie 6): id/created_at/updated_at
-- generadas; author_id/kind/anchor/source inmutables tras el insert -> fuera de
-- UPDATE. Solo se revoca de `authenticated`; `anon` conserva sus grants por
-- defecto (protegidos por RLS, mismo criterio que thoughts).
revoke all on table public.posts from authenticated;
grant select (id, author_id, kind, anchor_type, anchor_id, source_kind, source_id, body, is_spoiler, created_at, updated_at)
  on public.posts to authenticated;
grant insert (author_id, kind, anchor_type, anchor_id, source_kind, source_id, body, is_spoiler)
  on public.posts to authenticated;
grant update (body, is_spoiler) on public.posts to authenticated;
grant delete on public.posts to authenticated;
-- Lectura anónima de perfiles públicos (mismo criterio que passes/thoughts):
grant select (id, author_id, kind, anchor_type, anchor_id, source_kind, source_id, body, is_spoiler, created_at, updated_at)
  on public.posts to anon;
