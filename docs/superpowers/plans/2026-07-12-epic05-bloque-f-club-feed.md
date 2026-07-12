# EPIC-05 Bloque F — Club Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the club feed (E5.F1–F3): members post text/shared-activity/poll content to their club, react and comment on posts (reusing Bloque B's polymorphic engine, extended app-wide for comment-liking), and get notified.

**Architecture:** New `club_posts`/`club_poll_options`/`club_poll_votes` tables gated by the existing `is_club_member`/`has_min_club_role` helpers (Bloque E). `target_kind` (Bloque B) widens to include `club_post`/`comment`, making posts and comments reactable/commentable through the same `reactions`/`comments` tables everything else already uses. Shared activities reference their source row live (`{sourceTable, rowId}`), re-derived on every read through a single-row sibling of Bloque C's `getFeed()`. One new, narrowly-scoped RLS helper (`is_visible_via_club_share`) grants club members visibility into a shared `diary_entry`/`episode_watch` regardless of follow status, without touching the general-purpose `can_view_profile()`.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres/Auth/RLS, TypeScript, next-intl, Tailwind.

## Global Constraints

- Scope is exactly E5.F1–E5.F3 — no club "actividades" motor (Bloque G), no `club_join_request`-style flows (settled in Bloque E).
- Club content is always members-only regardless of `visibility` (SD-4) — `club_posts`/`club_poll_options`/`club_poll_votes` SELECT policies are `to authenticated` only, never `anon`.
- Poll: single-choice, results hidden until the viewer votes (except a closed poll reveals results to everyone), mandatory closing deadline (`poll_ends_at`) enforced at the RLS/RPC layer, not just the UI.
- `activity_share` posts store a live reference (`{sourceTable, rowId}`), never a snapshot — re-derived on every read; if the source row is gone, render a graceful "no longer available" state, never an error.
- Sharing an activity to a club grants club members visibility into that activity regardless of the sharer's profile privacy or the viewer's follow status — scoped narrowly via a new `is_visible_via_club_share()` helper added as an extra `OR` on `diary_entries`/`episode_watches`' existing `SELECT` policies, **never** by modifying `can_view_profile()` itself.
- Comment-liking is app-wide (reviews and club posts both), since it reuses the same `target_kind` polymorphism — not club-scoped.
- Nesting comments (a comment whose own `target_type` is `'comment'`) must be schema-impossible via a `CHECK` constraint, not just unsupported by the UI — required for `can_view_target()`'s new recursive branch to provably terminate.
- Any active club member can post (not gated to moderator+); post deletion is author-or-moderator+ (same pattern as `club_members delete self or moderate`, Bloque E).
- New-post notifications fan out to every active member except the author, routed to `/club/[slug]` (reusing the existing `targetType: "club"` href-resolution path, no post-specific deep link). Like/comment notifications on club posts and comment-likes get full parity with review likes/comments (four new `notification_type` values total).
- Run `npx tsc --noEmit` and `npx eslint <touched files>` after every task that touches `.ts`/`.tsx` files.
- Windows/PowerShell environment — use the Bash tool (Git Bash) for shell commands shown below, not native PowerShell cmdlets.
- Per `docs/TESTING.md`, UI verification is a manual test checklist document, not an automated browser-driving subagent.
- Full design rationale: `docs/superpowers/specs/2026-07-12-epic05-bloque-f-club-feed-design.md`.

---

### Task 1: Migration — `club_posts`/poll schema, RLS, RPCs, `target_kind`/`notification_type` extension

**Files:**
- Create: `supabase/migrations/20260712_club_posts.sql`

**Interfaces:**
- Consumes: `public.clubs`, `public.club_members`, `public.is_club_member(uuid)`, `public.has_min_club_role(uuid, public.club_role)` (Bloque E); `public.can_view_profile(uuid)`, `public.diary_entries`, `public.episode_watches` (Bloque A); `public.target_kind`, `public.reactions`, `public.comments`, `public.can_view_target(public.target_kind, uuid)` (Bloque B); `public.notification_type` (Bloque D).
- Produces: tables `club_posts`, `club_poll_options`, `club_poll_votes`; type `club_post_kind`; functions `is_visible_via_club_share(public.target_kind, uuid)`, `create_club_poll(uuid, text, text[], timestamptz)`, `vote_club_poll(uuid, uuid)`; `target_kind` gains `'club_post'`, `'comment'`; `notification_type` gains `'club_post'`, `'club_post_liked'`, `'club_post_commented'`, `'comment_liked'`. Consumed by Task 2 (types sync), Task 3–6 (domain layer), Task 10 (RLS battery reference).

- [ ] **Step 1: Write `supabase/migrations/20260712_club_posts.sql`**

```sql
-- EPIC-05 Bloque F — Feed del club. Ver
-- docs/superpowers/specs/2026-07-12-epic05-bloque-f-club-feed-design.md. Reutiliza
-- is_club_member/has_min_club_role (Bloque E) y el motor polimórfico
-- reactions/comments (Bloque B, SD-3) — los posts se vuelven un target_kind más.

create type public.club_post_kind as enum ('text', 'activity_share', 'poll');

create table public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  kind public.club_post_kind not null,
  body text not null,              -- texto / caption obligatorio de activity_share / pregunta de poll
  ref jsonb,                       -- solo activity_share: {sourceTable, rowId} -- mismo vocabulario
                                    -- que FeedEvent.id de Bloque C (src/lib/social/feed.ts), partido
                                    -- por ":" en vez de reinventar una nomenclatura paralela
  poll_ends_at timestamptz,        -- solo poll: cierre de votación
  created_at timestamptz not null default now()
);

create table public.club_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.club_posts(id) on delete cascade,
  label text not null,
  position smallint not null
);

create table public.club_poll_votes (
  post_id uuid not null references public.club_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_id uuid not null references public.club_poll_options(id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (post_id, user_id)   -- elección única: una fila por votante, UPSERT para cambiar voto
);

create index idx_club_posts_club on public.club_posts (club_id, created_at desc);
create index idx_club_poll_options_post on public.club_poll_options (post_id, position);
create index idx_club_poll_votes_post on public.club_poll_votes (post_id);

comment on table public.club_posts is 'Posts del feed de un club (EPIC-05 Bloque F). kind=text/activity_share/poll. Sin UPDATE -- no editables, mismo criterio "Reddit-lite" que comments (Bloque B).';
comment on table public.club_poll_options is 'Opciones de una encuesta de club. Sin política de escritura de cliente -- solo se crean vía create_club_poll() (SECURITY DEFINER), atómico con el post.';
comment on table public.club_poll_votes is 'Un voto por usuario por encuesta (PK compuesta = elección única). Sin política de escritura de cliente -- solo vía vote_club_poll() (SECURITY DEFINER), que revalida el cierre server-side.';

-- ── target_kind (Bloque B) gana dos valores: los posts se vuelven
-- reaccionables/comentables, y los comentarios se vuelven reaccionables (like
-- en comentarios, decisión de sesión: app-wide, no solo en posts de club, ya
-- que comparte el mismo target_kind que las reseñas).
alter type public.target_kind add value 'club_post';
alter type public.target_kind add value 'comment';

-- Sin esto, nada impediría insertar un comentario cuyo propio target_type
-- fuera 'comment' (anidación) -- el diseño no la contempla ("hilo plano, sin
-- anidación", Bloque B) y además rompería la terminación de la rama
-- recursiva de can_view_target() de abajo: un comentario cuyo target_id
-- apuntase a sí mismo produciría recursión infinita. El CHECK hace la
-- anidación irrepresentable en el esquema, no solo "no soportada por la UI".
alter table public.comments add constraint comments_no_nesting check (target_type <> 'comment');

-- can_view_target() (Bloque B) gana dos ramas. 'comment' es recursiva sobre
-- la misma función -- termina en una sola pasada porque comments_no_nesting
-- de arriba garantiza que el target de un comentario nunca es otro
-- comentario.
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
    when 'club_post' then exists (
      select 1 from public.club_posts cp where cp.id = p_target_id and public.is_club_member(cp.club_id)
    )
    when 'comment' then exists (
      select 1 from public.comments c where c.id = p_target_id
        and public.can_view_target(c.target_type, c.target_id)
    )
  end;
$$;

-- ── Visibilidad de actividad compartida a un club: pieza genuinamente nueva
-- de este bloque. Un club_post de kind='activity_share' comparte una fila
-- de diary_entries/episode_watches -- si el que comparte tiene perfil
-- privado y un compañero de club no le sigue, ese compañero igualmente debe
-- poder ver el detalle (decisión de sesión: compartir a un club es una
-- elección explícita de audiencia que prevalece sobre la visibilidad de
-- seguidor/perfil normal, solo dentro de ese club). Se aísla en un helper
-- NUEVO y angosto en vez de tocar can_view_profile() (helper transversal
-- usado por todo el contenido de perfil desde Bloque A, ya verificado --
-- menor riesgo mantenerlo intacto). p_target_type solo puede ser
-- 'diary_entry'/'episode_watch' en la práctica (los únicos dos tipos de fila
-- que activity_share puede referenciar y que a su vez tienen RLS propia que
-- necesita este override); el CASE cubre exactamente esos dos.
create or replace function public.is_visible_via_club_share(p_target_type public.target_kind, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_posts cp
    where cp.kind = 'activity_share'
      and cp.ref->>'sourceTable' = case p_target_type
        when 'diary_entry' then 'diary_entries'
        when 'episode_watch' then 'episode_watches'
        else null
      end
      and cp.ref->>'rowId' = p_target_id::text
      and public.is_club_member(cp.club_id)
  );
$$;

comment on function public.is_visible_via_club_share(public.target_kind, uuid) is 'True si target_id fue compartido como activity_share en un club del que el usuario actual es miembro (EPIC-05 Bloque F). Extra OR en las políticas SELECT de diary_entries/episode_watches -- NO se integra en can_view_profile() a propósito, ver comentario de la función.';

-- ── Extiende la visibilidad de diary_entries/episode_watches (Bloque A) con
-- el OR de arriba. drop+create porque Postgres no permite ALTER POLICY para
-- cambiar el USING.
drop policy "diary entries select visible" on public.diary_entries;
create policy "diary entries select visible" on public.diary_entries
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('diary_entry', id)
  );

drop policy "episode_watches select visible" on public.episode_watches;
create policy "episode_watches select visible" on public.episode_watches
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('episode_watch', id)
  );

-- ── RPCs SECURITY DEFINER ────────────────────────────────────────────────
-- create_club_poll: inserta club_posts + club_poll_options atómicamente,
-- mismo patrón que create_club (Bloque E). Revalida "al menos 2 opciones" y
-- "cierre en el futuro" server-side, no solo confía en el chequeo cliente
-- de createPoll() (Dominio, Task 6) -- SECURITY DEFINER es alcanzable
-- directamente vía RPC, no solo desde la app.
create or replace function public.create_club_poll(
  p_club_id uuid,
  p_question text,
  p_options text[],
  p_ends_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
begin
  if not public.is_club_member(p_club_id) then
    raise exception 'forbidden';
  end if;
  if array_length(p_options, 1) is null or array_length(p_options, 1) < 2 then
    raise exception 'at least two options required';
  end if;
  if p_ends_at <= now() then
    raise exception 'poll end date must be in the future';
  end if;

  insert into public.club_posts (club_id, author_id, kind, body, poll_ends_at)
  values (p_club_id, auth.uid(), 'poll', p_question, p_ends_at)
  returning id into v_post_id;

  insert into public.club_poll_options (post_id, label, position)
  select v_post_id, opt, (ord - 1)::smallint
  from unnest(p_options) with ordinality as t(opt, ord);
end;
$$;

revoke execute on function public.create_club_poll(uuid, text, text[], timestamptz) from public, anon;
grant execute on function public.create_club_poll(uuid, text, text[], timestamptz) to authenticated;

-- vote_club_poll: UPSERT del voto propio (elección única, PK compuesta en
-- club_poll_votes fuerza esto). Revalida "es miembro", "es una encuesta
-- real", "sigue abierta" y "la opción pertenece a este post" -- votar tras
-- el cierre se rechaza aquí, no solo se oculta en la UI.
create or replace function public.vote_club_poll(p_post_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_kind public.club_post_kind;
  v_ends_at timestamptz;
begin
  select club_id, kind, poll_ends_at into v_club_id, v_kind, v_ends_at
    from public.club_posts where id = p_post_id;

  if v_club_id is null or v_kind <> 'poll' then
    raise exception 'not a poll';
  end if;
  if not public.is_club_member(v_club_id) then
    raise exception 'forbidden';
  end if;
  if v_ends_at <= now() then
    raise exception 'poll is closed';
  end if;
  if not exists (
    select 1 from public.club_poll_options where id = p_option_id and post_id = p_post_id
  ) then
    raise exception 'invalid option';
  end if;

  insert into public.club_poll_votes (post_id, user_id, option_id)
  values (p_post_id, auth.uid(), p_option_id)
  on conflict (post_id, user_id) do update set option_id = excluded.option_id, voted_at = now();
end;
$$;

revoke execute on function public.vote_club_poll(uuid, uuid) from public, anon;
grant execute on function public.vote_club_poll(uuid, uuid) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.club_posts enable row level security;

create policy "club_posts select member" on public.club_posts
  for select to authenticated
  using (public.is_club_member(club_id));

-- Cualquier miembro activo puede publicar (decisión de sesión: unirse a un
-- club es participar, no gateado a moderator+ como en Bloque E).
create policy "club_posts insert member" on public.club_posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_club_member(club_id));

-- Autor propio o moderator+ (mismo patrón que "club_members delete self or
-- moderate", Bloque E). Sin política UPDATE -- posts no editables.
create policy "club_posts delete self or moderate" on public.club_posts
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or public.has_min_club_role(club_id, 'moderator')
  );

alter table public.club_poll_options enable row level security;

-- Legible si el club_posts padre lo es. Sin INSERT/UPDATE/DELETE de cliente
-- a propósito -- create_club_poll() (SECURITY DEFINER) es el único camino,
-- mismo patrón que clubs no tener política INSERT (create_club() la
-- bypassa).
create policy "club_poll_options select via post" on public.club_poll_options
  for select to authenticated
  using (
    exists (
      select 1 from public.club_posts cp
      where cp.id = post_id and public.is_club_member(cp.club_id)
    )
  );

alter table public.club_poll_votes enable row level security;

-- Tu propio voto SIEMPRE visible. Los votos de los demás solo una vez que TÚ
-- ya has votado en esa encuesta, o la encuesta ya cerró -- esto es lo que de
-- verdad hace cumplir "resultados ocultos hasta que votas" (decisión de
-- sesión): si la política permitiera ver todos los votos a cualquier
-- miembro, un cliente podría consultar club_poll_votes directamente vía
-- PostgREST y saltarse el ocultamiento que hace listClubPosts() a nivel de
-- aplicación -- la RLS es la garantía real, no solo la capa de dominio.
-- Sin INSERT/UPDATE/DELETE de cliente -- vote_club_poll() (SECURITY
-- DEFINER) es el único camino.
create policy "club_poll_votes select own or revealed" on public.club_poll_votes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      exists (
        select 1 from public.club_posts cp
        where cp.id = post_id and public.is_club_member(cp.club_id)
      )
      and (
        exists (
          select 1 from public.club_poll_votes v2
          where v2.post_id = club_poll_votes.post_id and v2.user_id = (select auth.uid())
        )
        or (select poll_ends_at from public.club_posts where id = post_id) <= now()
      )
    )
  );

-- ── Notificaciones de club post (EPIC-05 Bloque F), simétrico a
-- club_invite/club_invite_accepted (Bloque E). club_post enruta a
-- /club/[slug] reutilizando el targetType='club' ya existente en
-- notify()/listNotifications() (sin deep-link al post concreto, decisión de
-- sesión: mantenerlo simple). club_post_liked/club_post_commented/
-- comment_liked dan paridad completa con review_liked/review_commented
-- (decisión de sesión) -- ver Task 5 para su resolución de href.
alter type public.notification_type add value 'club_post';
alter type public.notification_type add value 'club_post_liked';
alter type public.notification_type add value 'club_post_commented';
alter type public.notification_type add value 'comment_liked';
```

