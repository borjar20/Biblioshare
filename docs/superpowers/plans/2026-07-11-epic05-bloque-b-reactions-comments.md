# EPIC-05 Bloque B — Reacciones y comentarios en reseñas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users react ("me gusta") and comment (flat thread) on existing reviews (`diary_entries.review` and `episode_watches.review`), and notify the review's author when that happens.

**Architecture:** Two new polymorphic Postgres tables (`reactions`, `comments`) targeting `diary_entry`/`episode_watch` rows, gated by a new `can_view_target()` `SECURITY DEFINER` helper that delegates to the existing `can_view_profile()`. A shared read module (`interactions.ts`) batch-fetches counts/viewer-state/comment lists and is composed into the existing review-fetching functions; a shared write module (`interaction-actions.ts`) exposes `"use server"` mutations. UI is a new client component (`ReviewInteractions`) rendered under each review card. Notifications reuse the existing Bloque D `notify()`/`notifications` table with two new type values, and a URL query param is added to the item detail page's tab switcher so notifications can deep-link into the reviews.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase Postgres/Auth/RLS, next-intl, TypeScript, Tailwind.

## Global Constraints

- Every schema change goes to the **dev** Supabase project (ref `tyvzpuhxfwxrnkcpzxyg`) first via the Management API, gets RLS-verified, and only then gets applied to **prod** (ref `vmutcradmodhiltuohys`) via the `mcp__supabase__apply_migration` tool. Never call Supabase MCP tools against dev — they're pinned to prod.
- Dev SQL execution: `POST https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/database/query` with header `Authorization: Bearer $SUPABASE_ACCESS_TOKEN` (already in the shell env) and JSON body `{"query": "..."}`. `jq` is not installed — build JSON payloads with `node -e` if needed, not shell string concatenation.
- `src/lib/supabase/database.types.ts` must never be regenerated wholesale from dev — always a surgical patch (exact string insertion) preserving every other pre-existing type, because dev has drifted from prod on unrelated RPC signatures in the past.
- No comment editing, no content-owner comment moderation override, no realtime — these are explicit non-goals of this spec (see `docs/superpowers/specs/2026-07-11-epic05-bloque-b-reactions-comments-design.md`).
- Follow the repo's existing read/write file-split convention: `<domain>.ts` (queries, importable from Server Components) vs. `<domain>-actions.ts` (`"use server"` mutations).
- Run `npx tsc --noEmit` and `npx eslint .` after every task that touches `.ts`/`.tsx` files — both must stay clean (pre-existing unrelated warnings in `android/`, `src/app/importar/actions.ts`, `src/components/edit-profile-form.tsx` are fine to leave).
- Windows/PowerShell environment — use the Bash tool (Git Bash) for `grep`/`node`/`curl`-style commands shown below, not native PowerShell cmdlets.

---

### Task 1: Migration — `reactions`/`comments` tables, `can_view_target()`, RLS, notification enum extension

**Files:**
- Create: `supabase/migrations/20260711_review_interactions.sql`

**Interfaces:**
- Produces: tables `public.reactions(id, target_type, target_id, user_id, kind, created_at)` and `public.comments(id, target_type, target_id, author_id, body, created_at)`; enum `public.target_kind` (`'diary_entry' | 'episode_watch'`); function `public.can_view_target(p_target_type public.target_kind, p_target_id uuid) returns boolean`; two new values on the existing `public.notification_type` enum: `'review_liked'`, `'review_commented'`.

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Apply the migration to dev via the Management API**

```bash
node -e '
const fs = require("fs");
const sql = fs.readFileSync("supabase/migrations/20260711_review_interactions.sql", "utf8");
fetch("https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/database/query", {
  method: "POST",
  headers: { Authorization: "Bearer " + process.env.SUPABASE_ACCESS_TOKEN, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
}).then(async r => { console.log("STATUS", r.status); console.log(await r.text()); });
'
```

Expected: `STATUS 201` and no error body.

- [ ] **Step 3: Run the RLS impersonation battery against dev**

Save this as a temp file (e.g. in your scratchpad dir) and run it the same way as Step 2 (`fs.readFileSync` that file instead). Everything happens inside one rolled-back transaction — no real data is touched.