- [ ] **Step 2: Apply the migration to dev**

Use `mcp__supabase__apply_migration` with `name: "club_posts"`, pinned to the dev project ref, with the exact SQL from Step 1.

- [ ] **Step 3: Run the RLS/RPC impersonation battery**

Same pattern as Bloque E's Task 1 (`begin; ... rollback;` transaction, `set local role`/`set_config('request.jwt.claims', ...)` to impersonate, `set_config('app.testN', ..., false)` to persist results across `DO` block subtransactions, final aggregate `select current_setting(...)`, `rollback;`). Run this SQL against **dev** via the Supabase SQL execution tool:

```sql
begin;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'rlstest-owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'rlstest-member@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'rlstest-outsider@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'rlstest-other-club@example.com');
insert into public.profiles (user_id, username, is_public) values
  ('11111111-1111-1111-1111-111111111111', 'rlstest_owner', false),
  ('22222222-2222-2222-2222-222222222222', 'rlstest_member', true),
  ('33333333-3333-3333-3333-333333333333', 'rlstest_outsider', true),
  ('44444444-4444-4444-4444-444444444444', 'rlstest_otherclub', true);

-- A crea un club privado (owner) e invita a B, que acepta. C nunca se une.
-- D crea un SEGUNDO club distinto y es su único miembro (para el test de
-- fuga entre clubes).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.create_club('rlstest-feed-club', 'RLS Feed Test', 'desc', 'private', null);
insert into public.club_members (club_id, user_id, status)
  values ((select id from public.clubs where slug = 'rlstest-feed-club'), '22222222-2222-2222-2222-222222222222', 'invited');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
update public.club_members set status = 'active'
  where club_id = (select id from public.clubs where slug = 'rlstest-feed-club') and user_id = '22222222-2222-2222-2222-222222222222';

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select public.create_club('rlstest-other-club', 'RLS Other Club', 'desc', 'private', null);

-- A crea un library_entry + diary_entry propios (A tiene perfil PRIVADO, ver
-- insert de arriba) para poder compartirlos al club.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.library_entries (id, user_id, item_type, item_id, status)
  values ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'book',
    (select id from public.books limit 1), 'completed');
insert into public.diary_entries (id, user_id, library_entry_id, finished_on, rating, review)
  values ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111',
    '55555555-5555-5555-5555-555555555555', current_date, 8, 'Reseña de prueba RLS');

-- Test 1: C (outsider) NO puede ver la diary_entry privada de A directamente
-- (baseline sin compartir, A tiene perfil privado y C no le sigue). role ya
-- es authenticated desde el bloque de setup de arriba, solo cambia el JWT.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select set_config('app.test1', 'count=' || (
  select count(*)::text from public.diary_entries where id = '66666666-6666-6666-6666-666666666666'
), false);

-- Test 2: A (miembro, moderator implícito? no -- cualquier miembro activo
-- puede postear) comparte esa diary_entry como activity_share al club.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.club_posts (club_id, author_id, kind, body, ref)
  values (
    (select id from public.clubs where slug = 'rlstest-feed-club'),
    '11111111-1111-1111-1111-111111111111',
    'activity_share',
    'Mirad esta reseña',
    jsonb_build_object('sourceTable', 'diary_entries', 'rowId', '66666666-6666-6666-6666-666666666666')
  );

-- Test 3: B (miembro del club, NO sigue a A, A es privado) SÍ ve ahora la
-- diary_entry compartida -- is_visible_via_club_share en acción.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select set_config('app.test3', 'count=' || (
  select count(*)::text from public.diary_entries where id = '66666666-6666-6666-6666-666666666666'
), false);

-- Test 4: C (outsider del club) SIGUE sin poder verla -- compartir a un
-- club no la hace pública al mundo, solo visible a los miembros de ESE club.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select set_config('app.test4', 'count=' || (
  select count(*)::text from public.diary_entries where id = '66666666-6666-6666-6666-666666666666'
), false);

-- Test 5: D (miembro de un club DISTINTO) tampoco la ve -- fuga entre
-- clubes descartada (is_club_member() del post debe filtrar por el club
-- correcto).
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select set_config('app.test5', 'count=' || (
  select count(*)::text from public.diary_entries where id = '66666666-6666-6666-6666-666666666666'
), false);

-- Test 6: C (outsider) intenta postear en el club de A/B -- debe rechazarse.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
do $$
begin
  insert into public.club_posts (club_id, author_id, kind, body)
    values ((select id from public.clubs where slug = 'rlstest-feed-club'), '33333333-3333-3333-3333-333333333333', 'text', 'intento');
  perform set_config('app.test6', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test6', 'ok_rejected: ' || sqlerrm, false);
end $$;

-- Test 7: B (miembro normal, no moderator) SÍ puede postear texto (cualquier
-- miembro activo puede publicar).
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.club_posts (id, club_id, author_id, kind, body)
  values ('77777777-7777-7777-7777-777777777777',
    (select id from public.clubs where slug = 'rlstest-feed-club'), '22222222-2222-2222-2222-222222222222', 'text', 'post de B');
select set_config('app.test7', 'ok_inserted', false);

-- Test 8: B (autor) puede borrar su propio post.
do $$
begin
  delete from public.club_posts where id = '77777777-7777-7777-7777-777777777777';
  perform set_config('app.test8', 'ok_no_error: rows=' || (select count(*)::text from public.club_posts where id = '77777777-7777-7777-7777-777777777777'), false);
exception when others then
  perform set_config('app.test8', 'FAILED_error: ' || sqlerrm, false);
end $$;

-- Test 9: C (outsider) intenta borrar el post activity_share de A -- debe
-- fallar (0 filas afectadas, RLS bloquea la visibilidad de la fila).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
do $$
declare
  v_deleted int;
begin
  with deleted as (
    delete from public.club_posts
      where club_id = (select id from public.clubs where slug = 'rlstest-feed-club') and kind = 'activity_share'
      returning id
  )
  select count(*) into v_deleted from deleted;
  perform set_config('app.test9', 'rows_deleted=' || v_deleted::text, false);
end $$;

-- Test 10: A crea una encuesta con 2 opciones, cierre en el futuro.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.create_club_poll(
  (select id from public.clubs where slug = 'rlstest-feed-club'),
  '¿Qué leemos después?',
  array['Libro A', 'Libro B'],
  now() + interval '7 days'
);
select set_config('app.test10', 'ok_created: options=' || (
  select count(*)::text from public.club_poll_options po
    join public.club_posts cp on cp.id = po.post_id
    where cp.club_id = (select id from public.clubs where slug = 'rlstest-feed-club') and cp.kind = 'poll'
), false);

-- Test 11: crear una encuesta con solo 1 opción falla server-side (el RPC
-- revalida, no confía solo en el chequeo cliente).
do $$
begin
  perform public.create_club_poll(
    (select id from public.clubs where slug = 'rlstest-feed-club'),
    'pregunta inválida', array['única opción'], now() + interval '1 day'
  );
  perform set_config('app.test11', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test11', 'ok_rejected: ' || sqlerrm, false);
end $$;

-- Test 12: B vota en la encuesta de A.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.vote_club_poll(
  (select cp.id from public.club_posts cp where cp.club_id = (select id from public.clubs where slug = 'rlstest-feed-club') and cp.kind = 'poll'),
  (select po.id from public.club_poll_options po
    join public.club_posts cp on cp.id = po.post_id
    where cp.club_id = (select id from public.clubs where slug = 'rlstest-feed-club') and cp.kind = 'poll' and po.label = 'Libro A')
);
select set_config('app.test12', 'ok_voted: votes=' || (
  select count(*)::text from public.club_poll_votes v
    join public.club_posts cp on cp.id = v.post_id
    where cp.club_id = (select id from public.clubs where slug = 'rlstest-feed-club') and cp.kind = 'poll'
), false);

-- Test 13: B cambia su voto (UPSERT, sigue siendo 1 fila -- elección única).
select public.vote_club_poll(
  (select cp.id from public.club_posts cp where cp.club_id = (select id from public.clubs where slug = 'rlstest-feed-club') and cp.kind = 'poll'),
  (select po.id from public.club_poll_options po
    join public.club_posts cp on cp.id = po.post_id
    where cp.club_id = (select id from public.clubs where slug = 'rlstest-feed-club') and cp.kind = 'poll' and po.label = 'Libro B')
);
select set_config('app.test13', 'rows=' || (
  select count(*)::text from public.club_poll_votes v
    join public.club_posts cp on cp.id = v.post_id
    where cp.club_id = (select id from public.clubs where slug = 'rlstest-feed-club') and cp.kind = 'poll'
) || ' option=Libro B? ' || (
  select (po.label = 'Libro B')::text from public.club_poll_votes v
    join public.club_poll_options po on po.id = v.option_id
    join public.club_posts cp on cp.id = v.post_id
    where cp.club_id = (select id from public.clubs where slug = 'rlstest-feed-club') and cp.kind = 'poll' and v.user_id = '22222222-2222-2222-2222-222222222222'
), false);

-- Test 14: A (no ha votado todavía) NO ve el voto de B -- resultados
-- ocultos hasta que votas, aplicado a nivel de RLS.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select set_config('app.test14', 'visible_votes=' || (
  select count(*)::text from public.club_poll_votes v
    join public.club_posts cp on cp.id = v.post_id
    where cp.club_id = (select id from public.clubs where slug = 'rlstest-feed-club') and cp.kind = 'poll'
), false);

-- Test 15: A vota -- ahora SÍ ve todos los votos (los suyos + los de B).
select public.vote_club_poll(
  (select cp.id from public.club_posts cp where cp.club_id = (select id from public.clubs where slug = 'rlstest-feed-club') and cp.kind = 'poll'),
  (select po.id from public.club_poll_options po
    join public.club_posts cp on cp.id = po.post_id
    where cp.club_id = (select id from public.clubs where slug = 'rlstest-feed-club') and cp.kind = 'poll' and po.label = 'Libro A')
);
select set_config('app.test15', 'visible_votes=' || (
  select count(*)::text from public.club_poll_votes v
    join public.club_posts cp on cp.id = v.post_id
    where cp.club_id = (select id from public.clubs where slug = 'rlstest-feed-club') and cp.kind = 'poll'
), false);

-- Test 16: votar tras el cierre se rechaza server-side. Crea una encuesta ya
-- cerrada directamente (bypass del RPC solo para fabricar el estado de
-- prueba) e intenta votar en ella.
insert into public.club_posts (id, club_id, author_id, kind, body, poll_ends_at)
  values ('88888888-8888-8888-8888-888888888888',
    (select id from public.clubs where slug = 'rlstest-feed-club'), '11111111-1111-1111-1111-111111111111',
    'poll', 'encuesta cerrada', now() - interval '1 hour');
insert into public.club_poll_options (id, post_id, label, position)
  values ('99999999-9999-9999-9999-999999999999', '88888888-8888-8888-8888-888888888888', 'única opción', 0);
do $$
begin
  perform public.vote_club_poll('88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999');
  perform set_config('app.test16', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test16', 'ok_rejected: ' || sqlerrm, false);
end $$;

-- Test 17: un club_post se vuelve reaccionable/comentable via can_view_target.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.reactions (target_type, target_id, user_id, kind)
  values ('club_post', '88888888-8888-8888-8888-888888888888', '22222222-2222-2222-2222-222222222222', 'like');
insert into public.comments (id, target_type, target_id, author_id, body)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'club_post', '88888888-8888-8888-8888-888888888888', '22222222-2222-2222-2222-222222222222', 'comentario de prueba');
select set_config('app.test17', 'ok_inserted', false);

-- Test 18: el comentario en sí mismo se vuelve reaccionable (like en
-- comentario, recursión de can_view_target vía target_type='comment').
insert into public.reactions (target_type, target_id, user_id, kind)
  values ('comment', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'like');
select set_config('app.test18', 'ok_inserted', false);

-- Test 19: outsider (C) NO puede reaccionar a un club_post/comentario de un
-- club al que no pertenece.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
do $$
begin
  insert into public.reactions (target_type, target_id, user_id, kind)
    values ('club_post', '88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333', 'like');
  perform set_config('app.test19', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test19', 'ok_rejected: ' || sqlerrm, false);
end $$;

-- Test 20: un comentario no puede anidarse (CHECK comments_no_nesting).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$
begin
  insert into public.comments (target_type, target_id, author_id, body)
    values ('comment', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'anidado');
  perform set_config('app.test20', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test20', 'ok_rejected: ' || sqlerrm, false);
end $$;

reset role;
select
  current_setting('app.test1', true) as test1_outsider_no_share_expect_0,
  current_setting('app.test3', true) as test3_member_sees_shared_private_expect_1,
  current_setting('app.test4', true) as test4_outsider_still_blocked_expect_0,
  current_setting('app.test5', true) as test5_other_club_member_blocked_expect_0,
  current_setting('app.test6', true) as test6_outsider_insert_post_rejected,
  current_setting('app.test7', true) as test7_regular_member_can_post,
  current_setting('app.test8', true) as test8_author_deletes_own_post_expect_0,
  current_setting('app.test9', true) as test9_outsider_delete_expect_0,
  current_setting('app.test10', true) as test10_create_poll_expect_options_2,
  current_setting('app.test11', true) as test11_single_option_poll_rejected,
  current_setting('app.test12', true) as test12_vote_expect_1,
  current_setting('app.test13', true) as test13_change_vote_still_1_row,
  current_setting('app.test14', true) as test14_hidden_before_own_vote_expect_0,
  current_setting('app.test15', true) as test15_revealed_after_own_vote_expect_2,
  current_setting('app.test16', true) as test16_vote_after_close_rejected,
  current_setting('app.test17', true) as test17_react_comment_club_post,
  current_setting('app.test18', true) as test18_react_to_comment,
  current_setting('app.test19', true) as test19_outsider_react_rejected,
  current_setting('app.test20', true) as test20_comment_nesting_rejected;

rollback;
```