```sql
begin;

-- Setup: cuatro usuarios desechables.
-- A = dueño público de una reseña. B = dueño privado de otra reseña.
-- C = extraño (no sigue a B). D = seguidor aceptado de B.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'rls-test-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'rls-test-b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'rls-test-c@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'rls-test-d@example.com');

insert into public.profiles (user_id, username, is_public) values
  ('11111111-1111-1111-1111-111111111111', 'rlstest_a', true),
  ('22222222-2222-2222-2222-222222222222', 'rlstest_b', false),
  ('33333333-3333-3333-3333-333333333333', 'rlstest_c', true),
  ('44444444-4444-4444-4444-444444444444', 'rlstest_d', true);

insert into public.follows (follower_id, followee_id, status) values
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'accepted');

insert into public.books (id, title) values
  ('55555555-5555-5555-5555-555555555555', 'RLS Test Book');

insert into public.library_entries (id, user_id, item_type, item_id, status) values
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'book', '55555555-5555-5555-5555-555555555555', 'completed'),
  ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', 'book', '55555555-5555-5555-5555-555555555555', 'completed');

insert into public.diary_entries (id, library_entry_id, user_id, finished_on, review) values
  ('88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', now(), 'Reseña pública de A'),
  ('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', now(), 'Reseña privada de B');

-- Test 1: can_view_target — extraño (C) sobre target privado de B → false.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select public.can_view_target('diary_entry', '99999999-9999-9999-9999-999999999999') as c_sees_b_private; -- esperado: false

-- Test 2: can_view_target — seguidor aceptado (D) sobre target privado de B → true.
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select public.can_view_target('diary_entry', '99999999-9999-9999-9999-999999999999') as d_sees_b_private; -- esperado: true

-- Test 3: C intenta reaccionar sobre el target privado de B → debe fallar.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
insert into public.reactions (target_type, target_id, user_id, kind)
  values ('diary_entry', '99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333', 'like'); -- esperado: ERROR (RLS)

-- Test 4: C intenta reaccionar SUPLANTANDO a D sobre el target público de A → debe fallar.
insert into public.reactions (target_type, target_id, user_id, kind)
  values ('diary_entry', '88888888-8888-8888-8888-888888888888', '44444444-4444-4444-4444-444444444444', 'like'); -- esperado: ERROR (RLS, user_id != auth.uid())

-- Test 5: D reacciona y comenta legítimamente sobre el target público de A → OK.
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
insert into public.reactions (target_type, target_id, user_id, kind)
  values ('diary_entry', '88888888-8888-8888-8888-888888888888', '44444444-4444-4444-4444-444444444444', 'like');
insert into public.comments (target_type, target_id, author_id, body)
  values ('diary_entry', '88888888-8888-8888-8888-888888888888', '44444444-4444-4444-4444-444444444444', 'Comentario de prueba de D');

-- Test 6: C intenta borrar el comentario de D → 0 filas afectadas.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
delete from public.comments
  where target_id = '88888888-8888-8888-8888-888888888888' and author_id = '44444444-4444-4444-4444-444444444444'
  returning id; -- esperado: 0 filas

-- Test 7: anon puede LEER reacciones/comentarios del target público de A, pero no insertar.
reset role;
set local role anon;
select count(*) from public.reactions where target_id = '88888888-8888-8888-8888-888888888888'; -- esperado: 1
select count(*) from public.comments where target_id = '88888888-8888-8888-8888-888888888888'; -- esperado: 1
insert into public.reactions (target_type, target_id, user_id, kind)
  values ('diary_entry', '88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333', 'like'); -- esperado: ERROR (RLS, rol anon no cumple "to authenticated")

reset role;
rollback;
```

Confirm each `-- esperado:` comment against the actual output before moving on. If any test doesn't match, fix the migration and re-run Steps 2–3 (the migration can be re-applied idempotently by dropping the created objects first: `drop table if exists public.reactions, public.comments cascade; drop function if exists public.can_view_target; drop type if exists public.target_kind;` — the `notification_type` enum values, once added, cannot be removed, which is fine since they're additive and harmless).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260711_review_interactions.sql
git commit -m "feat: add reactions/comments schema for EPIC-05 Bloque B (SD-3)"
```

---

### Task 2: Update `schema-baseline.sql` and `database.types.ts`

**Files:**
- Modify: `supabase/schema-baseline.sql` (append at end of file)
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: TypeScript types `Database["public"]["Tables"]["reactions"]`, `Database["public"]["Tables"]["comments"]`, `Database["public"]["Enums"]["target_kind"]`, extended `Database["public"]["Enums"]["notification_type"]` — consumed by every later task that touches these tables.

- [ ] **Step 1: Append the migration SQL to `schema-baseline.sql`**

Open `supabase/schema-baseline.sql`, go to the very end of the file, and append (this is the same SQL as Task 1's migration file, verbatim):

```sql


-- ============================================================
-- 20260711_review_interactions.sql (EPIC-05 Bloque B)
-- ============================================================
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