Confirm: test1 = `count=0`, test3 = `count=1`, test4 = `count=0`, test5 = `count=0`, test6 = `ok_rejected: ...`, test7 = `ok_inserted`, test8 = `ok_no_error: rows=0`, test9 = `rows_deleted=0`, test10 = `ok_created: options=2`, test11 = `ok_rejected: ...`, test12 = `ok_voted: votes=1`, test13 = `rows=1 option=Libro B? true`, test14 = `visible_votes=0`, test15 = `visible_votes=2`, test16 = `ok_rejected: ...` (must mention "closed"), test17 = `ok_inserted`, test18 = `ok_inserted`, test19 = `ok_rejected: ...`, test20 = `ok_rejected: ...` (must mention `comments_no_nesting`). If any test doesn't match, fix the migration and re-run Steps 2–3 (drop-and-retry: `drop table if exists public.club_poll_votes, public.club_poll_options, public.club_posts cascade; drop type if exists public.club_post_kind cascade; drop function if exists public.is_visible_via_club_share, public.create_club_poll, public.vote_club_poll cascade;` — `alter type target_kind/notification_type add value` and the `comments_no_nesting` CHECK can't be dropped by this; re-running the migration is idempotent for the enum adds (a repeat `add value` on an already-present value errors harmlessly, comment out on retry if needed) but `comments_no_nesting`/`can_view_target()`/the two `diary entries select visible`/`episode_watches select visible` policy replacements need `alter table public.comments drop constraint if exists comments_no_nesting;` before retry if they need changing).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260712_club_posts.sql
git commit -m "feat: add club_posts/poll schema, RLS, and RPCs for EPIC-05 Bloque F"
```

---

### Task 2: `schema-baseline.sql` + `database.types.ts` patch

**Files:**
- Modify: `supabase/schema-baseline.sql` (append at end)
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: `supabase/migrations/20260712_club_posts.sql` (Task 1).
- Produces: TypeScript types `Database["public"]["Tables"]["club_posts"|"club_poll_options"|"club_poll_votes"]`, `Database["public"]["Enums"]["club_post_kind"]`, extended `Database["public"]["Enums"]["target_kind"|"notification_type"]`, `Database["public"]["Functions"]["create_club_poll"|"vote_club_poll"]`.

- [ ] **Step 1: Append the migration SQL to `schema-baseline.sql`**

Append the entire content of `supabase/migrations/20260712_club_posts.sql` (written in Task 1) verbatim at the very end of `supabase/schema-baseline.sql`, preceded by:

```sql


-- ============================================================
-- 20260712_club_posts.sql (EPIC-05 Bloque F)
-- ============================================================
```

- [ ] **Step 2: Patch `database.types.ts` — add `club_posts`/`club_poll_options`/`club_poll_votes` table types**

Find the end of the `club_members` block in the `Tables` section (ends right before `reactions: {`) and insert immediately after it:

```ts
      club_posts: {
        Row: {
          author_id: string
          body: string
          club_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["club_post_kind"]
          poll_ends_at: string | null
          ref: Json | null
        }
        Insert: {
          author_id: string
          body: string
          club_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["club_post_kind"]
          poll_ends_at?: string | null
          ref?: Json | null
        }
        Update: {
          author_id?: string
          body?: string
          club_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["club_post_kind"]
          poll_ends_at?: string | null
          ref?: Json | null
        }
        Relationships: []
      }
      club_poll_options: {
        Row: {
          id: string
          label: string
          position: number
          post_id: string
        }
        Insert: {
          id?: string
          label: string
          position: number
          post_id: string
        }
        Update: {
          id?: string
          label?: string
          position?: number
          post_id?: string
        }
        Relationships: []
      }
      club_poll_votes: {
        Row: {
          option_id: string
          post_id: string
          user_id: string
          voted_at: string
        }
        Insert: {
          option_id: string
          post_id: string
          user_id: string
          voted_at?: string
        }
        Update: {
          option_id?: string
          post_id?: string
          user_id?: string
          voted_at?: string
        }
        Relationships: []
      }
```

(`Json` is exported at `src/lib/supabase/database.types.ts:1` — no new import needed, it's already in scope throughout this file.)

- [ ] **Step 3: Patch `database.types.ts` — extend `target_kind`/`notification_type`, add `club_post_kind`**

Find the `Enums: {` block and update the existing `target_kind` line and `notification_type` line, and add `club_post_kind`:

```ts
      club_post_kind: "text" | "activity_share" | "poll"
      target_kind: "diary_entry" | "episode_watch" | "club_post" | "comment"
      notification_type: "follow_request" | "new_follower" | "follow_accepted" | "review_liked" | "review_commented" | "club_invite" | "club_invite_accepted" | "club_post" | "club_post_liked" | "club_post_commented" | "comment_liked"
```

- [ ] **Step 4: Patch `database.types.ts` — add `Functions` block entries**

Find `Functions: {` inside `Database["public"]` and add:

```ts
      create_club_poll: {
        Args: {
          p_club_id: string
          p_question: string
          p_options: string[]
          p_ends_at: string
        }
        Returns: undefined
      }
      vote_club_poll: {
        Args: {
          p_post_id: string
          p_option_id: string
        }
        Returns: undefined
      }
```

- [ ] **Step 5: Patch `database.types.ts` — extend the `Constants` block**

Find `export const Constants = { public: { Enums: {` and add/update, matching Step 3's additions:

```ts
      club_post_kind: ["text", "activity_share", "poll"],
      target_kind: ["diary_entry", "episode_watch", "club_post", "comment"],
      notification_type: ["follow_request", "new_follower", "follow_accepted", "review_liked", "review_commented", "club_invite", "club_invite_accepted", "club_post", "club_post_liked", "club_post_commented", "comment_liked"],
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add supabase/schema-baseline.sql src/lib/supabase/database.types.ts
git commit -m "chore: sync schema-baseline and generated types for club posts"
```

---

### Task 3: `src/lib/social/shared-activity.ts` — single-row `FeedEvent` resolver

**Files:**
- Create: `src/lib/social/shared-activity.ts`

**Interfaces:**
- Consumes: `FeedEvent`, `FeedVerb` (from `src/lib/social/feed.ts`, Bloque C — do not modify that file, only import its exported types).
- Produces: `type ShareRef = { sourceTable: "library_entries" | "progress_sessions" | "diary_entries" | "episode_watches"; rowId: string }`, `resolveSharedActivity(supabase, ref: ShareRef): Promise<FeedEvent | null>`. Consumed by Task 6 (`listClubPosts`).

- [ ] **Step 1: Write `src/lib/social/shared-activity.ts`**

```ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { FeedEvent, FeedVerb } from "./feed";

// Resuelve UNA fila concreta (no un fan-out por seguidos) a la misma forma
// FeedEvent que usa el feed personal (Bloque C, SD-1) -- usado por
// activity_share (Bloque F) para re-derivar en cada lectura lo que se
// compartió a un club, en vez de guardar un snapshot congelado. ShareRef usa
// el mismo vocabulario que FeedEvent.id (`${sourceTable}:${rowId}`) para no
// inventar una nomenclatura paralela -- el picker de compartir simplemente
// hace `feedEvent.id.split(":")`.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ShareRef = {
  sourceTable: "library_entries" | "progress_sessions" | "diary_entries" | "episode_watches";
  rowId: string;
};

const REVIEW_EXCERPT_LENGTH = 200;

function excerpt(text: string | null): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length <= REVIEW_EXCERPT_LENGTH) return trimmed;
  return trimmed.slice(0, REVIEW_EXCERPT_LENGTH).trimEnd() + "…";
}

function verbForReviewable(rating: number | null, review: string | null, floor: FeedVerb): FeedVerb {
  if (review) return "reviewed";
  if (rating != null) return "rated";
  return floor;
}

async function resolveActor(supabase: SupabaseServerClient, userId: string) {
  const { data } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.username ? data : null;
}

async function resolveCatalog(supabase: SupabaseServerClient, itemType: ItemType, itemId: string) {
  const table = itemType === "book" ? "books" : itemType === "movie" ? "movies" : "series";
  const { data } = await supabase.from(table).select("title, cover_url").eq("id", itemId).maybeSingle();
  return data;
}

async function resolveLibraryEntryItem(supabase: SupabaseServerClient, libraryEntryId: string) {
  const { data } = await supabase
    .from("library_entries")
    .select("item_type, item_id")
    .eq("id", libraryEntryId)
    .maybeSingle();
  if (!data) return null;
  return { itemType: data.item_type as ItemType, itemId: data.item_id };
}

// Devuelve null (sin lanzar) tanto si la fila origen ya no existe (borrada)
// como si el viewer no puede verla vía RLS -- el post que la referencia
// debe renderizar un estado "ya no disponible" en cualquiera de los dos
// casos, nunca un error.
export async function resolveSharedActivity(
  supabase: SupabaseServerClient,
  ref: ShareRef,
): Promise<FeedEvent | null> {
  if (ref.sourceTable === "library_entries") {
    const { data: row } = await supabase
      .from("library_entries")
      .select("id, user_id, item_type, item_id, created_at")
      .eq("id", ref.rowId)
      .maybeSingle();
    if (!row) return null;
    const [actor, catalog] = await Promise.all([
      resolveActor(supabase, row.user_id),
      resolveCatalog(supabase, row.item_type as ItemType, row.item_id),
    ]);
    if (!actor || !catalog) return null;
    return {
      id: `library_entries:${row.id}`,
      actorId: row.user_id,
      actorUsername: actor.username!,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: "added",
      itemType: row.item_type as ItemType,
      itemId: row.item_id,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.cover_url,
      eventDate: row.created_at,
      rating: null,
      reviewExcerpt: null,
      episode: null,
      progress: null,
      interactionTarget: null,
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    };
  }

  if (ref.sourceTable === "progress_sessions") {
    const { data: row } = await supabase
      .from("progress_sessions")
      .select("id, user_id, library_entry_id, session_date, duration_minutes, note")
      .eq("id", ref.rowId)
      .maybeSingle();
    if (!row) return null;
    const item = await resolveLibraryEntryItem(supabase, row.library_entry_id);
    if (!item) return null;
    const [actor, catalog] = await Promise.all([
      resolveActor(supabase, row.user_id),
      resolveCatalog(supabase, item.itemType, item.itemId),
    ]);
    if (!actor || !catalog) return null;
    return {
      id: `progress_sessions:${row.id}`,
      actorId: row.user_id,
      actorUsername: actor.username!,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: "progressed",
      itemType: item.itemType,
      itemId: item.itemId,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.cover_url,
      eventDate: row.session_date,
      rating: null,
      reviewExcerpt: null,
      episode: null,
      progress: { durationMinutes: row.duration_minutes, note: row.note },
      interactionTarget: null,
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    };
  }

  if (ref.sourceTable === "diary_entries") {
    const { data: row } = await supabase
      .from("diary_entries")
      .select("id, user_id, library_entry_id, finished_on, rating, review")
      .eq("id", ref.rowId)
      .maybeSingle();
    if (!row) return null;
    const item = await resolveLibraryEntryItem(supabase, row.library_entry_id);
    if (!item) return null;
    const [actor, catalog] = await Promise.all([
      resolveActor(supabase, row.user_id),
      resolveCatalog(supabase, item.itemType, item.itemId),
    ]);
    if (!actor || !catalog) return null;
    return {
      id: `diary_entries:${row.id}`,
      actorId: row.user_id,
      actorUsername: actor.username!,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: verbForReviewable(row.rating, row.review, "finished"),
      itemType: item.itemType,
      itemId: item.itemId,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.cover_url,
      eventDate: row.finished_on,
      rating: row.rating,
      reviewExcerpt: excerpt(row.review),
      episode: null,
      progress: null,
      interactionTarget: { targetType: "diary_entry", targetId: row.id },
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    };
  }

  // episode_watches
  const { data: row } = await supabase
    .from("episode_watches")
    .select("id, user_id, series_id, season_number, episode_number, rating, review, watched_on")
    .eq("id", ref.rowId)
    .maybeSingle();
  if (!row) return null;
  const [actor, catalog, episodeTitle] = await Promise.all([
    resolveActor(supabase, row.user_id),
    resolveCatalog(supabase, "series", row.series_id),
    supabase
      .from("series_episodes")
      .select("title")
      .eq("series_id", row.series_id)
      .eq("season_number", row.season_number)
      .eq("episode_number", row.episode_number)
      .maybeSingle()
      .then((r) => r.data?.title ?? null),
  ]);
  if (!actor || !catalog) return null;
  return {
    id: `episode_watches:${row.id}`,
    actorId: row.user_id,
    actorUsername: actor.username!,
    actorDisplayName: actor.display_name,
    actorAvatarUrl: actor.avatar_url,
    verb: verbForReviewable(row.rating, row.review, "watchedEpisode"),
    itemType: "series",
    itemId: row.series_id,
    itemTitle: catalog.title,
    itemCoverUrl: catalog.cover_url,
    eventDate: row.watched_on,
    rating: row.rating,
    reviewExcerpt: excerpt(row.review),
    episode: { season: row.season_number, episode: row.episode_number, title: episodeTitle },
    progress: null,
    interactionTarget: { targetType: "episode_watch", targetId: row.id },
    reactionCount: 0,
    viewerReacted: false,
    commentCount: 0,
    comments: [],
  };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean. If `FeedVerb`/`FeedEvent` aren't exported from `src/lib/social/feed.ts` under those exact names, check the file — they should already be (`export type FeedVerb = ...` and `export type FeedEvent = ...`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/social/shared-activity.ts
git commit -m "feat: add single-row FeedEvent resolver for shared club activities"
```

---

### Task 4: Extend `interactions.ts`/`interaction-actions.ts` for `club_post`/`comment` targets

**Files:**
- Modify: `src/lib/social/interactions.ts`
- Modify: `src/lib/social/interaction-actions.ts`

**Interfaces:**
- Consumes: `target_kind` extended with `club_post`/`comment` (Task 1); `NotificationType` (extended in Task 5 — this task references the new type names, which must match exactly what Task 5 adds: `club_post_liked`, `club_post_commented`, `comment_liked`).
- Produces: `TargetType = "diary_entry" | "episode_watch" | "club_post"` (widened, no `"comment"` — comments can't themselves be commented on), `ReactableTargetType = TargetType | "comment"` (new export), `toggleReaction(targetType: ReactableTargetType, targetId: string): Promise<void>` (widened param type), `InteractionComment` gains `reactionCount: number; viewerReacted: boolean`. Consumed by Task 6 (`listClubPosts` calls `getInteractionSummary(supabase, "club_post", ...)`), Task 7 (`ReviewInteractions` widened to accept the new target types and per-comment like button).

- [ ] **Step 1: Widen `TargetType` and extend `InteractionComment`/`getInteractionSummary` in `src/lib/social/interactions.ts`**

Find:

```ts
export type TargetType = "diary_entry" | "episode_watch";

export type InteractionComment = {
  id: string;
  authorId: string;
  author: string;
  initials: string;
  body: string;
  createdAt: string;
  isOwn: boolean;
};
```

Replace with:

```ts
export type TargetType = "diary_entry" | "episode_watch" | "club_post";
export type ReactableTargetType = TargetType | "comment";

export type InteractionComment = {
  id: string;
  authorId: string;
  author: string;
  initials: string;
  body: string;
  createdAt: string;
  isOwn: boolean;
  reactionCount: number;
  viewerReacted: boolean;
};
```

Find the end of `getInteractionSummary` (the loop that builds `s.comments.push({...})` and the function's closing `return summaries;`):

```ts
    if (seen > COMMENT_PREFETCH_LIMIT) continue;
    const author = nameByAuthor.get(c.author_id) ?? "—";
    s.comments.push({
      id: c.id,
      authorId: c.author_id,
      author,
      initials: initials(author) || "?",
      body: c.body,
      createdAt: c.created_at,
      isOwn: user?.id === c.author_id,
    });
  }

  return summaries;
}
```

Replace with:

```ts
    if (seen > COMMENT_PREFETCH_LIMIT) continue;
    const author = nameByAuthor.get(c.author_id) ?? "—";
    s.comments.push({
      id: c.id,
      authorId: c.author_id,
      author,
      initials: initials(author) || "?",
      body: c.body,
      createdAt: c.created_at,
      isOwn: user?.id === c.author_id,
      reactionCount: 0,
      viewerReacted: false,
    });
  }

  // Reacciones sobre los propios comentarios (like en comentario, EPIC-05
  // Bloque F) -- segunda query batch, los ids de comentario no se conocen
  // hasta después de la query de arriba. commentById indexa por id sobre
  // TODOS los comentarios devueltos (no solo los de la página de
  // COMMENT_PREFETCH_LIMIT que ya están en s.comments) para no complicar el
  // filtrado -- reacciones de comentarios fuera de la página prefetch
  // simplemente no encuentran destino en el bucle de abajo y se ignoran.
  const allCommentIds = commentRows.map((c) => c.id);
  if (allCommentIds.length > 0) {
    const { data: commentReactions, error: commentReactionsError } = await supabase
      .from("reactions")
      .select("target_id, user_id")
      .eq("target_type", "comment")
      .in("target_id", allCommentIds);
    if (commentReactionsError) throw commentReactionsError;

    const commentById = new Map<string, InteractionComment>();
    for (const s of summaries.values()) {
      for (const c of s.comments) commentById.set(c.id, c);
    }
    for (const r of commentReactions ?? []) {
      const c = commentById.get(r.target_id);
      if (!c) continue;
      c.reactionCount += 1;
      if (user && r.user_id === user.id) c.viewerReacted = true;
    }
  }

  return summaries;
}
```

- [ ] **Step 2: Widen `resolveTargetOwner` and add notification-type dispatch in `src/lib/social/interaction-actions.ts`**

Find:

```ts
import { createClient } from "@/lib/supabase/server";
import { notify } from "./notifications";
import type { TargetType } from "./interactions";
```

Replace with:

```ts
import { createClient } from "@/lib/supabase/server";
import { notify } from "./notifications";
import type { NotificationType } from "./notification-types";
import type { ReactableTargetType, TargetType } from "./interactions";
```

Find:

```ts
async function resolveTargetOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  targetType: TargetType,
  targetId: string,
): Promise<string | null> {
  const table = targetType === "diary_entry" ? "diary_entries" : "episode_watches";
  const { data, error } = await supabase
    .from(table)
    .select("user_id")
    .eq("id", targetId)
    .maybeSingle();
  if (error) throw error;
  return data?.user_id ?? null;
}
```

Replace with:

```ts
// Dueño del target -- a quién notificar. club_post/comment usan author_id en
// vez de user_id (mismas columnas que sus tablas ya declaran).
async function resolveTargetOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  targetType: ReactableTargetType,
  targetId: string,
): Promise<string | null> {
  if (targetType === "diary_entry" || targetType === "episode_watch") {
    const table = targetType === "diary_entry" ? "diary_entries" : "episode_watches";
    const { data, error } = await supabase.from(table).select("user_id").eq("id", targetId).maybeSingle();
    if (error) throw error;
    return data?.user_id ?? null;
  }
  if (targetType === "club_post") {
    const { data, error } = await supabase
      .from("club_posts")
      .select("author_id")
      .eq("id", targetId)
      .maybeSingle();
    if (error) throw error;
    return data?.author_id ?? null;
  }
  const { data, error } = await supabase
    .from("comments")
    .select("author_id")
    .eq("id", targetId)
    .maybeSingle();
  if (error) throw error;
  return data?.author_id ?? null;
}