alter type public.notification_type add value 'review_liked';
alter type public.notification_type add value 'review_commented';
```

- [ ] **Step 2: Patch `database.types.ts` — add the `reactions`/`comments` table types**

Open `src/lib/supabase/database.types.ts`, find the end of the `notifications` block (it ends with `Relationships: []\n      }` right before `library_entries: {`), and insert immediately after it, before `library_entries: {`:

```ts
      reactions: {
        Row: {
          created_at: string
          id: string
          kind: string
          target_id: string
          target_type: Database["public"]["Enums"]["target_kind"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          target_id: string
          target_type: Database["public"]["Enums"]["target_kind"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["target_kind"]
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          target_id: string
          target_type: Database["public"]["Enums"]["target_kind"]
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          target_id: string
          target_type: Database["public"]["Enums"]["target_kind"]
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["target_kind"]
        }
        Relationships: []
      }
```

- [ ] **Step 3: Patch `database.types.ts` — extend the `Enums` block**

Find this line (inside `Enums: {`):

```ts
      notification_type: "follow_request" | "new_follower" | "follow_accepted"
```

Replace it with:

```ts
      notification_type: "follow_request" | "new_follower" | "follow_accepted" | "review_liked" | "review_commented"
      target_kind: "diary_entry" | "episode_watch"
```

- [ ] **Step 4: Patch `database.types.ts` — extend the `Constants` block**

Find this line (inside `export const Constants = { public: { Enums: {`):

```ts
      notification_type: ["follow_request", "new_follower", "follow_accepted"],
```

Replace it with:

```ts
      notification_type: ["follow_request", "new_follower", "follow_accepted", "review_liked", "review_commented"],
      target_kind: ["diary_entry", "episode_watch"],
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add supabase/schema-baseline.sql src/lib/supabase/database.types.ts
git commit -m "chore: sync schema-baseline and generated types for reactions/comments"
```

---

### Task 3: Extend `notifications.ts` — new types, `notify()` target params, href resolution

**Files:**
- Modify: `src/lib/social/notifications.ts`
- Modify: `src/components/social/notification-bell.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `itemHref(itemType: ItemType, id: string): string` from `src/lib/catalog/item-href.ts`.
- Produces: `notify(supabase, { userId, actorId, type, targetType?, targetId? })` (extended signature, backward compatible — existing callers in `src/lib/social/actions.ts` need no changes); `Notification` type gains `href: string`; `NotificationType` gains `"review_liked" | "review_commented"`. Consumed by Task 5 (`interaction-actions.ts`).

- [ ] **Step 1: Rewrite `src/lib/social/notifications.ts`**

```ts
import type { createClient } from "@/lib/supabase/server";
import { itemHref } from "@/lib/catalog/item-href";
import type { ItemType } from "@/lib/catalog/types";

// Notificaciones in-app (EPIC-05, Bloque D, SD-5). Sin push/email/cron: se lee
// al cargar la app (campana). notify() es un efecto secundario best-effort
// llamado desde otras server actions (follow/aceptar/reaccionar/comentar); un
// fallo aquí no debe romper la acción real que lo dispara.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type NotificationType =
  | "follow_request"
  | "new_follower"
  | "follow_accepted"
  | "review_liked"
  | "review_commented";

export type ReviewTargetType = "diary_entry" | "episode_watch";

export type Notification = {
  id: string;
  type: NotificationType;
  actorId: string;
  actorUsername: string;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  href: string;
  readAt: string | null;
  createdAt: string;
};

const LIST_LIMIT = 20;

export async function notify(
  supabase: SupabaseServerClient,
  params: {
    userId: string;
    actorId: string;
    type: NotificationType;
    targetType?: ReviewTargetType;
    targetId?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    user_id: params.userId,
    actor_id: params.actorId,
    type: params.type,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
  });
  // Best-effort: no se propaga. Una notificación fallida no debe deshacer la
  // acción real (follow/accept/reacción/comentario) que ya se confirmó.
  if (error) console.error("notify() failed", error);
}

export async function getUnreadCount(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw error;
  return count ?? 0;
}

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

// notifications.actor_id apunta a auth.users, no a profiles → sin embedding de
// PostgREST; se resuelve la identidad del actor en un segundo paso (mismo
// patrón que resolveUsers en follows.ts). Se usa profile_identities (no
// profiles) para cubrir también actores con perfil privado.
export async function listNotifications(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, actor_id, target_type, target_id, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const actorIds = [...new Set(data.map((n) => n.actor_id))];
  const { data: actors, error: actorsError } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", actorIds);

  if (actorsError) throw actorsError;

  const byId = new Map(
    (actors ?? [])
      .filter(
        (a): a is typeof a & { user_id: string; username: string } =>
          a.user_id != null && a.username != null,
      )
      .map((a) => [a.user_id, a]),
  );

  const reviewTargets = data
    .filter(
      (n): n is typeof n & { target_type: string; target_id: string } =>
        n.target_type != null && n.target_id != null,
    )
    .map((n) => ({ targetType: n.target_type, targetId: n.target_id }));
  const hrefByKey = await resolveReviewHrefs(supabase, reviewTargets);

  // Si el actor ya no es resoluble (cuenta borrada, RLS), se descarta la fila:
  // no hay a quién enlazar ni qué nombre mostrar.
  return data
    .map((n): Notification | null => {
      const actor = byId.get(n.actor_id);
      if (!actor) return null;
      const href =
        n.target_type && n.target_id
          ? (hrefByKey.get(`${n.target_type}:${n.target_id}`) ??
            `/u/${actor.username}`)
          : `/u/${actor.username}`;
      return {
        id: n.id,
        type: n.type as NotificationType,
        actorId: n.actor_id,
        actorUsername: actor.username,
        actorDisplayName: actor.display_name,
        actorAvatarUrl: actor.avatar_url,
        href,
        readAt: n.read_at,
        createdAt: n.created_at,
      };
    })
    .filter((n): n is Notification => n !== null);
}
```

- [ ] **Step 2: Update `notification-bell.tsx` to use the resolved `href` and the two new types**

In `src/components/social/notification-bell.tsx`, replace the `TYPE_KEY` map:

```ts
const TYPE_KEY: Record<Notification["type"], string> = {
  follow_request: "followRequest",
  new_follower: "newFollower",
  follow_accepted: "followAccepted",
  review_liked: "reviewLiked",
  review_commented: "reviewCommented",
};
```

And replace the hardcoded link:

```tsx
                  <Link
                    href={`/u/${n.actorUsername}`}
```

with:

```tsx
                  <Link
                    href={n.href}
```

- [ ] **Step 3: Add the two new i18n keys**

In `messages/es.json`, inside the `"notifications"` object, add two keys right after `"followAccepted"`:

```json
    "followAccepted": "{name} ha aceptado tu solicitud de seguimiento",
    "reviewLiked": "{name} le gustó tu reseña",
    "reviewCommented": "{name} comentó tu reseña",
```

- [ ] **Step 4: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/lib/social/notifications.ts src/components/social/notification-bell.tsx
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/notifications.ts src/components/social/notification-bell.tsx messages/es.json
git commit -m "feat: extend notifications for review_liked/review_commented with deep links"
```

---

### Task 4: `src/lib/social/interactions.ts` — batch read layer

**Files:**
- Create: `src/lib/social/interactions.ts`

**Interfaces:**
- Produces: `type TargetType = "diary_entry" | "episode_watch"`, `type InteractionComment = { id, authorId, author, initials, body, createdAt, isOwn }`, `type InteractionSummary = { reactionCount, viewerReacted, commentCount, comments }`, `function getInteractionSummary(supabase, targetType: TargetType, targetIds: string[]): Promise<Map<string, InteractionSummary>>` (keyed by `targetId`). Consumed by Task 6 (`get-community.ts`/`get-episode-reviews.ts`) and Task 5 (`interaction-actions.ts` imports `TargetType`).

- [ ] **Step 1: Write `src/lib/social/interactions.ts`**

```ts
import type { createClient } from "@/lib/supabase/server";

// Capa de lectura de interacciones (EPIC-05, Bloque B, SD-3). Batch-fetch de
// reacciones/comentarios para un conjunto de targets del mismo tipo — cada
// call site solo trabaja con un tipo a la vez (get-community.ts con
// diary_entry, get-episode-reviews.ts con episode_watch), así que no hace
// falta mezclar tipos en una misma llamada. Las mutaciones viven en
// src/lib/social/interaction-actions.ts ("use server").

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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

export type InteractionSummary = {
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
};

// Hilo esperado corto (Reddit-lite, Q del diseño); sin paginación en este MVP.
const COMMENT_PREFETCH_LIMIT = 20;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

async function resolveAuthorNames(
  supabase: SupabaseServerClient,
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name")
    .in("user_id", userIds);
  if (error) throw error;
  return new Map(
    (data ?? [])
      .filter(
        (p): p is typeof p & { user_id: string } => p.user_id != null,
      )
      .map((p) => [p.user_id, p.display_name || p.username || "—"]),
  );
}

export async function getInteractionSummary(
  supabase: SupabaseServerClient,
  targetType: TargetType,
  targetIds: string[],
): Promise<Map<string, InteractionSummary>> {
  const summaries = new Map<string, InteractionSummary>();
  if (targetIds.length === 0) return summaries;

  for (const id of targetIds) {
    summaries.set(id, {
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [reactionsResult, commentsResult] = await Promise.all([
    supabase
      .from("reactions")
      .select("target_id, user_id")
      .eq("target_type", targetType)
      .in("target_id", targetIds),
    supabase
      .from("comments")
      .select("id, target_id, author_id, body, created_at")
      .eq("target_type", targetType)
      .in("target_id", targetIds)
      .order("created_at", { ascending: true }),
  ]);

  if (reactionsResult.error) throw reactionsResult.error;
  if (commentsResult.error) throw commentsResult.error;

  for (const r of reactionsResult.data ?? []) {
    const s = summaries.get(r.target_id);
    if (!s) continue;
    s.reactionCount += 1;
    if (user && r.user_id === user.id) s.viewerReacted = true;
  }

  const commentRows = commentsResult.data ?? [];
  const authorIds = [...new Set(commentRows.map((c) => c.author_id))];
  const nameByAuthor = await resolveAuthorNames(supabase, authorIds);

  const seenPerTarget = new Map<string, number>();
  for (const c of commentRows) {
    const s = summaries.get(c.target_id);
    if (!s) continue;
    s.commentCount += 1;
    const seen = (seenPerTarget.get(c.target_id) ?? 0) + 1;
    seenPerTarget.set(c.target_id, seen);
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

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/social/interactions.ts
git commit -m "feat: add batch read layer for review reactions/comments"
```

---

### Task 5: `src/lib/social/interaction-actions.ts` — write layer + notification hook

**Files:**
- Create: `src/lib/social/interaction-actions.ts`

**Interfaces:**
- Consumes: `TargetType` from `src/lib/social/interactions.ts`; `notify()` from `src/lib/social/notifications.ts` (Task 3's extended signature).
- Produces: `"use server"` functions `toggleReaction(targetType: TargetType, targetId: string): Promise<void>`, `addComment(targetType: TargetType, targetId: string, body: string): Promise<void>`, `deleteComment(commentId: string): Promise<void>`. Consumed by Task 7 (`ReviewInteractions` component).

- [ ] **Step 1: Write `src/lib/social/interaction-actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify } from "./notifications";
import type { TargetType } from "./interactions";

// Mutaciones de reacciones/comentarios (EPIC-05, Bloque B, SD-3). Sin edición
// de comentarios ni borrado por el dueño del contenido en este MVP (decisión
// explícita del diseño) — solo alta y borrado de lo propio.

// Revalida las tres páginas de ficha: la reseña puede vivir en cualquiera.
function revalidateItemPages() {
  revalidatePath("/libro/[id]", "page");
  revalidatePath("/pelicula/[id]", "page");
  revalidatePath("/serie/[id]", "page");
}

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

export async function toggleReaction(
  targetType: TargetType,
  targetId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing, error: selectError } = await supabase
    .from("reactions")
    .select("id")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("user_id", user.id)
    .eq("kind", "like")
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase
      .from("reactions")
      .delete()
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("reactions").insert({
      target_type: targetType,
      target_id: targetId,
      user_id: user.id,
      kind: "like",
    });
    if (error) throw error;

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
  }
  revalidateItemPages();
}

export async function addComment(
  targetType: TargetType,
  targetId: string,
  body: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const trimmed = body.trim();
  if (!trimmed) return;

  const { error } = await supabase.from("comments").insert({
    target_type: targetType,
    target_id: targetId,
    author_id: user.id,
    body: trimmed,
  });
  if (error) throw error;

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
  revalidateItemPages();
}

export async function deleteComment(commentId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("author_id", user.id);
  if (error) throw error;
  revalidateItemPages();
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/social/interaction-actions.ts
git commit -m "feat: add toggleReaction/addComment/deleteComment server actions"
```

---

### Task 6: Wire interaction summaries into `get-community.ts` / `get-episode-reviews.ts`

**Files:**
- Modify: `src/lib/community/get-community.ts`
- Modify: `src/lib/series/get-episode-reviews.ts`

**Interfaces:**
- Consumes: `getInteractionSummary` from `src/lib/social/interactions.ts` (Task 4).
- Produces: `CommunityReview` and `EpisodeReview` both gain `reactionCount: number`, `viewerReacted: boolean`, `commentCount: number`, `comments: InteractionComment[]`. Consumed by Task 7 (`CommunityPanel`).

- [ ] **Step 1: Update `src/lib/community/get-community.ts`**

Add the import at the top:

```ts
import { getInteractionSummary, type InteractionComment } from "@/lib/social/interactions";
```

Extend the `CommunityReview` type:

```ts
export type CommunityReview = {
  id: string;
  author: string;
  initials: string;
  finishedOn: string; // ISO date
  rating: number | null; // 1–10
  text: string;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
};
```

Replace the final block of the function — find:

```ts
      reviews = rows.map((r) => {
        const author = nameByUser.get(r.user_id) ?? "—";
        return {
          id: r.id,
          author,
          initials: initials(author) || "?",
          finishedOn: r.finished_on,
          rating: r.rating,
          text: (r.review ?? "").trim(),
        };
      });
    }
  }

  return { avgRating, ratingCount: ratings.length, distribution, reviews };
}
```

with:

```ts
      reviews = rows.map((r) => {
        const author = nameByUser.get(r.user_id) ?? "—";
        return {
          id: r.id,
          author,
          initials: initials(author) || "?",
          finishedOn: r.finished_on,
          rating: r.rating,
          text: (r.review ?? "").trim(),
          reactionCount: 0,
          viewerReacted: false,
          commentCount: 0,
          comments: [],
        };
      });

      const summaries = await getInteractionSummary(
        supabase,
        "diary_entry",
        reviews.map((r) => r.id),
      );
      reviews = reviews.map((r) => ({ ...r, ...summaries.get(r.id) }));
    }
  }

  return { avgRating, ratingCount: ratings.length, distribution, reviews };
}
```

- [ ] **Step 2: Update `src/lib/series/get-episode-reviews.ts`**

Add the import at the top:

```ts
import { getInteractionSummary, type InteractionComment } from "@/lib/social/interactions";
```

Extend the `EpisodeReview` type:

```ts
export type EpisodeReview = {
  id: string;
  author: string;
  initials: string;
  season: number;
  episode: number;
  episodeTitle: string | null;
  watchedOn: string; // ISO date
  rating: number | null; // 1–10
  text: string;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
};
```

Replace the final `return` statement — find:

```ts
  return withText.map((r) => {
    const author = nameByUser.get(r.user_id) ?? "—";
    return {
      id: r.id,
      author,
      initials: initials(author) || "?",
      season: r.season_number,
      episode: r.episode_number,
      episodeTitle: titleByEp.get(`${r.season_number}:${r.episode_number}`) ?? null,
      watchedOn: r.watched_on,
      rating: r.rating,
      text: (r.review ?? "").trim(),
    };
  });
}
```

with:

```ts
  const reviews = withText.map((r) => {
    const author = nameByUser.get(r.user_id) ?? "—";
    return {
      id: r.id,
      author,
      initials: initials(author) || "?",
      season: r.season_number,
      episode: r.episode_number,
      episodeTitle: titleByEp.get(`${r.season_number}:${r.episode_number}`) ?? null,
      watchedOn: r.watched_on,
      rating: r.rating,
      text: (r.review ?? "").trim(),
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    };
  });

  const summaries = await getInteractionSummary(
    supabase,
    "episode_watch",
    reviews.map((r) => r.id),
  );
  return reviews.map((r) => ({ ...r, ...summaries.get(r.id) }));
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/community/get-community.ts src/lib/series/get-episode-reviews.ts
git commit -m "feat: merge reaction/comment summaries into review-fetching functions"
```

---

### Task 7: `ReviewInteractions` UI component + `CommentIcon`

**Files:**
- Modify: `src/components/ui/icons.tsx`
- Create: `src/components/social/review-interactions.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `toggleReaction`, `addComment`, `deleteComment` from `src/lib/social/interaction-actions.ts` (Task 5); `TargetType`, `InteractionComment` from `src/lib/social/interactions.ts` (Task 4).
- Produces: `<ReviewInteractions targetType targetId reactionCount viewerReacted commentCount comments viewerLoggedIn />`. Consumed by Task 8 (`CommunityPanel`).

- [ ] **Step 1: Add `CommentIcon` to `src/components/ui/icons.tsx`**

Append at the end of the file (after `BellIcon`):

```tsx
export function CommentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 5h16v11H8l-4 4V5Z" />
    </Icon>
  );
}
```

- [ ] **Step 2: Add i18n keys for the interaction UI**

In `messages/es.json`, inside the `"social"` object, add these keys right after `"backToProfile"`:

```json
    "backToProfile": "Volver al perfil",
    "like": "Me gusta",
    "commentsCount": "{count, plural, one {1 comentario} other {# comentarios}}",
    "writeComment": "Escribe un comentario…",
    "postComment": "Comentar",
    "deleteComment": "Borrar"
```

- [ ] **Step 3: Write `src/components/social/review-interactions.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { HeartIcon, CommentIcon } from "@/components/ui/icons";
import {
  toggleReaction,
  addComment,
  deleteComment,
} from "@/lib/social/interaction-actions";
import type { InteractionComment, TargetType } from "@/lib/social/interactions";

// Like + hilo de comentarios bajo una reseña (EPIC-05, Bloque B, SD-3). Mismo
// patrón que FollowButton: el estado se deriva de las props revalidadas por el
// servidor tras cada acción (revalidatePath), sin estado optimista local. Los
// comentarios ya vienen prefetcheados (capados) desde el servidor — expandir
// no dispara ningún fetch nuevo, solo muestra/oculta.
export function ReviewInteractions({
  targetType,
  targetId,
  reactionCount,
  viewerReacted,
  commentCount,
  comments,
  viewerLoggedIn,
}: {
  targetType: TargetType;
  targetId: string;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("social");
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");

  if (!viewerLoggedIn) {
    return (
      <div className="flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <HeartIcon className="h-4 w-4" /> {reactionCount}
        </span>
        <Link
          href="/login"
          className="flex items-center gap-1.5 hover:text-foreground"
        >
          <CommentIcon className="h-4 w-4" />
          {t("commentsCount", { count: commentCount })}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex items-center gap-4 text-xs">
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => toggleReaction(targetType, targetId))}
          className={`flex items-center gap-1.5 transition-colors ${
            viewerReacted
              ? "text-accent"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <HeartIcon
            className="h-4 w-4"
            fill={viewerReacted ? "currentColor" : "none"}
          />
          {reactionCount}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <CommentIcon className="h-4 w-4" />
          {t("commentsCount", { count: commentCount })}
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2">
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = draft.trim();
              if (!value) return;
              setDraft("");
              startTransition(() => addComment(targetType, targetId, value));
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("writeComment")}
              className="flex-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={isPending || !draft.trim()}
              className="text-xs font-medium text-accent disabled:opacity-50"
            >
              {t("postComment")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/ui/icons.tsx src/components/social/review-interactions.tsx
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/icons.tsx src/components/social/review-interactions.tsx messages/es.json
git commit -m "feat: add ReviewInteractions component (like + comment thread)"
```

---

### Task 8: Wire `ReviewInteractions` into `CommunityPanel` and the three item pages

**Files:**
- Modify: `src/components/detail/community-panel.tsx`
- Modify: `src/app/libro/[id]/page.tsx`
- Modify: `src/app/pelicula/[id]/page.tsx`
- Modify: `src/app/serie/[id]/page.tsx`

**Interfaces:**
- Consumes: `ReviewInteractions` from `src/components/social/review-interactions.tsx` (Task 7); `CommunityReview`/`EpisodeReview` enriched fields from Task 6.

- [ ] **Step 1: Add `viewerLoggedIn` prop and render `ReviewInteractions` in `community-panel.tsx`**

Add the import:

```tsx
import { ReviewInteractions } from "@/components/social/review-interactions";
```

Change the function signature:

```tsx
export async function CommunityPanel({
  itemType,
  community,
  episodeReviews,
  viewerLoggedIn,
}: {
  itemType: ItemType;
  community: Community;
  episodeReviews?: EpisodeReview[];
  viewerLoggedIn: boolean;
}) {
```

In the episode-reviews branch, find the closing of each review `<article>` — locate:

```tsx
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {review.text}
                  </p>
                </article>
              ))}
            </div>
          )
        ) : community.reviews.length === 0 ? (
```

and change it to:

```tsx
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {review.text}
                  </p>
                  <ReviewInteractions
                    targetType="episode_watch"
                    targetId={review.id}
                    reactionCount={review.reactionCount}
                    viewerReacted={review.viewerReacted}
                    commentCount={review.commentCount}
                    comments={review.comments}
                    viewerLoggedIn={viewerLoggedIn}
                  />
                </article>
              ))}
            </div>
          )
        ) : community.reviews.length === 0 ? (
```

And for the `community.reviews` branch, find the final closing of that `<article>` — locate:

```tsx
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {review.text}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

and change it to:

```tsx
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {review.text}
                </p>
                <ReviewInteractions
                  targetType="diary_entry"
                  targetId={review.id}
                  reactionCount={review.reactionCount}
                  viewerReacted={review.viewerReacted}
                  commentCount={review.commentCount}
                  comments={review.comments}
                  viewerLoggedIn={viewerLoggedIn}
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Pass `viewerLoggedIn` from `src/app/libro/[id]/page.tsx`**

Find:

```tsx
        community={<CommunityPanel itemType="book" community={community} />}
```

Replace with:

```tsx
        community={
          <CommunityPanel
            itemType="book"
            community={community}
            viewerLoggedIn={Boolean(user)}
          />
        }
```

- [ ] **Step 3: Pass `viewerLoggedIn` from `src/app/pelicula/[id]/page.tsx`**

Find:

```tsx
            <CommunityPanel itemType="movie" community={community} />
```

Replace with:

```tsx
            <CommunityPanel
              itemType="movie"
              community={community}
              viewerLoggedIn={Boolean(user)}
            />
```

- [ ] **Step 4: Pass `viewerLoggedIn` from `src/app/serie/[id]/page.tsx`**

Find:

```tsx
            <CommunityPanel
              itemType="series"
              community={community}
              episodeReviews={episodeReviews}
            />
```

Replace with:

```tsx
            <CommunityPanel
              itemType="series"
              community={community}
              episodeReviews={episodeReviews}
              viewerLoggedIn={Boolean(user)}
            />
```

- [ ] **Step 5: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/detail/community-panel.tsx "src/app/libro/[id]/page.tsx" "src/app/pelicula/[id]/page.tsx" "src/app/serie/[id]/page.tsx"
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/detail/community-panel.tsx "src/app/libro/[id]/page.tsx" "src/app/pelicula/[id]/page.tsx" "src/app/serie/[id]/page.tsx"
git commit -m "feat: render ReviewInteractions on book/movie/series review cards"
```

---

### Task 9: Deep-linkable Comunidad tab (`?tab=` query param)

**Files:**
- Modify: `src/components/detail/item-detail-tabs.tsx`

**Interfaces:**
- Produces: `ItemDetailTabs` now initializes its active tab from `?tab=` in the URL (falling back to `"info"` exactly as before) and keeps the URL in sync on tab clicks. No prop signature change — purely internal behavior, consumed implicitly by anything linking to `<item>?tab=community` (Task 3's `resolveReviewHrefs`).

- [ ] **Step 1: Rewrite `src/components/detail/item-detail-tabs.tsx`**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

type TabId = "info" | "episodes" | "community" | "log";
const VALID_TABS: readonly string[] = ["info", "episodes", "community", "log"];

// Client tab switcher for the item detail page. Slots are server-rendered on
// the page and handed in as props, so data fetching stays on the server.
// `episodes` es opcional: solo las series lo pasan (§7.x). El tab inicial se
// lee de `?tab=` (usado por los deep links de notificaciones, EPIC-05 Bloque B)
// y por defecto sigue siendo "info" si no hay query param, igual que antes.
export function ItemDetailTabs({
  itemType,
  labels,
  info,
  episodes,
  community,
  log,
}: {
  itemType: ItemType;
  labels: Partial<Record<TabId, string>>;
  info: ReactNode;
  episodes?: ReactNode;
  community: ReactNode;
  log: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const initialTab: TabId =
    urlTab && VALID_TABS.includes(urlTab) ? (urlTab as TabId) : "info";
  const [tab, setTab] = useState<TabId>(initialTab);
  const accent = MEDIA_ACCENT[itemType];
  const order: TabId[] = episodes
    ? ["info", "episodes", "community", "log"]
    : ["info", "community", "log"];
  const slots: Record<TabId, ReactNode> = { info, episodes, community, log };

  function selectTab(id: TabId) {
    setTab(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id === "info") params.delete("tab");
    else params.set("tab", id);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex gap-6 border-b border-border">
        {order.map((id) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              className={`-mb-px border-b-2 px-1 pb-3 font-mono text-xs tracking-wider uppercase transition-colors ${
                isActive
                  ? `${accent.border} text-foreground`
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {labels[id]}
            </button>
          );
        })}
      </div>

      <div className="pt-6">{slots[tab]}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/detail/item-detail-tabs.tsx
```

Expected: both clean.

- [ ] **Step 3: Manual verification**

```bash
npm run dev
```

In a browser: navigate to any `/libro/[id]` page, click the "Comunidad" tab, confirm the URL now shows `?tab=community`; reload the page and confirm it lands directly on the Comunidad tab; navigate to `/libro/[id]` with no query param and confirm it still defaults to Info. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/components/detail/item-detail-tabs.tsx
git commit -m "feat: make item detail tabs deep-linkable via ?tab= query param"
```

---

### Task 10: Full RLS + browser E2E verification on dev

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Confirm it's listening on `http://localhost:3000` (check the terminal output for "Ready in").

- [ ] **Step 2: End-to-end browser check with two real users**

Using the project's established manual/agent-driven browser verification (see `docs/TESTING.md` for the seeded `devtest` account and how to create/log-in a second disposable test user):

1. As `devtest`, open a book/movie/series with at least one review that has text (or create one via the library "Log" tab).
2. Click the like button on a review written by a different user than `devtest` — confirm the count increments and the heart fills.
3. Click again — confirm it toggles off (count decrements, heart empties). Confirm a page reload preserves this state (i.e., it's actually persisted, not just local UI state).
4. Expand the comment thread, post a comment, confirm it appears in the list without a full page reload (server action + revalidatePath).
5. As the review's author (a second logged-in test user, or `devtest` itself if you set up the review under a different account), open the notification bell and confirm a "le gustó tu reseña" / "comentó tu reseña" notification appears with the correct actor name.
6. Click that notification and confirm it navigates to `<item>?tab=community` and lands directly on the Comunidad tab.
7. As the comment's own author, delete the comment and confirm it disappears; confirm no delete control is shown on other users' comments.
8. Log out, view the same item as a logged-out visitor, and confirm the like/comment counts are visible but the interactive controls are replaced by a login link.

Fix anything that doesn't match before proceeding. Stop the dev server when done.

- [ ] **Step 3: Clean up any test data created during verification**

If you created disposable test users or extra reviews for this check, delete them via SQL against dev (same Management API pattern as Task 1, targeting the specific rows you created — never a blanket delete). Confirm `devtest`'s own state (`is_public = true`, no leftover reviews you didn't intend to keep) is unchanged.

---

### Task 11: Apply to prod, update docs, close out the block

**Files:**
- Modify: `docs/requirements/social-epic.md`
- Modify: `docs/REQUIREMENTS.md`

- [ ] **Step 1: Apply the migration to prod**

Use `mcp__supabase__apply_migration` with `name: "review_interactions"` and the exact SQL from Task 1, Step 1 (the tool is pinned to the prod project ref — do not pass a project ref).

- [ ] **Step 2: Verify prod**

Run `mcp__supabase__get_advisors` with `type: "security"` and confirm no *new* findings beyond the pre-existing accepted ones (the `security_definer_view`/`anon_security_definer_function_executable` warnings for `can_view_target` are expected and match the existing pattern for `can_view_profile`/`is_club_member` — same accepted tradeoff, not a regression).

- [ ] **Step 3: Update `docs/requirements/social-epic.md`**

Mark `E5.B1`–`E5.B4` as done (`- [x]`) in the Bloque B section, and add a status note at the top of that section matching the style already used for Bloques A/D (built + verified dev+prod, RLS battery, browser E2E, deep-link confirmed). Note the file-naming deviation from the original sketch (`interactions.ts`/`interaction-actions.ts` instead of separate `reactions.ts`/`comments.ts`).

- [ ] **Step 4: Update `docs/REQUIREMENTS.md`**

Add a dated row to the §9 decision table (same style as the existing EPIC-05 Bloque A/D rows) documenting SD-3's implementation: the `reactions`/`comments` polymorphic tables, `can_view_target()` helper, the deep-linkable Comunidad tab, and the `review_liked`/`review_commented` notification hook.

- [ ] **Step 5: Commit**

```bash
git add docs/requirements/social-epic.md docs/REQUIREMENTS.md
git commit -m "docs: mark EPIC-05 Bloque B done (dev+prod verified)"
```