// Reaccionar (like) notifica con un tipo distinto según qué se está
// reaccionando -- paridad completa con review_liked (EPIC-05 Bloque F,
// decisión de sesión). Comentar solo aplica a diary_entry/episode_watch/
// club_post (nunca a un comentario -- sin anidación).
const LIKE_NOTIFICATION_TYPE: Record<ReactableTargetType, NotificationType> = {
  diary_entry: "review_liked",
  episode_watch: "review_liked",
  club_post: "club_post_liked",
  comment: "comment_liked",
};
const COMMENT_NOTIFICATION_TYPE: Record<TargetType, NotificationType> = {
  diary_entry: "review_commented",
  episode_watch: "review_commented",
  club_post: "club_post_commented",
};
```

Find:

```ts
export async function toggleReaction(
  targetType: TargetType,
  targetId: string,
): Promise<void> {
```

Replace with:

```ts
export async function toggleReaction(
  targetType: ReactableTargetType,
  targetId: string,
): Promise<void> {
```

Find, inside `toggleReaction`:

```ts
    try {
      const ownerId = await resolveTargetOwner(supabase, targetType, targetId);
      if (ownerId && ownerId !== user.id) {
        await notify(supabase, {
          userId: ownerId,
          actorId: user.id,
          type: "review_liked",
          targetType,
          targetId,
        });
      }
    } catch (error) {
      console.error(error);
    }
```

Replace with:

```ts
    try {
      const ownerId = await resolveTargetOwner(supabase, targetType, targetId);
      if (ownerId && ownerId !== user.id) {
        await notify(supabase, {
          userId: ownerId,
          actorId: user.id,
          type: LIKE_NOTIFICATION_TYPE[targetType],
          targetType,
          targetId,
        });
      }
    } catch (error) {
      console.error(error);
    }
```

Find, inside `addComment`:

```ts
  try {
    const ownerId = await resolveTargetOwner(supabase, targetType, targetId);
    if (ownerId && ownerId !== user.id) {
      await notify(supabase, {
        userId: ownerId,
        actorId: user.id,
        type: "review_commented",
        targetType,
        targetId,
      });
    }
  } catch (error) {
    console.error(error);
  }
```

Replace with:

```ts
  try {
    const ownerId = await resolveTargetOwner(supabase, targetType, targetId);
    if (ownerId && ownerId !== user.id) {
      await notify(supabase, {
        userId: ownerId,
        actorId: user.id,
        type: COMMENT_NOTIFICATION_TYPE[targetType],
        targetType,
        targetId,
      });
    }
  } catch (error) {
    console.error(error);
  }
```

(`addComment`'s own `targetType: TargetType` parameter is unchanged — it was never widened to `ReactableTargetType`, since you can't comment on a comment. Only `toggleReaction` accepts the wider `ReactableTargetType`.)

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean once Task 5's `NotificationType` additions exist — if run before Task 5, `tsc` will fail on `club_post_liked`/`club_post_commented`/`comment_liked` not being assignable to `NotificationType`. **Do Task 5 before or immediately after this task's tsc check**, not standalone — note this dependency in the dispatch.

- [ ] **Step 4: Commit**

```bash
git add src/lib/social/interactions.ts src/lib/social/interaction-actions.ts
git commit -m "feat: widen reactions/comments to club_post and comment targets"
```

---

### Task 5: Extend notifications for `club_post`/comment-like parity

**Files:**
- Modify: `src/lib/social/notification-types.ts`
- Modify: `src/lib/social/notifications.ts`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `notification_type` extended (Task 1); `TargetType`/`ReactableTargetType` (Task 4, for type-consistency only — this task doesn't import them, just needs its own `NotificationType` additions to match what Task 4 already references).
- Produces: `NotificationType` gains `"club_post" | "club_post_liked" | "club_post_commented" | "comment_liked"`; `NOTIFICATION_TYPE_KEY` gains matching entries; `ReviewTargetType` gains `"club_post" | "comment"`; `resolveTargetHrefs()` (renamed from `resolveReviewHrefs`, now handles `club`/`club_post`/`comment` in addition to `diary_entry`/`episode_watch`). Consumed by Task 4 (already written, depends on these `NotificationType` values existing), Task 6 (club-post fan-out notification calls `notify()` with `type: "club_post"`).

- [ ] **Step 1: Extend `NotificationType`, `ReviewTargetType`, `NOTIFICATION_TYPE_KEY` in `src/lib/social/notification-types.ts`**

Find:

```ts
export type NotificationType =
  | "follow_request"
  | "new_follower"
  | "follow_accepted"
  | "review_liked"
  | "review_commented"
  | "club_invite"
  | "club_invite_accepted";

export type ReviewTargetType = "diary_entry" | "episode_watch" | "club";
```

Replace with:

```ts
export type NotificationType =
  | "follow_request"
  | "new_follower"
  | "follow_accepted"
  | "review_liked"
  | "review_commented"
  | "club_invite"
  | "club_invite_accepted"
  | "club_post"
  | "club_post_liked"
  | "club_post_commented"
  | "comment_liked";

export type ReviewTargetType = "diary_entry" | "episode_watch" | "club" | "club_post" | "comment";
```

Find:

```ts
export const NOTIFICATION_TYPE_KEY: Record<NotificationType, string> = {
  follow_request: "followRequest",
  new_follower: "newFollower",
  follow_accepted: "followAccepted",
  review_liked: "reviewLiked",
  review_commented: "reviewCommented",
  club_invite: "clubInvite",
  club_invite_accepted: "clubInviteAccepted",
};
```

Replace with:

```ts
export const NOTIFICATION_TYPE_KEY: Record<NotificationType, string> = {
  follow_request: "followRequest",
  new_follower: "newFollower",
  follow_accepted: "followAccepted",
  review_liked: "reviewLiked",
  review_commented: "reviewCommented",
  club_invite: "clubInvite",
  club_invite_accepted: "clubInviteAccepted",
  club_post: "clubPost",
  club_post_liked: "clubPostLiked",
  club_post_commented: "clubPostCommented",
  comment_liked: "commentLiked",
};
```

- [ ] **Step 2: Unify href resolution in `src/lib/social/notifications.ts` — rename `resolveReviewHrefs` to `resolveTargetHrefs`, fold in `club`/`club_post`/`comment`**

Find the entire `resolveReviewHrefs` function (from its doc comment through its closing `}`):

```ts
// Resuelve el enlace de las notificaciones de reseña en batch (una query por
// tabla fuente, no una por notificación). diary_entry pasa por library_entries
// para saber item_type/item_id; episode_watch ya guarda series_id directo.
async function resolveReviewHrefs(
  supabase: SupabaseServerClient,
  targets: { targetType: string; targetId: string }[],
): Promise<Map<string, string>> {
  const hrefByKey = new Map<string, string>();
  const diaryIds = targets
    .filter((t) => t.targetType === "diary_entry")
    .map((t) => t.targetId);
  const episodeIds = targets
    .filter((t) => t.targetType === "episode_watch")
    .map((t) => t.targetId);

  if (diaryIds.length > 0) {
    const { data: diaryRows, error } = await supabase
      .from("diary_entries")
      .select("id, library_entry_id")
      .in("id", diaryIds);
    if (error) throw error;

    const libraryEntryIds = [
      ...new Set((diaryRows ?? []).map((d) => d.library_entry_id)),
    ];
    const { data: libraryRows, error: libError } = await supabase
      .from("library_entries")
      .select("id, item_type, item_id")
      .in("id", libraryEntryIds);
    if (libError) throw libError;

    const itemByEntry = new Map(
      (libraryRows ?? []).map((l) => [
        l.id,
        { itemType: l.item_type as ItemType, itemId: l.item_id },
      ]),
    );
    for (const d of diaryRows ?? []) {
      const item = itemByEntry.get(d.library_entry_id);
      if (item) {
        hrefByKey.set(
          `diary_entry:${d.id}`,
          `${itemHref(item.itemType, item.itemId)}?tab=community`,
        );
      }
    }
  }

  if (episodeIds.length > 0) {
    const { data: episodeRows, error } = await supabase
      .from("episode_watches")
      .select("id, series_id")
      .in("id", episodeIds);
    if (error) throw error;
    for (const e of episodeRows ?? []) {
      hrefByKey.set(
        `episode_watch:${e.id}`,
        `${itemHref("series", e.series_id)}?tab=community`,
      );
    }
  }

  return hrefByKey;
}
```

Replace with:

```ts
// Resuelve el enlace de una notificación en batch (una query por tabla
// fuente, no una por notificación). diary_entry pasa por library_entries
// para saber item_type/item_id; episode_watch ya guarda series_id directo.
// club/club_post/comment se resuelven aquí también ahora (EPIC-05 Bloque F)
// -- antes 'club' vivía como un caso especial duplicado en deliverPush() y
// listNotifications(); se unifica en una sola función para no triplicar la
// resolución de club_post/comment (más compleja que el 'club' original) en
// dos sitios.
async function resolveTargetHrefs(
  supabase: SupabaseServerClient,
  targets: { targetType: string; targetId: string }[],
): Promise<Map<string, string>> {
  const hrefByKey = new Map<string, string>();
  const diaryIds = targets.filter((t) => t.targetType === "diary_entry").map((t) => t.targetId);
  const episodeIds = targets.filter((t) => t.targetType === "episode_watch").map((t) => t.targetId);
  const clubIds = targets.filter((t) => t.targetType === "club").map((t) => t.targetId);
  const clubPostIds = targets.filter((t) => t.targetType === "club_post").map((t) => t.targetId);
  const commentIds = targets.filter((t) => t.targetType === "comment").map((t) => t.targetId);

  if (diaryIds.length > 0) {
    const { data: diaryRows, error } = await supabase
      .from("diary_entries")
      .select("id, library_entry_id")
      .in("id", diaryIds);
    if (error) throw error;

    const libraryEntryIds = [
      ...new Set((diaryRows ?? []).map((d) => d.library_entry_id)),
    ];
    const { data: libraryRows, error: libError } = await supabase
      .from("library_entries")
      .select("id, item_type, item_id")
      .in("id", libraryEntryIds);
    if (libError) throw libError;

    const itemByEntry = new Map(
      (libraryRows ?? []).map((l) => [
        l.id,
        { itemType: l.item_type as ItemType, itemId: l.item_id },
      ]),
    );
    for (const d of diaryRows ?? []) {
      const item = itemByEntry.get(d.library_entry_id);
      if (item) {
        hrefByKey.set(
          `diary_entry:${d.id}`,
          `${itemHref(item.itemType, item.itemId)}?tab=community`,
        );
      }
    }
  }

  if (episodeIds.length > 0) {
    const { data: episodeRows, error } = await supabase
      .from("episode_watches")
      .select("id, series_id")
      .in("id", episodeIds);
    if (error) throw error;
    for (const e of episodeRows ?? []) {
      hrefByKey.set(
        `episode_watch:${e.id}`,
        `${itemHref("series", e.series_id)}?tab=community`,
      );
    }
  }

  if (clubIds.length > 0) {
    const { data: clubRows } = await supabase.from("clubs").select("id, slug").in("id", clubIds);
    for (const c of clubRows ?? []) hrefByKey.set(`club:${c.id}`, `/club/${c.slug}`);
  }

  if (clubPostIds.length > 0) {
    const { data: postRows } = await supabase
      .from("club_posts")
      .select("id, club_id")
      .in("id", clubPostIds);
    const clubIdsForPosts = [...new Set((postRows ?? []).map((p) => p.club_id))];
    const { data: clubRows } = clubIdsForPosts.length
      ? await supabase.from("clubs").select("id, slug").in("id", clubIdsForPosts)
      : { data: [] as { id: string; slug: string }[] };
    const slugByClub = new Map((clubRows ?? []).map((c) => [c.id, c.slug]));
    for (const p of postRows ?? []) {
      const slug = slugByClub.get(p.club_id);
      if (slug) hrefByKey.set(`club_post:${p.id}`, `/club/${slug}`);
    }
  }

  if (commentIds.length > 0) {
    const { data: commentRows } = await supabase
      .from("comments")
      .select("id, target_type, target_id")
      .in("id", commentIds);
    const parentTargets = (commentRows ?? []).map((c) => ({
      targetType: c.target_type,
      targetId: c.target_id,
    }));
    // Recursión de un solo nivel: comments_no_nesting (Task 1) garantiza que
    // el target de un comentario nunca es 'comment', así que esta llamada
    // recursiva termina siempre en su segunda pasada.
    const parentHrefByKey = await resolveTargetHrefs(supabase, parentTargets);
    for (const c of commentRows ?? []) {
      const parentHref = parentHrefByKey.get(`${c.target_type}:${c.target_id}`);
      if (parentHref) hrefByKey.set(`comment:${c.id}`, parentHref);
    }
  }

  return hrefByKey;
}
```

- [ ] **Step 3: Update `deliverPush` to use the unified resolver**

Find:

```ts
  let href = `/u/${actor.username}`;
  if (params.targetType === "club" && params.targetId) {
    const { data: club } = await supabase
      .from("clubs")
      .select("slug")
      .eq("id", params.targetId)
      .maybeSingle();
    if (club) href = `/club/${club.slug}`;
  } else if (params.targetType && params.targetId) {
    const hrefByKey = await resolveReviewHrefs(supabase, [
      { targetType: params.targetType, targetId: params.targetId },
    ]);
    href = hrefByKey.get(`${params.targetType}:${params.targetId}`) ?? href;
  }
```

Replace with:

```ts
  let href = `/u/${actor.username}`;
  if (params.targetType && params.targetId) {
    const hrefByKey = await resolveTargetHrefs(supabase, [
      { targetType: params.targetType, targetId: params.targetId },
    ]);
    href = hrefByKey.get(`${params.targetType}:${params.targetId}`) ?? href;
  }
```

- [ ] **Step 4: Update `listNotifications` to use the unified resolver**

Find:

```ts
  const reviewTargets = representativeRows
    .filter(
      (n): n is typeof n & { target_type: string; target_id: string } =>
        n.target_type != null && n.target_id != null && n.target_type !== "club",
    )
    .map((n) => ({ targetType: n.target_type, targetId: n.target_id }));
  const hrefByKey = await resolveReviewHrefs(supabase, reviewTargets);

  const clubTargetIds = representativeRows
    .filter((n) => n.target_type === "club" && n.target_id != null)
    .map((n) => n.target_id!);
  if (clubTargetIds.length > 0) {
    const { data: clubRows } = await supabase
      .from("clubs")
      .select("id, slug")
      .in("id", clubTargetIds);
    for (const c of clubRows ?? []) {
      hrefByKey.set(`club:${c.id}`, `/club/${c.slug}`);
    }
  }
```

Replace with:

```ts
  const targets = representativeRows
    .filter(
      (n): n is typeof n & { target_type: string; target_id: string } =>
        n.target_type != null && n.target_id != null,
    )
    .map((n) => ({ targetType: n.target_type, targetId: n.target_id }));
  const hrefByKey = await resolveTargetHrefs(supabase, targets);
```

- [ ] **Step 5: Add the notification copy to `messages/es.json`**

In `messages/es.json`, find the `notifications` namespace and add four keys after `clubInviteAccepted` (before `justNow`):

```json
    "clubPost": "{name} publicó en el club",
    "clubPostLiked": "A {name} le gustó tu publicación",
    "clubPostCommented": "{name} comentó tu publicación",
    "commentLiked": "A {name} le gustó tu comentario",
```

- [ ] **Step 6: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/lib/social/notification-types.ts src/lib/social/notifications.ts src/lib/social/interaction-actions.ts src/lib/social/interactions.ts
```

Expected: both clean (this also validates Task 4's changes, which depend on this task's `NotificationType` additions).

- [ ] **Step 7: Commit**

```bash
git add src/lib/social/notification-types.ts src/lib/social/notifications.ts messages/es.json
git commit -m "feat: extend notifications for club posts and comment likes"
```

---

### Task 6: `src/lib/clubs/posts.ts` — post/poll domain functions

**Files:**
- Create: `src/lib/clubs/posts.ts`

**Interfaces:**
- Consumes: `resolveSharedActivity`, `type ShareRef` (Task 3); `getInteractionSummary`, `type InteractionComment` (Task 4, `src/lib/social/interactions.ts`); `notify` (Task 5, `src/lib/social/notifications.ts`); `FeedEvent` (`src/lib/social/feed.ts`, Bloque C); `create_club_poll`/`vote_club_poll` RPCs (Task 1).
- Produces: `type ClubPost`, `type ClubPoll`, `type ClubPostsPage`, `createTextPost(clubId: string, body: string): Promise<void>`, `createShareActivityPost(clubId: string, body: string, ref: ShareRef): Promise<void>`, `createPoll(clubId: string, question: string, options: string[], endsAt: string): Promise<void>`, `votePoll(postId: string, optionId: string): Promise<void>`, `deletePost(postId: string): Promise<void>`, `listClubPosts(clubId: string, cursor?: string): Promise<ClubPostsPage>`. Consumed by Task 8 (composer), Task 9 (feed UI, wired into `/club/[slug]/page.tsx`).

- [ ] **Step 1: Write `src/lib/clubs/posts.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/social/notifications";
import { getInteractionSummary, type InteractionComment } from "@/lib/social/interactions";
import { resolveSharedActivity, type ShareRef } from "@/lib/social/shared-activity";
import type { FeedEvent } from "@/lib/social/feed";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

export type ClubPollOption = {
  id: string;
  label: string;
  voteCount: number | null; // null mientras los resultados siguen ocultos
};

export type ClubPoll = {
  endsAt: string;
  isClosed: boolean;
  viewerOptionId: string | null;
  resultsVisible: boolean;
  options: ClubPollOption[];
};

export type ClubPost = {
  id: string;
  clubId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  kind: "text" | "activity_share" | "poll";
  body: string;
  createdAt: string;
  sharedActivity: FeedEvent | null; // solo kind='activity_share'; null también si la fila origen ya no existe
  poll: ClubPoll | null; // solo kind='poll'
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
};

export type ClubPostsPage = {
  posts: ClubPost[];
  nextCursor: string | null;
};

const PAGE_SIZE = 20;

// Bucle de fan-out sobre los miembros activos, excepto el autor -- sin
// mecanismo de fan-out nuevo, mismo notify() best-effort de siempre (EPIC-05
// Bloque F, decisión de sesión: se acepta el ruido temporal, silenciar-club
// queda diferido a E5.J).
async function notifyNewPost(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  authorId: string,
): Promise<void> {
  try {
    const { data: members } = await supabase
      .from("club_members")
      .select("user_id")
      .eq("club_id", clubId)
      .eq("status", "active")
      .neq("user_id", authorId);
    await Promise.all(
      (members ?? []).map((m) =>
        notify(supabase, {
          userId: m.user_id,
          actorId: authorId,
          type: "club_post",
          targetType: "club",
          targetId: clubId,
        }),
      ),
    );
  } catch (error) {
    console.error("notifyNewPost failed", error);
  }
}

export async function createTextPost(clubId: string, body: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("body_required");

  const { error } = await supabase
    .from("club_posts")
    .insert({ club_id: clubId, author_id: userId, kind: "text", body: trimmed });
  if (error) throw error;

  await notifyNewPost(supabase, clubId, userId);
}

export async function createShareActivityPost(
  clubId: string,
  body: string,
  ref: ShareRef,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("body_required");

  const { error } = await supabase
    .from("club_posts")
    .insert({ club_id: clubId, author_id: userId, kind: "activity_share", body: trimmed, ref });
  if (error) throw error;

  await notifyNewPost(supabase, clubId, userId);
}

export async function createPoll(
  clubId: string,
  question: string,
  options: string[],
  endsAt: string,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const trimmedQuestion = question.trim();
  const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);
  if (!trimmedQuestion) throw new Error("question_required");
  if (trimmedOptions.length < 2) throw new Error("at_least_two_options_required");

  const { error } = await supabase.rpc("create_club_poll", {
    p_club_id: clubId,
    p_question: trimmedQuestion,
    p_options: trimmedOptions,
    p_ends_at: endsAt,
  });
  if (error) throw error;

  await notifyNewPost(supabase, clubId, userId);
}

export async function votePoll(postId: string, optionId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("vote_club_poll", { p_post_id: postId, p_option_id: optionId });
  if (error) throw error;
}

export async function deletePost(postId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("club_posts").delete().eq("id", postId);
  if (error) throw error;
}

export async function listClubPosts(clubId: string, cursor?: string): Promise<ClubPostsPage> {
  const { supabase, userId } = await requireUser();

  let query = supabase
    .from("club_posts")
    .select("id, club_id, author_id, kind, body, ref, poll_ends_at, created_at")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (cursor) query = query.lt("created_at", cursor);

  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows || rows.length === 0) return { posts: [], nextCursor: null };

  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const { data: authors } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", authorIds);
  const authorById = new Map(
    (authors ?? [])
      .filter((a): a is typeof a & { user_id: string; username: string } => a.user_id != null && a.username != null)
      .map((a) => [a.user_id, a]),
  );

  // activity_share: resuelto fila a fila (no batcheado) -- una página de
  // feed de club es pequeña (PAGE_SIZE=20) y solo una fracción suele ser
  // activity_share; batchear por las 4 tablas fuente heterogéneas
  // duplicaría buena parte de getFeed()'s complejidad para un ahorro
  // marginal en este contexto.
  const shareableRows = rows.filter((r) => r.kind === "activity_share" && r.ref);
  const sharedByPostId = new Map<string, FeedEvent | null>(
    await Promise.all(
      shareableRows.map(
        async (r): Promise<[string, FeedEvent | null]> => [
          r.id,
          await resolveSharedActivity(supabase, r.ref as unknown as ShareRef),
        ],
      ),
    ),
  );

  // poll: opciones + votos batcheados por post.
  const pollPostIds = rows.filter((r) => r.kind === "poll").map((r) => r.id);
  const [optionsResult, votesResult] = await Promise.all([
    pollPostIds.length
      ? supabase.from("club_poll_options").select("id, post_id, label, position").in("post_id", pollPostIds)
      : Promise.resolve({ data: [] as { id: string; post_id: string; label: string; position: number }[] }),
    pollPostIds.length
      ? supabase.from("club_poll_votes").select("post_id, user_id, option_id").in("post_id", pollPostIds)
      : Promise.resolve({ data: [] as { post_id: string; user_id: string; option_id: string }[] }),
  ]);
  const optionsByPost = new Map<string, { id: string; label: string; position: number }[]>();
  for (const o of optionsResult.data ?? []) {
    const list = optionsByPost.get(o.post_id) ?? [];
    list.push({ id: o.id, label: o.label, position: o.position });
    optionsByPost.set(o.post_id, list);
  }
  const votesByPost = new Map<string, { userId: string; optionId: string }[]>();
  for (const v of votesResult.data ?? []) {
    const list = votesByPost.get(v.post_id) ?? [];
    list.push({ userId: v.user_id, optionId: v.option_id });
    votesByPost.set(v.post_id, list);
  }

  // Interacciones (Bloque B, target_type='club_post') batcheadas para toda
  // la página.
  const summaries = await getInteractionSummary(
    supabase,
    "club_post",
    rows.map((r) => r.id),
  );

  const posts: ClubPost[] = rows
    .map((r): ClubPost | null => {
      const author = authorById.get(r.author_id);
      if (!author) return null;
      const summary = summaries.get(r.id);

      let poll: ClubPoll | null = null;
      if (r.kind === "poll" && r.poll_ends_at) {
        const isClosed = new Date(r.poll_ends_at) <= new Date();
        const votes = votesByPost.get(r.id) ?? [];
        const viewerVote = votes.find((v) => v.userId === userId);
        const resultsVisible = isClosed || viewerVote != null;
        const options = (optionsByPost.get(r.id) ?? []).sort((a, b) => a.position - b.position);
        poll = {
          endsAt: r.poll_ends_at,
          isClosed,
          viewerOptionId: viewerVote?.optionId ?? null,
          resultsVisible,
          options: options.map((o) => ({
            id: o.id,
            label: o.label,
            voteCount: resultsVisible ? votes.filter((v) => v.optionId === o.id).length : null,
          })),
        };
      }

      return {
        id: r.id,
        clubId: r.club_id,
        authorId: r.author_id,
        authorUsername: author.username,
        authorDisplayName: author.display_name,
        authorAvatarUrl: author.avatar_url,
        kind: r.kind,
        body: r.body,
        createdAt: r.created_at,
        sharedActivity: sharedByPostId.get(r.id) ?? null,
        poll,
        reactionCount: summary?.reactionCount ?? 0,
        viewerReacted: summary?.viewerReacted ?? false,
        commentCount: summary?.commentCount ?? 0,
        comments: summary?.comments ?? [],
      };
    })
    .filter((p): p is ClubPost => p !== null);

  const nextCursor = rows.length === PAGE_SIZE ? rows[rows.length - 1].created_at : null;
  return { posts, nextCursor };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean. If `supabase.rpc("create_club_poll", ...)`/`"vote_club_poll"` don't type-check, confirm Task 2's `Functions` block additions landed with the exact `Args` field names (`p_club_id`, `p_question`, `p_options`, `p_ends_at` / `p_post_id`, `p_option_id`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/clubs/posts.ts
git commit -m "feat: add club post/poll domain functions"
```

---

### Task 7: Extend `ReviewInteractions` for `club_post`/comment-like targets

**Files:**
- Modify: `src/components/social/review-interactions.tsx`

**Interfaces:**
- Consumes: `TargetType`, `ReactableTargetType`, `toggleReaction` (widened, Task 4), `InteractionComment` (extended with `reactionCount`/`viewerReacted`, Task 4).
- Produces: `<ReviewInteractions targetType={TargetType} ... />` (prop type widened to accept `"club_post"`), each rendered comment gains an inline like button calling `toggleReaction("comment", comment.id)`. Consumed by Task 9 (`ClubPostCard`).

- [ ] **Step 1: No prop-type change needed — verify only**

`ReviewInteractions`'s `targetType` prop is already typed via `import type { InteractionComment, TargetType } from "@/lib/social/interactions";` (not an inline union), so Task 4's widening of `TargetType` to include `"club_post"` makes `<ReviewInteractions targetType="club_post" ... />` type-check with zero changes to this file's prop declaration. `toggleReaction` is already imported directly (not aliased) from `@/lib/social/interaction-actions` at the top of the file and used at the post-level like button (`onClick={() => startTransition(() => toggleReaction(targetType, targetId))}`) — Step 2 reuses this exact same imported function, no new import needed.

- [ ] **Step 2: Add a per-comment like button**

Find the comment-rendering block:

```tsx
          {comments.map((c) => (
            <div
              key={c.id}
              className="flex items-start justify-between gap-2 text-xs"
            >
              <p className="text-foreground">
                <span className="font-medium">{c.author}</span>{" "}
                <span className="text-muted-foreground">{c.body}</span>
              </p>
              {c.isOwn && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => deleteComment(c.id))}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  {t("deleteComment")}
                </button>
              )}
            </div>
          ))}
```

Replace with:

```tsx
          {comments.map((c) => (
            <div
              key={c.id}
              className="flex items-start justify-between gap-2 text-xs"
            >
              <p className="text-foreground">
                <span className="font-medium">{c.author}</span>{" "}
                <span className="text-muted-foreground">{c.body}</span>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  aria-pressed={c.viewerReacted}
                  onClick={() => startTransition(() => toggleReaction("comment", c.id))}
                  className={`flex items-center gap-1 ${
                    c.viewerReacted ? "text-accent" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <HeartIcon className="h-3 w-3" fill={c.viewerReacted ? "currentColor" : "none"} />
                  {c.reactionCount > 0 && c.reactionCount}
                </button>
                {c.isOwn && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => startTransition(() => deleteComment(c.id))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {t("deleteComment")}
                  </button>
                )}
              </div>
            </div>
          ))}
```

`toggleReaction("comment", c.id)` type-checks against the widened `ReactableTargetType` param from Task 4 (`toggleReaction(targetType: ReactableTargetType, targetId: string)`) — the literal `"comment"` is a valid `ReactableTargetType` member. `HeartIcon` is already imported at the top of the file (used by the post-level like button) — no new import needed. This reuses the same `isPending`/`startTransition` pair as the rest of the component; a comment-like and a post-level action can't race in practice (they're separate user clicks), so sharing the single pending flag is consistent with how `deleteComment` already shares it.

Note: this button fires the same full-page revalidation as the existing post-level like button (`toggleReaction`'s `revalidatePath("/", "page")` inside `interaction-actions.ts`, unchanged by Task 4) — acceptable for this MVP, matching existing behavior.

- [ ] **Step 3: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/social/review-interactions.tsx
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/social/review-interactions.tsx
git commit -m "feat: add comment-liking to ReviewInteractions"
```

---

### Task 8: `ClubPostComposer` + `ActivitySharePicker`

**Files:**
- Create: `src/components/clubs/club-post-composer.tsx`
- Create: `src/components/clubs/activity-share-picker.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `createTextPost`, `createShareActivityPost`, `createPoll` (Task 6, `src/lib/clubs/posts.ts`); `getFeed`, `type FeedEvent` (`src/lib/social/feed.ts`, Bloque C — read-only, calling the existing exported function).
- Produces: `<ClubPostComposer clubId={string} viewerId={string} onPosted={() => void} />`. Consumed by Task 9 (`ClubFeed`).

- [ ] **Step 1: Write `src/components/clubs/activity-share-picker.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import { loadOwnRecentActivity } from "./club-post-actions";

// Lista las FeedEvents recientes propias del viewer para elegir cuál
// compartir a un club (EPIC-05 Bloque F, decisión de sesión: comparte
// cualquier actividad reciente propia, no solo reseñas -- mismo modelo
// unificado de Bloque C).
export function ActivitySharePicker({
  onPick,
  onCancel,
}: {
  onPick: (event: FeedEvent) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("clubPost");
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOwnRecentActivity().then((page) => {
      setEvents(page);
      setLoading(false);
    });
  }, []);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <span className="text-sm font-medium text-foreground">{t("pickActivity")}</span>
      {loading && <p className="text-xs text-muted-foreground">…</p>}
      {!loading && events.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("empty")}</p>
      )}
      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {events.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onPick(e)}
            className="flex items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-surface-muted"
          >
            {e.itemCoverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage, mismo criterio que otras tarjetas de catálogo
              <img src={e.itemCoverUrl} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
            )}
            <span className="min-w-0 flex-1 truncate">{e.itemTitle}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onCancel} className="self-start text-xs text-muted-foreground hover:text-foreground">
        {t("cancel")}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add `loadOwnRecentActivity` server action**

Create `src/components/clubs/club-post-actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveSharedActivity, type ShareRef } from "@/lib/social/shared-activity";
import type { FeedEvent } from "@/lib/social/feed";

const RECENT_LIMIT = 10;

// getFeed() (Bloque C) filtra por `follows` -- a quién sigues -- así que
// nunca puede devolver las propias filas del viewer, sin importar qué
// viewerId se le pase (su propia query es `follower_id = viewerId`, que
// resuelve a quién sigue viewerId, nunca a viewerId mismo). Para "mi propia
// actividad reciente" se hace una query ligera y propia sobre las 4 tablas
// fuente, y cada fila se re-resuelve vía resolveSharedActivity (Task 3) en
// vez de re-derivar la forma FeedEvent por tercera vez en el proyecto.
export async function loadOwnRecentActivity(): Promise<FeedEvent[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [added, progressed, diary, episodes] = await Promise.all([
    supabase
      .from("library_entries")
      .select("id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("progress_sessions")
      .select("id, session_date")
      .eq("user_id", user.id)
      .order("session_date", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("diary_entries")
      .select("id, finished_on")
      .eq("user_id", user.id)
      .order("finished_on", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("episode_watches")
      .select("id, watched_on")
      .eq("user_id", user.id)
      .order("watched_on", { ascending: false })
      .limit(RECENT_LIMIT),
  ]);

  const refs: { ref: ShareRef; date: string }[] = [
    ...(added.data ?? []).map((r) => ({
      ref: { sourceTable: "library_entries" as const, rowId: r.id },
      date: r.created_at,
    })),
    ...(progressed.data ?? []).map((r) => ({
      ref: { sourceTable: "progress_sessions" as const, rowId: r.id },
      date: r.session_date,
    })),
    ...(diary.data ?? []).map((r) => ({
      ref: { sourceTable: "diary_entries" as const, rowId: r.id },
      date: r.finished_on,
    })),
    ...(episodes.data ?? []).map((r) => ({
      ref: { sourceTable: "episode_watches" as const, rowId: r.id },
      date: r.watched_on,
    })),
  ];
  refs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const events = await Promise.all(
    refs.slice(0, RECENT_LIMIT).map((r) => resolveSharedActivity(supabase, r.ref)),
  );
  return events.filter((e): e is FeedEvent => e !== null);
}
```

- [ ] **Step 3: Write `src/components/clubs/club-post-composer.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import { createTextPost, createShareActivityPost, createPoll } from "@/lib/clubs/posts";
import { ActivitySharePicker } from "./activity-share-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "closed" | "text" | "pick_activity" | "share_activity" | "poll";

export function ClubPostComposer({
  clubId,
  onPosted,
}: {
  clubId: string;
  onPosted: () => void;
}) {
  const t = useTranslations("clubPost");
  const [mode, setMode] = useState<Mode>("closed");
  const [text, setText] = useState("");
  const [shareCaption, setShareCaption] = useState("");
  const [pickedActivity, setPickedActivity] = useState<FeedEvent | null>(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollEndsAt, setPollEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setMode("closed");
    setText("");
    setShareCaption("");
    setPickedActivity(null);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollEndsAt("");
    setError(null);
  }

  function submitText() {
    startTransition(async () => {
      try {
        await createTextPost(clubId, text);
        reset();
        onPosted();
      } catch {
        setError(t("postError"));
      }
    });
  }

  function submitShare() {
    if (!pickedActivity) return;
    const [sourceTable, rowId] = pickedActivity.id.split(":");
    startTransition(async () => {
      try {
        await createShareActivityPost(clubId, shareCaption, {
          sourceTable: sourceTable as "library_entries" | "progress_sessions" | "diary_entries" | "episode_watches",
          rowId,
        });
        reset();
        onPosted();
      } catch {
        setError(t("postError"));
      }
    });
  }

  function submitPoll() {
    startTransition(async () => {
      try {
        await createPoll(clubId, pollQuestion, pollOptions, new Date(pollEndsAt).toISOString());
        reset();
        onPosted();
      } catch {
        setError(t("postError"));
      }
    });
  }

  if (mode === "closed") {
    return (
      <div className="flex gap-2 rounded-lg border border-border bg-surface p-3">
        <Button type="button" variant="secondary" onClick={() => setMode("text")}>
          {t("postText")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setMode("pick_activity")}>
          {t("shareActivity")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setMode("poll")}>
          {t("createPoll")}
        </Button>
      </div>
    );
  }

  if (mode === "text") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("composerPlaceholderText")}
          rows={3}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {error && <p className="text-xs text-status-dropped">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" disabled={isPending || !text.trim()} onClick={submitText}>
            {t("postText")}
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            {t("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "pick_activity") {
    return (
      <ActivitySharePicker
        onPick={(event) => {
          setPickedActivity(event);
          setMode("share_activity");
        }}
        onCancel={reset}
      />
    );
  }

  if (mode === "share_activity") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <span className="text-sm text-foreground">{pickedActivity?.itemTitle}</span>
        <textarea
          value={shareCaption}
          onChange={(e) => setShareCaption(e.target.value)}
          placeholder={t("captionPlaceholder")}
          rows={2}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {error && <p className="text-xs text-status-dropped">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" disabled={isPending || !shareCaption.trim()} onClick={submitShare}>
            {t("shareSubmit")}
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            {t("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  // mode === "poll"
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <Input
        value={pollQuestion}
        onChange={(e) => setPollQuestion(e.target.value)}
        placeholder={t("pollQuestion")}
      />
      {pollOptions.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={opt}
            onChange={(e) => {
              const next = [...pollOptions];
              next[i] = e.target.value;
              setPollOptions(next);
            }}
            placeholder={`${t("pollOption")} ${i + 1}`}
          />
          {pollOptions.length > 2 && (
            <button
              type="button"
              onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t("removeOption")}
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setPollOptions([...pollOptions, ""])}
        className="self-start text-xs text-accent hover:underline"
      >
        {t("addOption")}
      </button>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("pollEndsAt")}
        <input
          type="datetime-local"
          value={pollEndsAt}
          onChange={(e) => setPollEndsAt(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </label>
      {error && <p className="text-xs text-status-dropped">{error}</p>}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={
            isPending ||
            !pollQuestion.trim() ||
            pollOptions.filter((o) => o.trim()).length < 2 ||
            !pollEndsAt
          }
          onClick={submitPoll}
        >
          {t("pollSubmit")}
        </Button>
        <Button type="button" variant="ghost" onClick={reset}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the `clubPost.*` i18n namespace to `messages/es.json`**

Place it near `club`/`notifications` for discoverability:

```json
  "clubPost": {
    "composerPlaceholderText": "¿Qué quieres compartir con el club?",
    "postText": "Publicar",
    "shareActivity": "Compartir actividad",
    "createPoll": "Crear encuesta",
    "cancel": "Cancelar",
    "pickActivity": "Elige una actividad para compartir",
    "captionPlaceholder": "Añade un comentario...",
    "shareSubmit": "Compartir",
    "pollQuestion": "Pregunta",
    "pollOption": "Opción",
    "addOption": "Añadir opción",
    "removeOption": "Quitar",
    "pollEndsAt": "Cierra el",
    "pollSubmit": "Crear encuesta",
    "pollVote": "Votar",
    "pollChangeVote": "Cambiar voto",
    "pollResultsHidden": "Vota para ver los resultados",
    "pollClosed": "Encuesta cerrada",
    "pollVotes": "{count, plural, one {# voto} other {# votos}}",
    "deletePost": "Borrar",
    "deleteConfirm": "¿Borrar esta publicación?",
    "loadMore": "Cargar más",
    "empty": "Todavía no hay publicaciones en este club.",
    "noLongerAvailable": "Esta actividad ya no está disponible.",
    "postError": "Algo falló. Inténtalo de nuevo."
  },
```

- [ ] **Step 5: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/clubs/club-post-composer.tsx src/components/clubs/activity-share-picker.tsx src/components/clubs/club-post-actions.ts
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/club-post-composer.tsx src/components/clubs/activity-share-picker.tsx src/components/clubs/club-post-actions.ts messages/es.json
git commit -m "feat: add ClubPostComposer and ActivitySharePicker"
```

---

### Task 9: `ClubFeed`/`ClubPostCard` and wiring into `/club/[slug]`

**Files:**
- Create: `src/components/clubs/club-feed.tsx`
- Create: `src/components/clubs/club-post-card.tsx`
- Modify: `src/components/clubs/club-post-actions.ts` (add `loadMoreClubPosts`)
- Modify: `src/app/club/[slug]/page.tsx`

**Interfaces:**
- Consumes: `listClubPosts`, `deletePost`, `votePoll`, `type ClubPost`, `type ClubPostsPage` (Task 6); `ClubPostComposer` (Task 8); `ReviewInteractions` (Task 7, widened).
- Produces: `<ClubFeed clubId={string} viewerId={string} initialPosts={ClubPost[]} initialCursor={string | null} canDelete={(post: ClubPost) => boolean} />`. Wired into `/club/[slug]/page.tsx`.

- [ ] **Step 1: Add `loadMoreClubPosts` to `src/components/clubs/club-post-actions.ts`**

Find the top of the file (written in Task 8):

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveSharedActivity, type ShareRef } from "@/lib/social/shared-activity";
import type { FeedEvent } from "@/lib/social/feed";
```

Replace with:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveSharedActivity, type ShareRef } from "@/lib/social/shared-activity";
import { listClubPosts, type ClubPostsPage } from "@/lib/clubs/posts";
import type { FeedEvent } from "@/lib/social/feed";
```

Append to the end of the file:

```ts

export async function loadMoreClubPosts(clubId: string, cursor: string): Promise<ClubPostsPage> {
  return listClubPosts(clubId, cursor);
}
```

(A plain top-level import — `club-post-actions.ts` is `"use server"` and `listClubPosts` is already `"use server"` in `posts.ts`; one server-action file importing and re-exporting another's function directly is the same pattern `manage-members.tsx` already uses when it imports `removeMember`/`setMemberRole` etc. straight from `membership.ts`.)

- [ ] **Step 2: Write `src/components/clubs/club-post-card.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ClubPost } from "@/lib/clubs/posts";
import { votePoll, deletePost } from "@/lib/clubs/posts";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { itemHref } from "@/lib/catalog/item-href";
import { Button } from "@/components/ui/button";

export function ClubPostCard({
  post,
  viewerLoggedIn,
  canDelete,
  onDeleted,
}: {
  post: ClubPost;
  viewerLoggedIn: boolean;
  canDelete: boolean;
  onDeleted: () => void;
}) {
  const t = useTranslations("clubPost");
  const [selectedOption, setSelectedOption] = useState(post.poll?.viewerOptionId ?? null);
  const [isPending, startTransition] = useTransition();

  function handleVote(optionId: string) {
    setSelectedOption(optionId);
    startTransition(async () => {
      await votePoll(post.id, optionId);
    });
  }

  function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      await deletePost(post.id);
      onDeleted();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {post.authorDisplayName || post.authorUsername}
        </span>
        {canDelete && (
          <Button type="button" variant="ghost" disabled={isPending} onClick={handleDelete}>
            {t("deletePost")}
          </Button>
        )}
      </div>

      <p className="whitespace-pre-wrap text-sm text-foreground">{post.body}</p>

      {post.kind === "activity_share" && (
        post.sharedActivity ? (
          <Link
            href={itemHref(post.sharedActivity.itemType, post.sharedActivity.itemId)}
            className="flex items-center gap-2 rounded-md border border-border p-2 hover:bg-surface-muted"
          >
            {post.sharedActivity.itemCoverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage
              <img src={post.sharedActivity.itemCoverUrl} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm">{post.sharedActivity.itemTitle}</span>
          </Link>
        ) : (
          <p className="rounded-md border border-border p-2 text-xs text-muted-foreground">
            {t("noLongerAvailable")}
          </p>
        )
      )}

      {post.kind === "poll" && post.poll && (
        <div className="flex flex-col gap-1">
          {post.poll.options.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`poll-${post.id}`}
                checked={selectedOption === opt.id}
                disabled={post.poll!.isClosed || isPending}
                onChange={() => handleVote(opt.id)}
              />
              <span className="flex-1">{opt.label}</span>
              {opt.voteCount != null && (
                <span className="text-xs text-muted-foreground">
                  {t("pollVotes", { count: opt.voteCount })}
                </span>
              )}
            </label>
          ))}
          {!post.poll.resultsVisible && (
            <p className="text-xs text-muted-foreground">{t("pollResultsHidden")}</p>
          )}
          {post.poll.isClosed && <p className="text-xs text-muted-foreground">{t("pollClosed")}</p>}
        </div>
      )}

      <ReviewInteractions
        targetType="club_post"
        targetId={post.id}
        reactionCount={post.reactionCount}
        viewerReacted={post.viewerReacted}
        commentCount={post.commentCount}
        comments={post.comments}
        viewerLoggedIn={viewerLoggedIn}
      />
    </div>
  );
}
```

(`Button variant="ghost"` for the delete action matches `src/components/clubs/manage-members.tsx`'s existing convention for small text-only per-row actions like `promote`/`remove`.)

- [ ] **Step 3: Write `src/components/clubs/club-feed.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { listClubPosts, type ClubPost, type ClubPostsPage } from "@/lib/clubs/posts";
import { loadMoreClubPosts } from "./club-post-actions";
import { ClubPostComposer } from "./club-post-composer";
import { ClubPostCard } from "./club-post-card";
import { Button } from "@/components/ui/button";

export function ClubFeed({
  clubId,
  viewerId,
  viewerRole,
  initialPage,
}: {
  clubId: string;
  viewerId: string;
  viewerRole: "member" | "moderator" | "owner";
  initialPage: ClubPostsPage;
}) {
  const t = useTranslations("clubPost");
  const [posts, setPosts] = useState(initialPage.posts);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [isPending, startTransition] = useTransition();

  function refresh(page: ClubPostsPage) {
    setPosts(page.posts);
    setCursor(page.nextCursor);
  }

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await loadMoreClubPosts(clubId, cursor);
      setPosts((prev) => [...prev, ...page.posts]);
      setCursor(page.nextCursor);
    });
  }

  function canDelete(post: ClubPost) {
    return post.authorId === viewerId || viewerRole === "moderator" || viewerRole === "owner";
  }

  return (
    <div className="flex flex-col gap-4">
      <ClubPostComposer
        clubId={clubId}
        onPosted={() => {
          startTransition(async () => {
            refresh(await listClubPosts(clubId));
          });
        }}
      />

      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <ClubPostCard
              key={post.id}
              post={post}
              viewerLoggedIn
              canDelete={canDelete(post)}
              onDeleted={() => setPosts((prev) => prev.filter((p) => p.id !== post.id))}
            />
          ))}
        </div>
      )}

      {cursor && (
        <Button type="button" variant="ghost" disabled={isPending} onClick={loadMore}>
          {t("loadMore")}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/clubs/club-feed.tsx src/components/clubs/club-post-card.tsx src/components/clubs/club-post-actions.ts
```

Expected: both clean.

- [ ] **Step 5: Wire `ClubFeed` into `src/app/club/[slug]/page.tsx`**

Find:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getClub } from "@/lib/clubs/clubs";
import { ClubHeader } from "@/components/clubs/club-header";
import { ManageMembers } from "@/components/clubs/manage-members";
```

Replace with:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getClub } from "@/lib/clubs/clubs";
import { listClubPosts } from "@/lib/clubs/posts";
import { ClubHeader } from "@/components/clubs/club-header";
import { ManageMembers } from "@/components/clubs/manage-members";
import { ClubFeed } from "@/components/clubs/club-feed";
```

Find:

```tsx
  const club = await getClub(slug);
  if (!club) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <ClubHeader club={club} userId={user.id} />
      {(club.viewerRole === "moderator" || club.viewerRole === "owner") && (
        <ManageMembers clubId={club.id} viewerRole={club.viewerRole} viewerId={user.id} />
      )}
    </div>
  );
```

Replace with:

```tsx
  const club = await getClub(slug);
  if (!club) notFound();

  const initialPage = club.viewerRole ? await listClubPosts(club.id) : { posts: [], nextCursor: null };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <ClubHeader club={club} userId={user.id} />
      {(club.viewerRole === "moderator" || club.viewerRole === "owner") && (
        <ManageMembers clubId={club.id} viewerRole={club.viewerRole} viewerId={user.id} />
      )}
      {club.viewerRole && (
        <ClubFeed clubId={club.id} viewerId={user.id} viewerRole={club.viewerRole} initialPage={initialPage} />
      )}
    </div>
  );
```

(`club.viewerRole` is `null` for a non-active viewer — e.g. someone with a pending `invited` status, or `viewerStatus: "none"` on a page that otherwise renders because `getClub` returned non-null for a public club. The feed only renders for an actual active member — same gate `ManageMembers` already uses for moderator+, widened here to any non-null role since any active member can view/post to the feed, per this block's global constraint.)

- [ ] **Step 6: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint "src/app/club/[slug]/page.tsx"
```

Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/clubs/club-feed.tsx src/components/clubs/club-post-card.tsx src/components/clubs/club-post-actions.ts "src/app/club/[slug]/page.tsx"
git commit -m "feat: add club feed UI and wire into /club/[slug]"
```

---

### Task 10: Manual test checklist

**Files:**
- Create: `docs/superpowers/plans/2026-07-12-epic05-bloque-f-club-feed-manual-test.md`

- [ ] **Step 1: Write the checklist document**

Per `docs/TESTING.md`, this replaces automated browser verification. Write a markdown checklist covering, with two test accounts (A = club owner from Bloque E's own checklist or a fresh club, B = second account, both already members of a shared private club — reuse/re-run Bloque E's club-setup steps first if starting fresh):

1. **Setup**: `npm run dev`, log in as A, ensure A and B are both active members of a private club (A owner, B member) — reuse the club-creation/invite flow from Bloque E's checklist if no club exists yet.
2. **Text post**: as B (regular member, not moderator), open the club, use the composer's "Publicar" button, write a short text post, submit. Confirm it appears at the top of the feed immediately, with B's name, no "Editar"/edit affordance anywhere (posts aren't editable).
3. **New-post notification**: as A, confirm a "publicó en el club" notification arrived, links to the club page.
4. **Share an activity**: as A, mark a book/movie as finished with a rating in your own library (outside the club, via the normal item page), then in the club composer use "Compartir actividad", pick that activity from the picker, add a required caption, submit. Confirm the post shows the item title/cover as a card, links to the item page, and the caption is shown.
5. **Shared-activity visibility across privacy**: make A's profile private (`/cuenta` or wherever profile visibility toggles), confirm B (a club member who does NOT follow A) can still see the full shared-activity card's details (title, rating) in the club feed — this is the block's core new RLS behavior, test it explicitly. Then, as a THIRD account C who is NOT a member of this club, confirm C cannot see this activity at all (neither via the club, which C can't access, nor via A's now-private profile directly).
6. **Poll — create and vote**: as B, use "Crear encuesta", enter a question, 2+ options, a close date/time a few minutes in the future, submit. Confirm the poll post appears with radio-button options. As A, vote for an option — confirm results stay hidden until voting (no vote counts shown before A votes), then appear immediately after A votes. As B (the poll creator, who hasn't voted yet), confirm B still can't see results until B also votes.
7. **Poll — change vote**: as A, vote for a different option than initially chosen. Confirm the vote count moves from the old option to the new one (still 1 total vote from A).
8. **Poll — closing**: create a second poll with a close time ~1 minute in the future (or manually adjust `poll_ends_at` via SQL against dev for a faster test), wait for it to pass, refresh the page. Confirm voting is disabled (radio buttons non-interactive or a "closed" message shown) and results are now visible even to an account that never voted.
9. **Reactions/comments on a club post**: as A, like B's text post from step 2 — confirm the like count increments and B gets a "le gustó tu publicación" notification. As B, comment on A's shared-activity post — confirm A gets a "comentó tu publicación" notification.
10. **Comment-liking**: as A, like B's comment from step 9 — confirm the like count on that comment increments and B gets a "le gustó tu comentario" notification. Then, separately, go to any existing review (not a club post) with a comment on it and confirm the SAME like-a-comment button now appears there too (app-wide comment-liking, not club-only) and works identically.
11. **Delete permissions**: as B (regular member), confirm B can delete B's own text post (delete button visible, works). As B, confirm B does NOT see a delete button on A's posts. As A (owner), confirm A CAN delete B's posts (moderator+ deletion power).
12. **Non-member exclusion**: as an account not in this club, confirm the club's `/club/[slug]` page shows no feed section at all (or 404s, per Bloque E's existing private-club behavior) — no post content leaks.
13. **Pagination**: create enough posts (or lower `PAGE_SIZE` temporarily for testing) to exceed one page, confirm "Cargar más" loads the next batch without duplicating or dropping posts.
14. **No console errors** throughout.
15. **Cleanup**: delete test posts/polls/reactions/comments created during this checklist via SQL against dev, scoped to the test club's id: `delete from public.club_poll_votes where post_id in (select id from public.club_posts where club_id = '<club-id>'); delete from public.club_poll_options where post_id in (select id from public.club_posts where club_id = '<club-id>'); delete from public.reactions where target_type in ('club_post','comment') and target_id in (select id::text::uuid from public.club_posts where club_id = '<club-id>'); delete from public.comments where target_type = 'club_post' and target_id in (select id from public.club_posts where club_id = '<club-id>'); delete from public.club_posts where club_id = '<club-id>';` (adjust the `reactions`/`comments` cleanup if any comment-likes were made on non-club-post targets during step 10's app-wide test — clean those up by their own comment id too). Revert any profile-privacy toggle changed during step 5.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-12-epic05-bloque-f-club-feed-manual-test.md
git commit -m "docs: add manual test checklist for EPIC-05 Bloque F club feed"
```

---

### Task 11: Apply to prod, update docs

**Files:**
- Modify: `docs/requirements/social-epic.md`
- Modify: `docs/REQUIREMENTS.md`

- [ ] **Step 1: Apply the migration to prod**

Use `mcp__supabase__apply_migration` with `name: "club_posts"` and the exact SQL from Task 1, Step 1 (pinned to the prod project ref). **Confirm with the user before applying** — this alters live RLS policies on `diary_entries`/`episode_watches`, tables with real production data, not just brand-new tables (unlike Bloque E's Task 1, which only added policies to tables that didn't exist yet). Treat this the same way the controller treated Bloque E's prod deployment: a hard-to-reverse, shared-system action requiring explicit confirmation, not something to do automatically even in an otherwise-autonomous flow.

- [ ] **Step 2: Verify prod**

Run `mcp__supabase__get_advisors` with `type: "security"` and confirm no genuinely new findings beyond the project's already-accepted pre-existing patterns (the same `SECURITY DEFINER` RPC-exposure warnings seen after Bloque E's deployment are expected here too, for `create_club_poll`/`vote_club_poll`/`is_visible_via_club_share`/etc.).

- [ ] **Step 3: Update `docs/requirements/social-epic.md`**

Mark `E5.F1`–`E5.F3` as done (`- [x]`) and add a status note matching the style of the other closed EPIC-05 blocks — built + verified in dev (manual checklist), migration applied to prod, comment-liking scope expansion noted, Bloque G (activities motor) explicitly still deferred.

- [ ] **Step 4: Update `docs/REQUIREMENTS.md`**

Add a dated row to the §9 decision table documenting: the `is_visible_via_club_share()` isolation decision (new narrow helper vs. extending `can_view_profile()`, and why), the `resolveReviewHrefs`→`resolveTargetHrefs` unification (folding the previously-duplicated `club` href-resolution branch into one shared function used by both `deliverPush`/`listNotifications`), the app-wide comment-liking scope expansion (not originally in the backlog text, decided during brainstorming since it falls out naturally from sharing `target_kind`), and the `club_poll_votes` "hidden until you vote" RLS enforcement (own vote always visible, others' votes gated on having voted yourself or the poll being closed — enforced at the RLS layer, not just the app layer, so it can't be bypassed by a direct PostgREST query).

- [ ] **Step 5: Commit**

```bash
git add docs/requirements/social-epic.md docs/REQUIREMENTS.md
git commit -m "docs: mark EPIC-05 Bloque F done (club feed)"
```
