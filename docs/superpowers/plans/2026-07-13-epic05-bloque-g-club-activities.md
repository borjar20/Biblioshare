# EPIC-05 Bloque G — Club Activities Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the generic club-activities engine (E5.G1–G3): propose/activate/finish/archive lifecycle, opt-in participation, a shared item pool, and per-item opinions — fully exposed now, with zero type-specific behavior (that's Bloque H).

**Architecture:** One `club_activities` table + three shared sub-tables (`club_activity_participants`/`club_activity_items`/`club_activity_opinions`), all gated by the existing `is_club_member()`/`has_min_club_role()` helpers (Bloque E) plus one new `is_activity_participant()` helper. Status transitions (`activate`/`finish`/`archive`) are `SECURITY DEFINER` RPCs, matching the established pattern from Bloques E/F for any authorization logic beyond simple self-ownership. `config jsonb` exists in the schema per SD-8 but is completely untouched by this bloque's code — Bloque H reads/writes it later.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres/Auth/RLS, TypeScript, next-intl, Tailwind.

## Global Constraints

- Scope is exactly E5.G1–E5.G3 — no type-specific behavior (tierlist ranking, buddy-read checkpoints, challenge criteria interpretation) — that's Bloque H. `config jsonb` is not read or written anywhere in this bloque's code.
- The full lifecycle is exposed now (propose → activate → join → add items → opine → finish), not held back — an activity created today is functionally usable end-to-end, just generic across all 4 `kind` values until Bloque H adds real per-type behavior.
- `activity_kind` is an open enum (`buddy_read`/`tierlist`/`list_challenge`/`criteria_challenge`) — more values added later via `ALTER TYPE ADD VALUE`, never new tables (SD-8).
- Any active club member can propose an activity (no role gate); `activateActivity`/`archiveActivity` are moderator+; `finishActivity` is the activity's creator **or** moderator+.
- `archiveActivity` is reachable from `proposed` (rejecting a proposal) or `active` (cancelling one in progress) — same RPC, same permission gate, two source states.
- Status transitions go through `SECURITY DEFINER` RPCs, never plain client `UPDATE`s gated by RLS — avoids the `WITH CHECK`-doesn't-diff-old-vs-new class of bug already found twice in this project.
- Opinions (`club_activity_opinions`) are visible and writable only to activity participants — a club member who hasn't joined the activity sees that it exists and who's joined, but not what participants think, until they join too.
- The item pool (`club_activity_items`) is club-visible (any member sees it) but only participant-writable; deleting an item is allowed for whoever added it, or any moderator+ of the club (no participant-status re-check needed for either branch, matching `club_posts delete self or moderate`'s precedent).
- Notifications fan out on **propose** and **activate** (not join/finish/archive), same best-effort loop-over-active-members pattern as `club_post` (Bloque F) — deep-linked to `/club/[slug]/actividad/[id]` since, unlike club posts, activities have their own dedicated page.
- Run `npx tsc --noEmit` and `npx eslint <touched files>` after every task that touches `.ts`/`.tsx` files.
- Windows/PowerShell environment — use the Bash tool (Git Bash) for shell commands shown below, not native PowerShell cmdlets.
- Per `docs/TESTING.md`, UI verification is a manual test checklist document, not an automated browser-driving subagent.
- Full design rationale: `docs/superpowers/specs/2026-07-13-epic05-bloque-g-club-activities-design.md`.

---

### Task 1: Migration — `club_activities` schema, RLS, RPCs, notification types

**Files:**
- Create: `supabase/migrations/20260713_club_activities.sql`

**Interfaces:**
- Consumes: `public.clubs`, `public.club_members`, `public.is_club_member(uuid)`, `public.has_min_club_role(uuid, public.club_role)` (Bloque E); `public.item_type` (existing catalog enum); `public.notification_type` (Bloque D).
- Produces: tables `club_activities`, `club_activity_participants`, `club_activity_items`, `club_activity_opinions`; types `activity_kind`, `activity_status`; function `is_activity_participant(uuid)`; RPCs `activate_club_activity(uuid)`, `finish_club_activity(uuid)`, `archive_club_activity(uuid)`; `notification_type` gains `club_activity_proposed`, `club_activity_activated`. Consumed by Task 2 (types sync), Tasks 3–9 (domain/UI), Task 10 (RLS battery reference).

- [ ] **Step 1: Write `supabase/migrations/20260713_club_activities.sql`**

```sql
-- EPIC-05 Bloque G — Motor genérico de actividades de club. Ver
-- docs/superpowers/specs/2026-07-13-epic05-bloque-g-club-activities-design.md (SD-8 en
-- docs/requirements/social-epic.md fijó el patrón: una tabla núcleo + sub-tablas
-- compartidas + extensión por tipo solo donde hace falta -- Bloque H añade esa extensión,
-- este bloque no la necesita).

create type public.activity_kind as enum ('buddy_read', 'tierlist', 'list_challenge', 'criteria_challenge');
-- Enum abierto -- futuros kinds se añaden como valores nuevos vía ALTER TYPE ADD VALUE,
-- nunca como tablas nuevas (SD-8). A diferencia de target_kind en Bloque F, estos valores
-- NO se referencian como literal en ningún otro sitio de este mismo script (solo se leen
-- desde la capa de app, en un deploy totalmente aparte) -- no hace falta el `commit;`
-- intermedio que sí hizo falta allí.
create type public.activity_status as enum ('proposed', 'active', 'finished', 'archived');

create table public.club_activities (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  kind public.activity_kind not null,
  title text not null,
  description text,
  status public.activity_status not null default 'proposed',
  config jsonb,              -- opaco a SQL/RLS -- interpretado en la capa de app por kind
                              -- (Bloque H). Este bloque no lo lee ni lo escribe en ningún
                              -- sitio de su propio código.
  created_by uuid not null references auth.users(id),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

create table public.club_activity_participants (
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create table public.club_activity_items (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  added_by uuid not null references auth.users(id),
  position smallint not null,
  created_at timestamptz not null default now()
);

create table public.club_activity_opinions (
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  rating smallint,
  comment text,
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id, item_type, item_id)
);

create index idx_club_activities_club on public.club_activities (club_id, created_at desc);
create index idx_club_activity_items_activity on public.club_activity_items (activity_id, position);
create index idx_club_activity_opinions_activity on public.club_activity_opinions (activity_id);

comment on table public.club_activities is 'Actividades de club (EPIC-05 Bloque G, SD-8). kind es enum abierto; config es opaco, interpretado por tipo en la capa de app (Bloque H). Ciclo de vida: proposed -> active -> finished, o proposed/active -> archived.';
comment on table public.club_activity_participants is 'Opt-in a una actividad. Gatea acceso a club_activity_items (escritura) y club_activity_opinions (lectura+escritura) vía is_activity_participant().';
comment on table public.club_activity_items is 'Pool de ítems de la actividad (la lista de un reto, los ítems a rankear de una tierlist, el único ítem de un buddy_read). Genérico -- la interpretación del pool (orden de ranking, checkpoints) es de Bloque H.';
comment on table public.club_activity_opinions is 'Opinión (rating/comment) de un participante sobre un ítem, en el contexto de la actividad -- distinta de diary_entries.review. Una fila por usuario+ítem+actividad (upsert para cambiarla).';

-- club_activity_participants no depende de esta función (usa auth.uid() directo en sus
-- propias políticas), así que no hay riesgo de recursión estructural (42P17) al llamarla
-- desde club_activity_items/club_activity_opinions -- mismo patrón anti-recursión que
-- is_club_member(), pero sin el riesgo bidireccional que sí tuvo clubs<->club_members en
-- Bloque E (allí ambas tablas se referenciaban entre sí).
create or replace function public.is_activity_participant(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_activity_participants
    where activity_id = p_activity_id and user_id = auth.uid()
  );
$$;

comment on function public.is_activity_participant(uuid) is 'True si el usuario actual se ha unido a esta actividad (EPIC-05 Bloque G). Gatea la escritura del pool de ítems y la lectura+escritura de opiniones.';

-- ── RPCs SECURITY DEFINER para transiciones de estado ───────────────────────
-- Mismo patrón que Bloques E/F: cambios con lógica de autorización no trivial van por RPC,
-- nunca por UPDATE de cliente gateado por RLS.
create or replace function public.activate_club_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_status public.activity_status;
begin
  select club_id, status into v_club_id, v_status from public.club_activities where id = p_activity_id;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_status <> 'proposed' then
    raise exception 'activity is not in proposed state';
  end if;
  update public.club_activities set status = 'active' where id = p_activity_id;
end;
$$;

revoke execute on function public.activate_club_activity(uuid) from public, anon;
grant execute on function public.activate_club_activity(uuid) to authenticated;

-- finish_club_activity: creador O moderator+ (a diferencia de activate/archive, que son
-- solo moderator+) -- menor fricción para que quien propuso la actividad pueda cerrarla.
create or replace function public.finish_club_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_status public.activity_status;
  v_created_by uuid;
begin
  select club_id, status, created_by into v_club_id, v_status, v_created_by
    from public.club_activities where id = p_activity_id;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if v_created_by <> auth.uid() and not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_status <> 'active' then
    raise exception 'activity is not active';
  end if;
  update public.club_activities set status = 'finished' where id = p_activity_id;
end;
$$;

revoke execute on function public.finish_club_activity(uuid) from public, anon;
grant execute on function public.finish_club_activity(uuid) to authenticated;

-- archive_club_activity: generaliza "rechazar una propuesta" y "cancelar una activa" en una
-- sola acción, moderator+, alcanzable desde 'proposed' o 'active' (decisión de sesión).
create or replace function public.archive_club_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_status public.activity_status;
begin
  select club_id, status into v_club_id, v_status from public.club_activities where id = p_activity_id;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_status not in ('proposed', 'active') then
    raise exception 'activity cannot be archived from its current state';
  end if;
  update public.club_activities set status = 'archived' where id = p_activity_id;
end;
$$;

revoke execute on function public.archive_club_activity(uuid) from public, anon;
grant execute on function public.archive_club_activity(uuid) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.club_activities enable row level security;

create policy "club_activities select member" on public.club_activities
  for select to authenticated
  using (public.is_club_member(club_id));

-- Cualquier miembro activo puede proponer (sin gateo de rol, mismo criterio que publicar
-- en el feed de club, Bloque F). with check fija status='proposed' -- no se puede insertar
-- directamente como 'active'.
create policy "club_activities insert member" on public.club_activities
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_club_member(club_id)
    and status = 'proposed'
  );

-- Sin política UPDATE a propósito -- las transiciones de estado son RPC-only.

alter table public.club_activity_participants enable row level security;

-- Cualquier miembro del club ve quién se ha unido, sin necesidad de unirse él mismo
-- primero -- referencia de un solo sentido a club_activities (que a su vez nunca
-- referencia esta tabla), sin riesgo de recursión estructural.
create policy "club_activity_participants select member" on public.club_activity_participants
  for select to authenticated
  using (
    exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and public.is_club_member(ca.club_id)
    )
  );

-- Auto-servicio, solo si la actividad está activa -- no puedes unirte a una propuesta
-- todavía no activada ni a una ya finalizada/archivada.
create policy "club_activity_participants insert self" on public.club_activity_participants
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and ca.status = 'active' and public.is_club_member(ca.club_id)
    )
  );

-- Solo tu propia fila (salir) -- sin expulsión por moderador, es una decisión de
-- participación mucho más ligera que la membresía del club en sí (Bloque E).
create policy "club_activity_participants delete self" on public.club_activity_participants
  for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.club_activity_items enable row level security;

create policy "club_activity_items select member" on public.club_activity_items
  for select to authenticated
  using (
    exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and public.is_club_member(ca.club_id)
    )
  );

create policy "club_activity_items insert participant" on public.club_activity_items
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and public.is_activity_participant(activity_id)
  );

-- Quien lo añadió, o moderator+ del club -- deliberadamente SIN exigir
-- is_activity_participant() en ninguna rama (ni para borrar lo tuyo si ya saliste de la
-- actividad, ni para el moderator+ que no se ha unido él mismo) -- mismo criterio que
-- "club_posts delete self or moderate" (Bloque F).
create policy "club_activity_items delete own or moderate" on public.club_activity_items
  for delete to authenticated
  using (
    added_by = (select auth.uid())
    or exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and public.has_min_club_role(ca.club_id, 'moderator')
    )
  );

alter table public.club_activity_opinions enable row level security;

-- Solo participantes -- confirma la lectura de SD-8: ver las opiniones de otros exige
-- haberte unido tú también, no basta con ser miembro del club.
create policy "club_activity_opinions select participant" on public.club_activity_opinions
  for select to authenticated
  using (public.is_activity_participant(activity_id));

create policy "club_activity_opinions insert own" on public.club_activity_opinions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_activity_participant(activity_id)
  );

create policy "club_activity_opinions update own" on public.club_activity_opinions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "club_activity_opinions delete own" on public.club_activity_opinions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── Notificaciones de actividad de club (EPIC-05 Bloque G), mismo patrón de fan-out que
-- club_post (Bloque F). A diferencia de club_post (que enruta al club sin deep-link),
-- estas SÍ enlazan a la página propia de la actividad -- ver Task 3 para su resolución de
-- href.
alter type public.notification_type add value 'club_activity_proposed';
alter type public.notification_type add value 'club_activity_activated';
```

- [ ] **Step 2: Apply the migration to dev**

Use `mcp__supabase__apply_migration` with `name: "club_activities"`, pinned to the dev project ref, with the exact SQL from Step 1.

- [ ] **Step 3: Run the RLS/RPC impersonation battery**

Same pattern as Bloques E/F's Task 1 (`begin; ... rollback;` transaction, `set local role`/`set_config('request.jwt.claims', ...)` to impersonate, `set_config('app.testN', ..., false)` to persist results, final aggregate `select current_setting(...)`, `rollback;`). Run this SQL against **dev**:

```sql
begin;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'rlstest-owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'rlstest-member@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'rlstest-mod@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'rlstest-outsider@example.com');
insert into public.profiles (user_id, username, is_public) values
  ('11111111-1111-1111-1111-111111111111', 'rlstest_owner', true),
  ('22222222-2222-2222-2222-222222222222', 'rlstest_member', true),
  ('33333333-3333-3333-3333-333333333333', 'rlstest_mod', true),
  ('44444444-4444-4444-4444-444444444444', 'rlstest_outsider', true);

-- A crea un club privado (owner), invita a B y C; ambos aceptan; A asciende a C a
-- moderator.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.create_club('rlstest-activities-club', 'RLS Activities Test', 'desc', 'private', null);
insert into public.club_members (club_id, user_id, status)
  values
    ((select id from public.clubs where slug = 'rlstest-activities-club'), '22222222-2222-2222-2222-222222222222', 'invited'),
    ((select id from public.clubs where slug = 'rlstest-activities-club'), '33333333-3333-3333-3333-333333333333', 'invited');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
update public.club_members set status = 'active'
  where club_id = (select id from public.clubs where slug = 'rlstest-activities-club') and user_id = '22222222-2222-2222-2222-222222222222';
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
update public.club_members set status = 'active'
  where club_id = (select id from public.clubs where slug = 'rlstest-activities-club') and user_id = '33333333-3333-3333-3333-333333333333';
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.set_club_member_role(
  (select id from public.clubs where slug = 'rlstest-activities-club'), '33333333-3333-3333-3333-333333333333', 'moderator'
);

-- Test 1: B (miembro normal, no moderator) propone una actividad -- debe funcionar
-- (sin gateo de rol para proponer).
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.club_activities (id, club_id, kind, title, created_by)
  values ('55555555-5555-5555-5555-555555555555',
    (select id from public.clubs where slug = 'rlstest-activities-club'), 'buddy_read', 'Lectura de prueba', '22222222-2222-2222-2222-222222222222');
select set_config('app.test1', 'ok_inserted', false);

-- Test 2: intentar insertar directamente como 'active' (bypass del RPC) debe rechazarse
-- por el WITH CHECK.
do $$
begin
  insert into public.club_activities (club_id, kind, title, created_by, status)
    values ((select id from public.clubs where slug = 'rlstest-activities-club'), 'buddy_read', 'intento', '22222222-2222-2222-2222-222222222222', 'active');
  perform set_config('app.test2', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test2', 'ok_rejected: ' || sqlerrm, false);
end $$;

-- Test 3: D (outsider) no puede ver la actividad del club privado.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select set_config('app.test3', 'count=' || (
  select count(*)::text from public.club_activities where id = '55555555-5555-5555-5555-555555555555'
), false);

-- Test 4: D (outsider) no puede unirse a la actividad.
do $$
begin
  insert into public.club_activity_participants (activity_id, user_id)
    values ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444');
  perform set_config('app.test4', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test4', 'ok_rejected: ' || sqlerrm, false);
end $$;

-- Test 5: B (miembro normal, no moderator) intenta activar su propia propuesta -- debe
-- fallar (activate es moderator+, no basta con ser el creador).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$
begin
  perform public.activate_club_activity('55555555-5555-5555-5555-555555555555');
  perform set_config('app.test5', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test5', 'ok_rejected: ' || sqlerrm, false);
end $$;

-- Test 6: B intenta unirse ANTES de que esté activa -- debe fallar (insert self exige
-- status='active').
do $$
begin
  insert into public.club_activity_participants (activity_id, user_id)
    values ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222');
  perform set_config('app.test6', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test6', 'ok_rejected: ' || sqlerrm, false);
end $$;

-- Test 7: C (moderator) activa la propuesta de B -- debe funcionar.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select public.activate_club_activity('55555555-5555-5555-5555-555555555555');
select set_config('app.test7', 'status=' || (
  select status::text from public.club_activities where id = '55555555-5555-5555-5555-555555555555'
), false);

-- Test 8: ahora sí, B se une (activa) -- debe funcionar.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.club_activity_participants (activity_id, user_id)
  values ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222');
select set_config('app.test8', 'ok_joined', false);

-- Test 9: B (ahora participante) añade un ítem al pool -- debe funcionar.
insert into public.library_entries (id, user_id, item_type, item_id, status)
  values ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'book',
    (select id from public.books limit 1), 'in_progress');
insert into public.club_activity_items (id, activity_id, item_type, item_id, added_by, position)
  values ('77777777-7777-7777-7777-777777777777', '55555555-5555-5555-5555-555555555555', 'book',
    (select item_id from public.library_entries where id = '66666666-6666-6666-6666-666666666666'), '22222222-2222-2222-2222-222222222222', 0);
select set_config('app.test9', 'ok_inserted', false);

-- Test 10: A (miembro del club, NO participante de la actividad) NO puede añadir un ítem
-- al pool.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
begin
  insert into public.club_activity_items (activity_id, item_type, item_id, added_by, position)
    values ('55555555-5555-5555-5555-555555555555', 'book',
      (select item_id from public.library_entries where id = '66666666-6666-6666-6666-666666666666'), '11111111-1111-1111-1111-111111111111', 1);
  perform set_config('app.test10', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test10', 'ok_rejected: ' || sqlerrm, false);
end $$;

-- Test 11: A (miembro, NO participante, PERO moderator? no -- A es owner, sí es
-- moderator+) puede BORRAR el ítem de B aunque A no sea participante de la actividad.
do $$
declare
  v_deleted int;
begin
  with deleted as (
    delete from public.club_activity_items where id = '77777777-7777-7777-7777-777777777777' returning id
  )
  select count(*) into v_deleted from deleted;
  perform set_config('app.test11', 'rows_deleted=' || v_deleted::text, false);
end $$;

-- Test 12: B re-añade el ítem (para los tests de opiniones de abajo), luego C
-- (moderator, NO participante) también puede verlo (select es is_club_member, no
-- is_activity_participant).
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.club_activity_items (id, activity_id, item_type, item_id, added_by, position)
  values ('88888888-8888-8888-8888-888888888888', '55555555-5555-5555-5555-555555555555', 'book',
    (select item_id from public.library_entries where id = '66666666-6666-6666-6666-666666666666'), '22222222-2222-2222-2222-222222222222', 0);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select set_config('app.test12', 'count=' || (
  select count(*)::text from public.club_activity_items where id = '88888888-8888-8888-8888-888888888888'
), false);

-- Test 13: B (participante) añade una opinión sobre el ítem -- debe funcionar.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.club_activity_opinions (activity_id, user_id, item_type, item_id, rating, comment)
  values ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'book',
    (select item_id from public.library_entries where id = '66666666-6666-6666-6666-666666666666'), 8, 'Buena lectura');
select set_config('app.test13', 'ok_inserted', false);

-- Test 14: C (moderator del club, miembro, pero NO participante de la actividad) NO
-- puede ver la opinión de B -- caso de mayor riesgo del bloque.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select set_config('app.test14', 'visible_opinions=' || (
  select count(*)::text from public.club_activity_opinions where activity_id = '55555555-5555-5555-5555-555555555555'
), false);

-- Test 15: C se une a la actividad (ahora sí es participante) -- AHORA sí ve la opinión
-- de B.
insert into public.club_activity_participants (activity_id, user_id)
  values ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333');
select set_config('app.test15', 'visible_opinions=' || (
  select count(*)::text from public.club_activity_opinions where activity_id = '55555555-5555-5555-5555-555555555555'
), false);

-- Test 16: B (creador, NO moderator) finaliza su propia actividad -- debe funcionar
-- (finish es creador O moderator+).
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.finish_club_activity('55555555-5555-5555-5555-555555555555');
select set_config('app.test16', 'status=' || (
  select status::text from public.club_activities where id = '55555555-5555-5555-5555-555555555555'
), false);

-- Test 17: A crea una segunda actividad, propuesta. Otro miembro (B, ni creador ni
-- moderator) intenta finalizarla -- pero primero hay que activarla para llegar al estado
-- 'active' que finish exige; probamos el rechazo de finish sobre una que SÍ está activa
-- pero donde B no es ni creador ni moderator.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.club_activities (id, club_id, kind, title, created_by)
  values ('99999999-9999-9999-9999-999999999999',
    (select id from public.clubs where slug = 'rlstest-activities-club'), 'tierlist', 'Tierlist de prueba', '11111111-1111-1111-1111-111111111111');
select public.activate_club_activity('99999999-9999-9999-9999-999999999999');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$
begin
  perform public.finish_club_activity('99999999-9999-9999-9999-999999999999');
  perform set_config('app.test17', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test17', 'ok_rejected: ' || sqlerrm, false);
end $$;

-- Test 18: C (moderator) archiva esa actividad activa (cancelarla) -- debe funcionar.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select public.archive_club_activity('99999999-9999-9999-9999-999999999999');
select set_config('app.test18', 'status=' || (
  select status::text from public.club_activities where id = '99999999-9999-9999-9999-999999999999'
), false);

-- Test 19: A propone una tercera actividad (queda 'proposed'); C (moderator) la archiva
-- directamente desde 'proposed' (rechazar la propuesta) -- debe funcionar.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.club_activities (id, club_id, kind, title, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select id from public.clubs where slug = 'rlstest-activities-club'), 'criteria_challenge', 'Reto de prueba', '11111111-1111-1111-1111-111111111111');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select public.archive_club_activity('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select set_config('app.test19', 'status=' || (
  select status::text from public.club_activities where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
), false);

-- Test 20: anon no ve nada.
set local role anon;
select set_config('app.test20', 'count=' || (
  select count(*)::text from public.club_activities where club_id = (select id from public.clubs where slug = 'rlstest-activities-club')
), false);

reset role;
select
  current_setting('app.test1', true) as test1_propose_no_role_gate,
  current_setting('app.test2', true) as test2_direct_active_insert_rejected,
  current_setting('app.test3', true) as test3_outsider_blocked_expect_0,
  current_setting('app.test4', true) as test4_outsider_join_rejected,
  current_setting('app.test5', true) as test5_nonmod_activate_rejected,
  current_setting('app.test6', true) as test6_join_before_active_rejected,
  current_setting('app.test7', true) as test7_mod_activates_expect_active,
  current_setting('app.test8', true) as test8_member_joins_active,
  current_setting('app.test9', true) as test9_participant_adds_item,
  current_setting('app.test10', true) as test10_nonparticipant_add_item_rejected,
  current_setting('app.test11', true) as test11_mod_deletes_item_no_participant_needed,
  current_setting('app.test12', true) as test12_mod_sees_pool_no_participant_needed,
  current_setting('app.test13', true) as test13_participant_adds_opinion,
  current_setting('app.test14', true) as test14_nonparticipant_mod_hidden_opinions_expect_0,
  current_setting('app.test15', true) as test15_now_participant_sees_opinions_expect_1,
  current_setting('app.test16', true) as test16_creator_finishes_expect_finished,
  current_setting('app.test17', true) as test17_noncreator_nonmod_finish_rejected,
  current_setting('app.test18', true) as test18_mod_archives_active_expect_archived,
  current_setting('app.test19', true) as test19_mod_archives_proposed_expect_archived,
  current_setting('app.test20', true) as test20_anon_blocked_expect_0;

rollback;
```

Confirm: test1 = `ok_inserted`, test2 = `ok_rejected: ...`, test3 = `count=0`, test4 = `ok_rejected: ...`, test5 = `ok_rejected: ...`, test6 = `ok_rejected: ...`, test7 = `status=active`, test8 = `ok_joined`, test9 = `ok_inserted`, test10 = `ok_rejected: ...`, test11 = `rows_deleted=1`, test12 = `count=1`, test13 = `ok_inserted`, test14 = `visible_opinions=0`, test15 = `visible_opinions=1`, test16 = `status=finished`, test17 = `ok_rejected: ...`, test18 = `status=archived`, test19 = `status=archived`, test20 = `count=0`. If any test doesn't match, fix the migration and re-run Steps 2–3 (drop-and-retry: `drop table if exists public.club_activity_opinions, public.club_activity_items, public.club_activity_participants, public.club_activities cascade; drop type if exists public.activity_kind, public.activity_status cascade; drop function if exists public.is_activity_participant, public.activate_club_activity, public.finish_club_activity, public.archive_club_activity cascade;` — the `alter type notification_type add value` statements can't be dropped this way; re-running the migration is idempotent for those since a repeat `add value` on an already-present value errors harmlessly and can be commented out on retry if needed).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260713_club_activities.sql
git commit -m "feat: add club_activities schema, RLS, and RPCs for EPIC-05 Bloque G"
```

---

### Task 2: `schema-baseline.sql` + `database.types.ts` patch

**Files:**
- Modify: `supabase/schema-baseline.sql` (append at end)
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: `supabase/migrations/20260713_club_activities.sql` (Task 1).
- Produces: TypeScript types `Database["public"]["Tables"]["club_activities"|"club_activity_participants"|"club_activity_items"|"club_activity_opinions"]`, `Database["public"]["Enums"]["activity_kind"|"activity_status"]`, extended `Database["public"]["Enums"]["notification_type"]`, `Database["public"]["Functions"]["activate_club_activity"|"finish_club_activity"|"archive_club_activity"]`.

- [ ] **Step 1: Append the migration SQL to `schema-baseline.sql`**

Append the entire content of `supabase/migrations/20260713_club_activities.sql` (written in Task 1) verbatim at the very end of `supabase/schema-baseline.sql`, preceded by:

```sql


-- ============================================================
-- 20260713_club_activities.sql (EPIC-05 Bloque G)
-- ============================================================
```

- [ ] **Step 2: Patch `database.types.ts` — add table types**

Find the end of the `club_poll_votes` block in the `Tables` section (ends right before `comments: {`) and insert immediately after it:

```ts
      club_activities: {
        Row: {
          club_id: string
          config: Json | null
          created_at: string
          created_by: string
          description: string | null
          ends_on: string | null
          id: string
          kind: Database["public"]["Enums"]["activity_kind"]
          starts_on: string | null
          status: Database["public"]["Enums"]["activity_status"]
          title: string
        }
        Insert: {
          club_id: string
          config?: Json | null
          created_at?: string
          created_by: string
          description?: string | null
          ends_on?: string | null
          id?: string
          kind: Database["public"]["Enums"]["activity_kind"]
          starts_on?: string | null
          status?: Database["public"]["Enums"]["activity_status"]
          title: string
        }
        Update: {
          club_id?: string
          config?: Json | null
          created_at?: string
          created_by?: string
          description?: string | null
          ends_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["activity_kind"]
          starts_on?: string | null
          status?: Database["public"]["Enums"]["activity_status"]
          title?: string
        }
        Relationships: []
      }
      club_activity_participants: {
        Row: {
          activity_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: []
      }
      club_activity_items: {
        Row: {
          activity_id: string
          added_by: string
          created_at: string
          id: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          position: number
        }
        Insert: {
          activity_id: string
          added_by: string
          created_at?: string
          id?: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          position: number
        }
        Update: {
          activity_id?: string
          added_by?: string
          created_at?: string
          id?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          position?: number
        }
        Relationships: []
      }
      club_activity_opinions: {
        Row: {
          activity_id: string
          comment: string | null
          created_at: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          rating: number | null
          user_id: string
        }
        Insert: {
          activity_id: string
          comment?: string | null
          created_at?: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          rating?: number | null
          user_id: string
        }
        Update: {
          activity_id?: string
          comment?: string | null
          created_at?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          rating?: number | null
          user_id?: string
        }
        Relationships: []
      }
```

- [ ] **Step 3: Patch `database.types.ts` — add enums, extend `notification_type`**

Find the `Enums: {` block and add `activity_kind`/`activity_status`, and update the existing `notification_type` line:

```ts
      activity_kind: "buddy_read" | "tierlist" | "list_challenge" | "criteria_challenge"
      activity_status: "proposed" | "active" | "finished" | "archived"
      notification_type: "follow_request" | "new_follower" | "follow_accepted" | "review_liked" | "review_commented" | "club_invite" | "club_invite_accepted" | "club_post" | "club_post_liked" | "club_post_commented" | "comment_liked" | "club_activity_proposed" | "club_activity_activated"
```

- [ ] **Step 4: Patch `database.types.ts` — add `Functions` block entries**

Find `Functions: {` inside `Database["public"]` and add:

```ts
      activate_club_activity: {
        Args: { p_activity_id: string }
        Returns: undefined
      }
      finish_club_activity: {
        Args: { p_activity_id: string }
        Returns: undefined
      }
      archive_club_activity: {
        Args: { p_activity_id: string }
        Returns: undefined
      }
```

- [ ] **Step 5: Patch `database.types.ts` — extend `Constants`**

Find `export const Constants = { public: { Enums: {` and add/update:

```ts
      activity_kind: ["buddy_read", "tierlist", "list_challenge", "criteria_challenge"],
      activity_status: ["proposed", "active", "finished", "archived"],
      notification_type: ["follow_request", "new_follower", "follow_accepted", "review_liked", "review_commented", "club_invite", "club_invite_accepted", "club_post", "club_post_liked", "club_post_commented", "comment_liked", "club_activity_proposed", "club_activity_activated"],
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add supabase/schema-baseline.sql src/lib/supabase/database.types.ts
git commit -m "chore: sync schema-baseline and generated types for club activities"
```

---

### Task 3: Extend notifications for `club_activity`

**Files:**
- Modify: `src/lib/social/notification-types.ts`
- Modify: `src/lib/social/notifications.ts`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `notification_type` extended (Task 1).
- Produces: `NotificationType` gains `"club_activity_proposed" | "club_activity_activated"`; `NOTIFICATION_TYPE_KEY` gains matching entries; `ReviewTargetType` gains `"club_activity"`; `resolveTargetHrefs()` (Bloque F) gains a `club_activity` branch. Consumed by Task 4 (domain layer's notify() calls).

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
  | "club_invite_accepted"
  | "club_post"
  | "club_post_liked"
  | "club_post_commented"
  | "comment_liked";

export type ReviewTargetType = "diary_entry" | "episode_watch" | "club" | "club_post" | "comment";
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
  | "comment_liked"
  | "club_activity_proposed"
  | "club_activity_activated";

export type ReviewTargetType = "diary_entry" | "episode_watch" | "club" | "club_post" | "comment" | "club_activity";
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
  club_post: "clubPost",
  club_post_liked: "clubPostLiked",
  club_post_commented: "clubPostCommented",
  comment_liked: "commentLiked",
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
  club_activity_proposed: "clubActivityProposed",
  club_activity_activated: "clubActivityActivated",
};
```

- [ ] **Step 2: Add the `club_activity` branch to `resolveTargetHrefs` in `src/lib/social/notifications.ts`**

Find the start of `resolveTargetHrefs` and its `club_post` branch:

```ts
  const diaryIds = targets.filter((t) => t.targetType === "diary_entry").map((t) => t.targetId);
  const episodeIds = targets.filter((t) => t.targetType === "episode_watch").map((t) => t.targetId);
  const clubIds = targets.filter((t) => t.targetType === "club").map((t) => t.targetId);
  const clubPostIds = targets.filter((t) => t.targetType === "club_post").map((t) => t.targetId);
  const commentIds = targets.filter((t) => t.targetType === "comment").map((t) => t.targetId);
```

Replace with:

```ts
  const diaryIds = targets.filter((t) => t.targetType === "diary_entry").map((t) => t.targetId);
  const episodeIds = targets.filter((t) => t.targetType === "episode_watch").map((t) => t.targetId);
  const clubIds = targets.filter((t) => t.targetType === "club").map((t) => t.targetId);
  const clubPostIds = targets.filter((t) => t.targetType === "club_post").map((t) => t.targetId);
  const commentIds = targets.filter((t) => t.targetType === "comment").map((t) => t.targetId);
  const clubActivityIds = targets.filter((t) => t.targetType === "club_activity").map((t) => t.targetId);
```

Find the `club_post` resolution block (the `if (clubPostIds.length > 0) { ... }` block) and, immediately after its closing `}`, insert:

```ts

  if (clubActivityIds.length > 0) {
    const { data: activityRows } = await supabase
      .from("club_activities")
      .select("id, club_id")
      .in("id", clubActivityIds);
    const clubIdsForActivities = [...new Set((activityRows ?? []).map((a) => a.club_id))];
    const { data: clubRows } = clubIdsForActivities.length
      ? await supabase.from("clubs").select("id, slug").in("id", clubIdsForActivities)
      : { data: [] as { id: string; slug: string }[] };
    const slugByClub = new Map((clubRows ?? []).map((c) => [c.id, c.slug]));
    for (const a of activityRows ?? []) {
      const slug = slugByClub.get(a.club_id);
      if (slug) hrefByKey.set(`club_activity:${a.id}`, `/club/${slug}/actividad/${a.id}`);
    }
  }
```

- [ ] **Step 3: Add the notification copy to `messages/es.json`**

In `messages/es.json`, find the `notifications` namespace and add two keys after `"commentLiked"` (before `"justNow"`):

```json
    "clubActivityProposed": "{name} propuso una actividad en el club",
    "clubActivityActivated": "{name} activó una actividad en el club",
```

- [ ] **Step 4: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/lib/social/notification-types.ts src/lib/social/notifications.ts
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/notification-types.ts src/lib/social/notifications.ts messages/es.json
git commit -m "feat: extend notifications for club activities"
```

---

### Task 4: `src/lib/clubs/activities/core.ts` — domain layer

**Files:**
- Create: `src/lib/clubs/activities/core.ts`

**Interfaces:**
- Consumes: `notify` (Task 3, `src/lib/social/notifications.ts`); `activate_club_activity`/`finish_club_activity`/`archive_club_activity` RPCs (Task 1); `ItemType` (`src/lib/catalog/types.ts`, existing).
- Produces: `type ActivityKind`, `type ActivityStatus`, `type ClubActivity`, `type ActivityItem`, `type ActivityOpinion`, `type ActivityDetail`, `proposeActivity`, `activateActivity`, `finishActivity`, `archiveActivity`, `joinActivity`, `leaveActivity`, `addActivityItem`, `removeActivityItem`, `addOpinion`, `getActivity`, `listClubActivities`. Consumed by Tasks 6–9 (UI).

- [ ] **Step 1: Write `src/lib/clubs/activities/core.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/social/notifications";
import type { ItemType } from "@/lib/catalog/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

export type ActivityKind = "buddy_read" | "tierlist" | "list_challenge" | "criteria_challenge";
export type ActivityStatus = "proposed" | "active" | "finished" | "archived";

export type ClubActivity = {
  id: string;
  clubId: string;
  kind: ActivityKind;
  title: string;
  description: string | null;
  status: ActivityStatus;
  createdBy: string;
  startsOn: string | null;
  endsOn: string | null;
  createdAt: string;
  viewerIsParticipant: boolean;
  participantCount: number;
};

export type ActivityItem = {
  id: string;
  itemType: ItemType;
  itemId: string;
  itemTitle: string;
  itemCoverUrl: string | null;
  addedBy: string;
  position: number;
};

export type ActivityOpinion = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  itemType: ItemType;
  itemId: string;
  rating: number | null;
  comment: string | null;
  createdAt: string;
};

export type ActivityDetail = ClubActivity & {
  items: ActivityItem[];
  opinions: ActivityOpinion[]; // vacío si el viewer no es participante -- RLS ya lo filtra
};

// Bucle de fan-out sobre miembros activos, excepto el actor -- mismo patrón best-effort que
// notifyNewPost en src/lib/clubs/posts.ts (Bloque F), sin mecanismo de fan-out nuevo.
async function notifyClub(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  actorId: string,
  type: "club_activity_proposed" | "club_activity_activated",
  activityId: string,
): Promise<void> {
  try {
    const { data: members } = await supabase
      .from("club_members")
      .select("user_id")
      .eq("club_id", clubId)
      .eq("status", "active")
      .neq("user_id", actorId);
    await Promise.all(
      (members ?? []).map((m) =>
        notify(supabase, {
          userId: m.user_id,
          actorId,
          type,
          targetType: "club_activity",
          targetId: activityId,
        }),
      ),
    );
  } catch (error) {
    console.error("notifyClub failed", error);
  }
}

export async function proposeActivity(
  clubId: string,
  kind: ActivityKind,
  title: string,
  description?: string,
  startsOn?: string,
  endsOn?: string,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error("title_required");

  const { data, error } = await supabase
    .from("club_activities")
    .insert({
      club_id: clubId,
      kind,
      title: trimmedTitle,
      description: description?.trim() || null,
      created_by: userId,
      starts_on: startsOn || null,
      ends_on: endsOn || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  await notifyClub(supabase, clubId, userId, "club_activity_proposed", data.id);
}

export async function activateActivity(activityId: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { data: activity, error: fetchError } = await supabase
    .from("club_activities")
    .select("club_id")
    .eq("id", activityId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase.rpc("activate_club_activity", { p_activity_id: activityId });
  if (error) throw error;

  await notifyClub(supabase, activity.club_id, userId, "club_activity_activated", activityId);
}

export async function finishActivity(activityId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("finish_club_activity", { p_activity_id: activityId });
  if (error) throw error;
}

export async function archiveActivity(activityId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("archive_club_activity", { p_activity_id: activityId });
  if (error) throw error;
}

export async function joinActivity(activityId: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("club_activity_participants")
    .insert({ activity_id: activityId, user_id: userId });
  if (error) throw error;
}

export async function leaveActivity(activityId: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("club_activity_participants")
    .delete()
    .eq("activity_id", activityId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function addActivityItem(
  activityId: string,
  itemType: ItemType,
  itemId: string,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { count } = await supabase
    .from("club_activity_items")
    .select("id", { count: "exact", head: true })
    .eq("activity_id", activityId);
  const { error } = await supabase.from("club_activity_items").insert({
    activity_id: activityId,
    item_type: itemType,
    item_id: itemId,
    added_by: userId,
    position: count ?? 0,
  });
  if (error) throw error;
}

export async function removeActivityItem(itemId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("club_activity_items").delete().eq("id", itemId);
  if (error) throw error;
}

export async function addOpinion(
  activityId: string,
  itemType: ItemType,
  itemId: string,
  rating?: number,
  comment?: string,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const trimmedComment = comment?.trim() || null;
  if (rating == null && !trimmedComment) throw new Error("rating_or_comment_required");
  const { error } = await supabase.from("club_activity_opinions").upsert(
    {
      activity_id: activityId,
      user_id: userId,
      item_type: itemType,
      item_id: itemId,
      rating: rating ?? null,
      comment: trimmedComment,
    },
    { onConflict: "activity_id,user_id,item_type,item_id" },
  );
  if (error) throw error;
}

export async function listClubActivities(clubId: string): Promise<ClubActivity[]> {
  const { supabase, userId } = await requireUser();
  const { data: rows, error } = await supabase
    .from("club_activities")
    .select("id, club_id, kind, title, description, status, created_by, starts_on, ends_on, created_at")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const activityIds = rows.map((r) => r.id);
  const { data: participantRows } = await supabase
    .from("club_activity_participants")
    .select("activity_id, user_id")
    .in("activity_id", activityIds);
  const countByActivity = new Map<string, number>();
  const viewerParticipates = new Set<string>();
  for (const p of participantRows ?? []) {
    countByActivity.set(p.activity_id, (countByActivity.get(p.activity_id) ?? 0) + 1);
    if (p.user_id === userId) viewerParticipates.add(p.activity_id);
  }

  return rows.map((r) => ({
    id: r.id,
    clubId: r.club_id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    status: r.status,
    createdBy: r.created_by,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    createdAt: r.created_at,
    viewerIsParticipant: viewerParticipates.has(r.id),
    participantCount: countByActivity.get(r.id) ?? 0,
  }));
}

export async function getActivity(activityId: string): Promise<ActivityDetail | null> {
  const { supabase, userId } = await requireUser();

  const { data: row, error } = await supabase
    .from("club_activities")
    .select("id, club_id, kind, title, description, status, created_by, starts_on, ends_on, created_at")
    .eq("id", activityId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const { data: participantRows } = await supabase
    .from("club_activity_participants")
    .select("user_id")
    .eq("activity_id", activityId);
  const participantCount = participantRows?.length ?? 0;
  const viewerIsParticipant = (participantRows ?? []).some((p) => p.user_id === userId);

  const { data: itemRows } = await supabase
    .from("club_activity_items")
    .select("id, item_type, item_id, added_by, position")
    .eq("activity_id", activityId)
    .order("position", { ascending: true });

  const idsByType: Record<ItemType, Set<string>> = { book: new Set(), movie: new Set(), series: new Set() };
  for (const r of itemRows ?? []) idsByType[r.item_type as ItemType].add(r.item_id);
  const [books, movies, series] = await Promise.all([
    idsByType.book.size
      ? supabase.from("books").select("id, title, cover_url").in("id", [...idsByType.book])
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[] }),
    idsByType.movie.size
      ? supabase.from("movies").select("id, title, cover_url").in("id", [...idsByType.movie])
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[] }),
    idsByType.series.size
      ? supabase.from("series").select("id, title, cover_url").in("id", [...idsByType.series])
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[] }),
  ]);
  const catalogByKey = new Map<string, { title: string; coverUrl: string | null }>();
  for (const r of books.data ?? []) catalogByKey.set(`book:${r.id}`, { title: r.title, coverUrl: r.cover_url });
  for (const r of movies.data ?? []) catalogByKey.set(`movie:${r.id}`, { title: r.title, coverUrl: r.cover_url });
  for (const r of series.data ?? []) catalogByKey.set(`series:${r.id}`, { title: r.title, coverUrl: r.cover_url });

  const items: ActivityItem[] = (itemRows ?? [])
    .map((r): ActivityItem | null => {
      const catalog = catalogByKey.get(`${r.item_type}:${r.item_id}`);
      if (!catalog) return null;
      return {
        id: r.id,
        itemType: r.item_type as ItemType,
        itemId: r.item_id,
        itemTitle: catalog.title,
        itemCoverUrl: catalog.coverUrl,
        addedBy: r.added_by,
        position: r.position,
      };
    })
    .filter((i): i is ActivityItem => i !== null);

  // Opiniones: RLS ya las filtra a solo-participantes -- si el viewer no es participante,
  // esta query simplemente devuelve 0 filas, sin necesitar un chequeo aparte aquí.
  const { data: opinionRows } = await supabase
    .from("club_activity_opinions")
    .select("user_id, item_type, item_id, rating, comment, created_at")
    .eq("activity_id", activityId);

  const opinionAuthorIds = [...new Set((opinionRows ?? []).map((o) => o.user_id))];
  const { data: authors } = opinionAuthorIds.length
    ? await supabase
        .from("profile_identities")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", opinionAuthorIds)
    : {
        data: [] as {
          user_id: string | null;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
        }[],
      };
  const authorById = new Map(
    (authors ?? [])
      .filter((a): a is typeof a & { user_id: string; username: string } => a.user_id != null && a.username != null)
      .map((a) => [a.user_id, a]),
  );

  const opinions: ActivityOpinion[] = (opinionRows ?? [])
    .map((o): ActivityOpinion | null => {
      const author = authorById.get(o.user_id);
      if (!author) return null;
      return {
        userId: o.user_id,
        username: author.username,
        displayName: author.display_name,
        avatarUrl: author.avatar_url,
        itemType: o.item_type as ItemType,
        itemId: o.item_id,
        rating: o.rating,
        comment: o.comment,
        createdAt: o.created_at,
      };
    })
    .filter((o): o is ActivityOpinion => o !== null);

  return {
    id: row.id,
    clubId: row.club_id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    status: row.status,
    createdBy: row.created_by,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    createdAt: row.created_at,
    viewerIsParticipant,
    participantCount,
    items,
    opinions,
  };
}
```

(`config` is deliberately never selected/returned here — this bloque's code never reads or writes it, per the global constraints; Bloque H extends `getActivity`/`listClubActivities` to include it once it needs to interpret it.)

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean. If `supabase.rpc("activate_club_activity", ...)` etc. don't type-check, confirm Task 2's `Functions` block additions landed with the exact `Args` field name (`p_activity_id`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/clubs/activities/core.ts
git commit -m "feat: add club activities domain functions"
```

---

### Task 5: Library item picker

**Files:**
- Create: `src/components/clubs/activity-actions.ts`
- Create: `src/components/clubs/library-item-picker.tsx`

**Interfaces:**
- Consumes: `getLibraryItems` (`src/lib/library/get-library-items.ts`, existing — read-only, do not modify), `type LibraryItem` (`src/lib/library/types.ts`, existing).
- Produces: `loadMyLibraryItems(search?: string, itemType?: ItemType): Promise<LibraryItem[]>`, `<LibraryItemPicker onPick={(item: LibraryItem) => void} onCancel={() => void} />`. Consumed by Task 9 (item pool section).

- [ ] **Step 1: Write `src/components/clubs/activity-actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLibraryItems } from "@/lib/library/get-library-items";
import type { LibraryItem } from "@/lib/library/types";
import type { ItemType } from "@/lib/catalog/types";

// getLibraryItems() ya soporta search/itemType server-side -- se reutiliza tal cual,
// envuelta en una server action ("use server") ya que la función en sí no lo es (toma un
// cliente Supabase ya creado, se llama desde componentes de servidor). Mismo patrón que
// loadOwnRecentActivity en club-post-actions.ts (Bloque F).
export async function loadMyLibraryItems(search?: string, itemType?: ItemType): Promise<LibraryItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return getLibraryItems(supabase, user.id, { search, itemType });
}
```

- [ ] **Step 2: Write `src/components/clubs/library-item-picker.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { LibraryItem } from "@/lib/library/types";
import { loadMyLibraryItems } from "./activity-actions";

// Selector de un ítem de tu biblioteca para añadirlo al pool de una actividad (EPIC-05
// Bloque G) -- mismo patrón onPick/onCancel que ActivitySharePicker (Bloque F), pero
// alimentado por getLibraryItems() en vez de FeedEvents.
export function LibraryItemPicker({
  onPick,
  onCancel,
}: {
  onPick: (item: LibraryItem) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("activity");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      loadMyLibraryItems(search || undefined).then((results) => {
        setItems(results);
        setLoading(false);
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <span className="text-sm font-medium text-foreground">{t("pickItem")}</span>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("searchLibraryPlaceholder")}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {loading && <p className="text-xs text-muted-foreground">…</p>}
      {!loading && items.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("noLibraryItems")}</p>
      )}
      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {items.map((item) => (
          <button
            key={item.entryId}
            type="button"
            onClick={() => onPick(item)}
            className="flex items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-surface-muted"
          >
            {item.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage, mismo criterio que otras tarjetas de catálogo
              <img src={item.coverUrl} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
            )}
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
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

(Read `src/lib/library/types.ts`'s `LibraryItem` type first to confirm the exact field names used above — `entryId`, `itemType`, `itemId`, `title`, `coverUrl` — before writing this file; adjust field names if they differ from this brief's assumption, and note any discrepancy in your report.)

- [ ] **Step 3: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/clubs/activity-actions.ts src/components/clubs/library-item-picker.tsx
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubs/activity-actions.ts src/components/clubs/library-item-picker.tsx
git commit -m "feat: add library item picker for activity item pools"
```

---

### Task 6: `ActivityComposer` + `activity.*` i18n (creation)

**Files:**
- Create: `src/components/clubs/activity-composer.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `proposeActivity`, `type ActivityKind` (Task 4, `src/lib/clubs/activities/core.ts`).
- Produces: `<ActivityComposer clubId={string} onProposed={() => void} />`. Consumed by Task 7 (`ActivityList`).

- [ ] **Step 1: Write `src/components/clubs/activity-composer.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { proposeActivity, type ActivityKind } from "@/lib/clubs/activities/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const KINDS: ActivityKind[] = ["buddy_read", "tierlist", "list_challenge", "criteria_challenge"];

export function ActivityComposer({
  clubId,
  onProposed,
}: {
  clubId: string;
  onProposed: () => void;
}) {
  const t = useTranslations("activity");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ActivityKind>("buddy_read");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setOpen(false);
    setKind("buddy_read");
    setTitle("");
    setDescription("");
    setStartsOn("");
    setEndsOn("");
    setError(null);
  }

  function submit() {
    startTransition(async () => {
      try {
        await proposeActivity(clubId, kind, title, description || undefined, startsOn || undefined, endsOn || undefined);
        reset();
        onProposed();
      } catch {
        setError(t("proposeError"));
      }
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t("propose")}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("kind")}
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ActivityKind)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`kind_${k}`)}
            </option>
          ))}
        </select>
      </label>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("descriptionPlaceholder")}
        rows={2}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t("startsOn")}
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t("endsOn")}
          <input
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
      </div>
      {error && <p className="text-xs text-status-dropped">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={isPending || !title.trim()} onClick={submit}>
          {t("proposeSubmit")}
        </Button>
        <Button type="button" variant="ghost" onClick={reset}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the `activity.*` i18n namespace to `messages/es.json`**

Place it near `clubPost`/`notifications` for discoverability:

```json
  "activity": {
    "sectionTitle": "Actividades",
    "backToClub": "← Volver al club",
    "propose": "Proponer actividad",
    "kind": "Tipo",
    "kind_buddy_read": "Lectura conjunta",
    "kind_tierlist": "Tierlist",
    "kind_list_challenge": "Reto por lista",
    "kind_criteria_challenge": "Reto por criterio",
    "titlePlaceholder": "Título de la actividad",
    "descriptionPlaceholder": "Descripción (opcional)",
    "startsOn": "Empieza el",
    "endsOn": "Termina el",
    "proposeSubmit": "Proponer",
    "proposeError": "Algo falló. Inténtalo de nuevo.",
    "cancel": "Cancelar",
    "status_proposed": "Propuesta",
    "status_active": "Activa",
    "status_finished": "Finalizada",
    "status_archived": "Archivada",
    "empty": "Todavía no hay actividades en este club.",
    "participants": "{count, plural, one {# participante} other {# participantes}}",
    "join": "Unirse",
    "leave": "Salir",
    "activate": "Activar",
    "finish": "Finalizar",
    "archive": "Archivar",
    "activateError": "Algo falló. Inténtalo de nuevo.",
    "pickItem": "Elige un ítem de tu biblioteca",
    "searchLibraryPlaceholder": "Buscar en tu biblioteca...",
    "noLibraryItems": "No se encontraron ítems.",
    "addItem": "Añadir ítem",
    "removeItem": "Quitar",
    "itemPool": "Ítems",
    "opinions": "Opiniones",
    "opinionRating": "Valoración (1-10)",
    "opinionCommentPlaceholder": "Comentario (opcional)",
    "opinionSubmit": "Guardar opinión",
    "opinionsLocked": "Únete a la actividad para ver y añadir opiniones.",
    "noOpinionsYet": "Todavía no hay opiniones."
  },
```

- [ ] **Step 3: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/clubs/activity-composer.tsx
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubs/activity-composer.tsx messages/es.json
git commit -m "feat: add ActivityComposer and activity.* i18n"
```

---

### Task 7: `ActivityList`/`ActivityCard`, wired into `/club/[slug]`

**Files:**
- Create: `src/components/clubs/activity-list.tsx`
- Create: `src/components/clubs/activity-card.tsx`
- Modify: `src/app/club/[slug]/page.tsx`

**Interfaces:**
- Consumes: `listClubActivities`, `type ClubActivity` (Task 4); `ActivityComposer` (Task 6).
- Produces: `<ActivityList clubId={string} initialActivities={ClubActivity[]} />`. Wired into `/club/[slug]/page.tsx`.

- [ ] **Step 1: Write `src/components/clubs/activity-card.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ClubActivity } from "@/lib/clubs/activities/core";

const STATUS_STYLE: Record<ClubActivity["status"], string> = {
  proposed: "bg-surface-muted text-muted-foreground",
  active: "bg-accent/15 text-accent",
  finished: "bg-surface-muted text-muted-foreground",
  archived: "bg-surface-muted text-muted-foreground",
};

export function ActivityCard({ activity, clubSlug }: { activity: ClubActivity; clubSlug: string }) {
  const t = useTranslations("activity");
  return (
    <Link
      href={`/club/${clubSlug}/actividad/${activity.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 hover:bg-surface-muted"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{activity.title}</span>
        <span className="text-xs text-muted-foreground">
          {t(`kind_${activity.kind}`)} · {t("participants", { count: activity.participantCount })}
        </span>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[activity.status]}`}>
        {t(`status_${activity.status}`)}
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Write `src/components/clubs/activity-list.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { listClubActivities, type ClubActivity } from "@/lib/clubs/activities/core";
import { ActivityComposer } from "./activity-composer";
import { ActivityCard } from "./activity-card";

export function ActivityList({
  clubId,
  clubSlug,
  initialActivities,
}: {
  clubId: string;
  clubSlug: string;
  initialActivities: ClubActivity[];
}) {
  const t = useTranslations("activity");
  const [activities, setActivities] = useState(initialActivities);
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      setActivities(await listClubActivities(clubId));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t("sectionTitle")}</h2>
        <ActivityComposer clubId={clubId} onProposed={refresh} />
      </div>

      {activities.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {activities.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} clubSlug={clubSlug} />
          ))}
        </div>
      )}
    </div>
  );
}
```

(`t("sectionTitle")` resolves to the `activity.sectionTitle` key added in Task 6, Step 2 — no further i18n edits needed here.)

- [ ] **Step 3: Wire `ActivityList` into `src/app/club/[slug]/page.tsx`**

Find:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getClub } from "@/lib/clubs/clubs";
import { listClubPosts } from "@/lib/clubs/posts";
import { ClubHeader } from "@/components/clubs/club-header";
import { ManageMembers } from "@/components/clubs/manage-members";
import { ClubFeed } from "@/components/clubs/club-feed";
```

Replace with:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getClub } from "@/lib/clubs/clubs";
import { listClubPosts } from "@/lib/clubs/posts";
import { listClubActivities } from "@/lib/clubs/activities/core";
import { ClubHeader } from "@/components/clubs/club-header";
import { ManageMembers } from "@/components/clubs/manage-members";
import { ClubFeed } from "@/components/clubs/club-feed";
import { ActivityList } from "@/components/clubs/activity-list";
```

Find:

```tsx
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

Replace with:

```tsx
  const initialPage = club.viewerRole ? await listClubPosts(club.id) : { posts: [], nextCursor: null };
  const initialActivities = club.viewerRole ? await listClubActivities(club.id) : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <ClubHeader club={club} userId={user.id} />
      {(club.viewerRole === "moderator" || club.viewerRole === "owner") && (
        <ManageMembers clubId={club.id} viewerRole={club.viewerRole} viewerId={user.id} />
      )}
      {club.viewerRole && (
        <ActivityList clubId={club.id} clubSlug={club.slug} initialActivities={initialActivities} />
      )}
      {club.viewerRole && (
        <ClubFeed clubId={club.id} viewerId={user.id} viewerRole={club.viewerRole} initialPage={initialPage} />
      )}
    </div>
  );
```

(Activities section placed above the feed — a club's activities are a more structured, longer-lived surface than the feed's stream of posts, worth top billing. `club.slug` is already part of the `Club` type `getClub()` returns, no new field needed.)

- [ ] **Step 4: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/clubs/activity-list.tsx src/components/clubs/activity-card.tsx "src/app/club/[slug]/page.tsx"
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubs/activity-list.tsx src/components/clubs/activity-card.tsx messages/es.json "src/app/club/[slug]/page.tsx"
git commit -m "feat: add activities list and wire into /club/[slug]"
```

---

### Task 8: Activity detail page — lifecycle actions

**Files:**
- Create: `src/app/club/[slug]/actividad/[id]/page.tsx`
- Create: `src/components/clubs/activity-detail.tsx`

**Interfaces:**
- Consumes: `getActivity`, `activateActivity`, `finishActivity`, `archiveActivity`, `joinActivity`, `leaveActivity`, `type ActivityDetail` (Task 4); `getClub` (`src/lib/clubs/clubs.ts`, existing).
- Produces: `<ActivityDetail activity={ActivityDetail} viewerId={string} viewerRole={"member"|"moderator"|"owner"} clubSlug={string} />`. Consumed by Task 9 (adds item pool + opinions sections to the same component).

- [ ] **Step 1: Write `src/app/club/[slug]/actividad/[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getClub } from "@/lib/clubs/clubs";
import { getActivity } from "@/lib/clubs/activities/core";
import { ActivityDetailView } from "@/components/clubs/activity-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const activity = await getActivity(id);
  return { title: activity ? `${activity.title} — Biblioshare` : "Actividad — Biblioshare" };
}

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const club = await getClub(slug);
  if (!club || !club.viewerRole) notFound();

  const activity = await getActivity(id);
  if (!activity || activity.clubId !== club.id) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <ActivityDetailView
        activity={activity}
        viewerId={user.id}
        viewerRole={club.viewerRole}
        clubSlug={slug}
      />
    </div>
  );
}
```

(`activity.clubId !== club.id` guards against an activity id from a different club being loaded under this club's slug — `getActivity`'s own RLS already prevents cross-club data leaking, but this is a defensive, cheap check for a coherent 404 instead of rendering the wrong club's activity.)

- [ ] **Step 2: Write `src/components/clubs/activity-detail.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  activateActivity,
  archiveActivity,
  finishActivity,
  joinActivity,
  leaveActivity,
  type ActivityDetail,
} from "@/lib/clubs/activities/core";
import { Button } from "@/components/ui/button";

export function ActivityDetailView({
  activity,
  viewerId,
  viewerRole,
  clubSlug,
}: {
  activity: ActivityDetail;
  viewerId: string;
  viewerRole: "member" | "moderator" | "owner";
  clubSlug: string;
}) {
  const t = useTranslations("activity");
  const [status, setStatus] = useState(activity.status);
  const [isParticipant, setIsParticipant] = useState(activity.viewerIsParticipant);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isModerator = viewerRole === "moderator" || viewerRole === "owner";
  const isCreator = activity.createdBy === viewerId;

  function run(action: () => Promise<void>, onSuccess: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        onSuccess();
      } catch {
        setError(t("activateError"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/club/${clubSlug}`} className="text-xs text-muted-foreground hover:text-foreground">
        {t("backToClub")}
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{activity.title}</h1>
        <span className="text-xs text-muted-foreground">
          {t(`kind_${activity.kind}`)} · {t(`status_${status}`)}
        </span>
        {activity.description && <p className="text-sm text-muted-foreground">{activity.description}</p>}
      </div>

      {error && <p className="text-xs text-status-dropped">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {isModerator && status === "proposed" && (
          <Button
            type="button"
            disabled={isPending}
            onClick={() => run(() => activateActivity(activity.id), () => setStatus("active"))}
          >
            {t("activate")}
          </Button>
        )}
        {(isCreator || isModerator) && status === "active" && (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => run(() => finishActivity(activity.id), () => setStatus("finished"))}
          >
            {t("finish")}
          </Button>
        )}
        {isModerator && (status === "proposed" || status === "active") && (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => archiveActivity(activity.id), () => setStatus("archived"))}
          >
            {t("archive")}
          </Button>
        )}
        {status === "active" && !isParticipant && (
          <Button
            type="button"
            disabled={isPending}
            onClick={() => run(() => joinActivity(activity.id), () => setIsParticipant(true))}
          >
            {t("join")}
          </Button>
        )}
        {isParticipant && (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => leaveActivity(activity.id), () => setIsParticipant(false))}
          >
            {t("leave")}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/clubs/activity-detail.tsx "src/app/club/[slug]/actividad/[id]/page.tsx"
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/club/[slug]/actividad/[id]/page.tsx" src/components/clubs/activity-detail.tsx
git commit -m "feat: add activity detail page with lifecycle actions"
```

---

### Task 9: Item pool + opinions sections

**Files:**
- Create: `src/components/clubs/activity-item-pool.tsx`
- Create: `src/components/clubs/activity-opinions.tsx`
- Modify: `src/components/clubs/activity-detail.tsx`

**Interfaces:**
- Consumes: `addActivityItem`, `removeActivityItem`, `addOpinion`, `type ActivityItem`, `type ActivityOpinion`, `type ActivityDetail` (Task 4); `LibraryItemPicker` (Task 5).
- Produces: `<ActivityItemPool activity={ActivityDetail} viewerId={string} isParticipant={boolean} onChanged={() => void} />`, `<ActivityOpinions activity={ActivityDetail} viewerId={string} isParticipant={boolean} onChanged={() => void} />`. Wired into `ActivityDetailView`.

- [ ] **Step 1: Write `src/components/clubs/activity-item-pool.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addActivityItem, removeActivityItem, type ActivityItem } from "@/lib/clubs/activities/core";
import { LibraryItemPicker } from "./library-item-picker";
import { itemHref } from "@/lib/catalog/item-href";
import { Button } from "@/components/ui/button";

export function ActivityItemPool({
  activityId,
  items,
  viewerId,
  isParticipant,
  canModerate,
  onChanged,
}: {
  activityId: string;
  items: ActivityItem[];
  viewerId: string;
  isParticipant: boolean;
  canModerate: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [picking, setPicking] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRemove(itemId: string) {
    startTransition(async () => {
      await removeActivityItem(itemId);
      onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">{t("itemPool")}</h2>

      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
            <Link
              href={itemHref(item.itemType, item.itemId)}
              className="flex min-w-0 flex-1 items-center gap-2 text-sm hover:text-accent"
            >
              {item.itemCoverUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage
                <img src={item.itemCoverUrl} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
              )}
              <span className="min-w-0 flex-1 truncate">{item.itemTitle}</span>
            </Link>
            {(item.addedBy === viewerId || canModerate) && (
              <Button type="button" variant="ghost" disabled={isPending} onClick={() => handleRemove(item.id)}>
                {t("removeItem")}
              </Button>
            )}
          </div>
        ))}
      </div>

      {isParticipant &&
        (picking ? (
          <LibraryItemPicker
            onPick={(libraryItem) => {
              startTransition(async () => {
                await addActivityItem(activityId, libraryItem.itemType, libraryItem.itemId);
                setPicking(false);
                onChanged();
              });
            }}
            onCancel={() => setPicking(false)}
          />
        ) : (
          <Button type="button" variant="secondary" onClick={() => setPicking(true)}>
            {t("addItem")}
          </Button>
        ))}
    </div>
  );
}
```

(Read `src/lib/library/types.ts`'s `LibraryItem` type — confirmed in Task 5 — to make sure `libraryItem.itemType`/`libraryItem.itemId` above match its actual field names exactly.)

- [ ] **Step 2: Write `src/components/clubs/activity-opinions.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addOpinion, type ActivityDetail } from "@/lib/clubs/activities/core";
import { Button } from "@/components/ui/button";

export function ActivityOpinions({
  activity,
  viewerId,
  isParticipant,
  onChanged,
}: {
  activity: ActivityDetail;
  viewerId: string;
  isParticipant: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");

  if (!isParticipant) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("opinions")}</h2>
        <p className="text-xs text-muted-foreground">{t("opinionsLocked")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">{t("opinions")}</h2>
      {activity.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("noOpinionsYet")}</p>
      ) : (
        activity.items.map((item) => (
          <OpinionItemSection
            key={item.id}
            activityId={activity.id}
            itemId={item.itemId}
            itemType={item.itemType}
            itemTitle={item.itemTitle}
            viewerId={viewerId}
            opinions={activity.opinions.filter((o) => o.itemId === item.itemId && o.itemType === item.itemType)}
            onChanged={onChanged}
          />
        ))
      )}
    </div>
  );
}

function OpinionItemSection({
  activityId,
  itemId,
  itemType,
  itemTitle,
  viewerId,
  opinions,
  onChanged,
}: {
  activityId: string;
  itemId: string;
  itemType: ActivityDetail["items"][number]["itemType"];
  itemTitle: string;
  viewerId: string;
  opinions: ActivityDetail["opinions"];
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const own = opinions.find((o) => o.userId === viewerId);
  const [rating, setRating] = useState(own?.rating?.toString() ?? "");
  const [comment, setComment] = useState(own?.comment ?? "");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      await addOpinion(
        activityId,
        itemType,
        itemId,
        rating ? Number(rating) : undefined,
        comment || undefined,
      );
      onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <span className="text-sm font-medium text-foreground">{itemTitle}</span>
      <div className="flex flex-col gap-1">
        {opinions
          .filter((o) => o.userId !== viewerId)
          .map((o) => (
            <p key={o.userId} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{o.displayName || o.username}</span>
              {o.rating != null && <> · {o.rating}/10</>}
              {o.comment && <> — {o.comment}</>}
            </p>
          ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("opinionRating")}
          <input
            type="number"
            min={1}
            max={10}
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("opinionCommentPlaceholder")}
          className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <Button type="button" disabled={isPending || (!rating && !comment.trim())} onClick={submit}>
          {t("opinionSubmit")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire both sections into `src/components/clubs/activity-detail.tsx`**

Find:

```tsx
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  activateActivity,
  archiveActivity,
  finishActivity,
  joinActivity,
  leaveActivity,
  type ActivityDetail,
} from "@/lib/clubs/activities/core";
import { Button } from "@/components/ui/button";
```

Replace with:

```tsx
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  activateActivity,
  archiveActivity,
  finishActivity,
  getActivity,
  joinActivity,
  leaveActivity,
  type ActivityDetail,
} from "@/lib/clubs/activities/core";
import { ActivityItemPool } from "./activity-item-pool";
import { ActivityOpinions } from "./activity-opinions";
import { Button } from "@/components/ui/button";
```

Find:

```tsx
export function ActivityDetailView({
  activity,
  viewerId,
  viewerRole,
  clubSlug,
}: {
  activity: ActivityDetail;
  viewerId: string;
  viewerRole: "member" | "moderator" | "owner";
  clubSlug: string;
}) {
  const t = useTranslations("activity");
  const [status, setStatus] = useState(activity.status);
  const [isParticipant, setIsParticipant] = useState(activity.viewerIsParticipant);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isModerator = viewerRole === "moderator" || viewerRole === "owner";
  const isCreator = activity.createdBy === viewerId;
```

Replace with:

```tsx
export function ActivityDetailView({
  activity: initialActivity,
  viewerId,
  viewerRole,
  clubSlug,
}: {
  activity: ActivityDetail;
  viewerId: string;
  viewerRole: "member" | "moderator" | "owner";
  clubSlug: string;
}) {
  const t = useTranslations("activity");
  const [activity, setActivity] = useState(initialActivity);
  const [status, setStatus] = useState(activity.status);
  const [isParticipant, setIsParticipant] = useState(activity.viewerIsParticipant);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isModerator = viewerRole === "moderator" || viewerRole === "owner";
  const isCreator = activity.createdBy === viewerId;

  function refreshActivity() {
    startTransition(async () => {
      const fresh = await getActivity(activity.id);
      if (fresh) {
        setActivity(fresh);
        setStatus(fresh.status);
        setIsParticipant(fresh.viewerIsParticipant);
      }
    });
  }
```

Find the end of the component's `return (...)` block — the closing `</div>` right after the action-buttons `<div className="flex flex-wrap items-center gap-2">...</div>`:

```tsx
        {isParticipant && (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => leaveActivity(activity.id), () => setIsParticipant(false))}
          >
            {t("leave")}
          </Button>
        )}
      </div>
    </div>
  );
}
```

Replace with:

```tsx
        {isParticipant && (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => leaveActivity(activity.id), () => setIsParticipant(false))}
          >
            {t("leave")}
          </Button>
        )}
      </div>

      <ActivityItemPool
        activityId={activity.id}
        items={activity.items}
        viewerId={viewerId}
        isParticipant={isParticipant}
        canModerate={isModerator}
        onChanged={refreshActivity}
      />

      <ActivityOpinions
        activity={activity}
        viewerId={viewerId}
        isParticipant={isParticipant}
        onChanged={refreshActivity}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/clubs/activity-item-pool.tsx src/components/clubs/activity-opinions.tsx src/components/clubs/activity-detail.tsx
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubs/activity-item-pool.tsx src/components/clubs/activity-opinions.tsx src/components/clubs/activity-detail.tsx
git commit -m "feat: add item pool and opinions sections to activity detail"
```

---

### Task 10: Manual test checklist

**Files:**
- Create: `docs/superpowers/plans/2026-07-13-epic05-bloque-g-club-activities-manual-test.md`

- [ ] **Step 1: Write the checklist document**

Per `docs/TESTING.md`, this replaces automated browser verification. Write a markdown checklist with `- [ ]` checkboxes throughout (including any summary section — never pre-mark anything as verified, since no one has run it yet), covering, with two test accounts (A = club owner, B = second account, both already members of a shared private club — reuse an existing test club from Bloque E/F's own checklists if one exists):

1. **Setup**: `npm run dev`, log in as A, confirm A and B are both active members of a club (A owner, B member).
2. **Propose (no role gate)**: as B (regular member), open the club, click "Proponer actividad", pick a `kind`, fill title, submit. Confirm it appears in the "Actividades" list with a "Propuesta" badge.
3. **Propose notification**: as A, confirm a "propuso una actividad" notification arrived and links to `/club/[slug]/actividad/[id]`.
4. **Activate — permission**: as B (not moderator), open the activity detail page, confirm there is NO "Activar" button. As A (owner), confirm the "Activar" button IS visible, click it. Confirm the badge changes to "Activa".
5. **Activate notification**: as B, confirm an "activó una actividad" notification arrived.
6. **Join and item pool**: as B, on the now-active activity, click "Unirse". Confirm a "Salir" button appears in its place. Click "Añadir ítem", search your library, pick one. Confirm it appears in the item pool.
7. **Item pool visibility without joining**: as A (has NOT joined this specific activity, though owner of the club), confirm A can still SEE the item B added (the pool is club-visible), but confirm A has no "Añadir ítem" button showing (A isn't a participant) — A should only see "Quitar" on B's item (moderator can remove).
8. **Item pool — non-participant blocked**: separately, confirm a third account (in the club but not a participant) cannot see an "Añadir ítem" button either.
9. **Opinions — locked for non-participants**: as A (club member, not a participant of this activity), open the detail page and confirm the opinions section shows "Únete a la actividad para ver y añadir opiniones" instead of any actual opinion content.
10. **Opinions — participant can add and see**: as B (participant), add a rating+comment for the pooled item. Confirm it displays under that item.
11. **Opinions — visible only after joining**: as A, click "Unirse" to join this same activity. Refresh the page. Confirm A can NOW see B's opinion that was previously hidden.
12. **Finish — creator can, without being moderator**: create a fresh activity as B (so B is both creator and non-moderator), have A activate it, then as B click "Finalizar". Confirm it succeeds and the badge changes to "Finalizada".
13. **Finish — blocked for non-creator non-moderator**: create another activity as A, have A activate it, then as B (not creator, not moderator) confirm there's no "Finalizar" button visible on that one.
14. **Archive — from proposed (reject) and from active (cancel)**: as A, propose a throwaway activity, and separately activate another — for each, click "Archivar" (moderator-only action) and confirm the badge changes to "Archivada" in both cases (from `proposed` directly, and from `active`).
15. **Non-member exclusion**: as an account not in this club, confirm `/club/[slug]/actividad/[id]` for any of these activities returns a 404 or similar, and the club's "Actividades" section itself doesn't render at all.
16. **No console errors** throughout.
17. **Cleanup**: delete test activities/participants/items/opinions via SQL against dev, scoped to the test club's id: `delete from public.club_activity_opinions where activity_id in (select id from public.club_activities where club_id = '<club-id>'); delete from public.club_activity_items where activity_id in (select id from public.club_activities where club_id = '<club-id>'); delete from public.club_activity_participants where activity_id in (select id from public.club_activities where club_id = '<club-id>'); delete from public.club_activities where club_id = '<club-id>';`

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-13-epic05-bloque-g-club-activities-manual-test.md
git commit -m "docs: add manual test checklist for EPIC-05 Bloque G club activities"
```

---

### Task 11: Apply to prod, update docs

**Files:**
- Modify: `docs/requirements/social-epic.md`
- Modify: `docs/REQUIREMENTS.md`

- [ ] **Step 1: Apply the migration to prod**

Use `mcp__supabase__apply_migration` with `name: "club_activities"` and the exact SQL from Task 1, Step 1 (pinned to the prod project ref). **Confirm with the user before applying** — this is a new set of tables and RLS policies, lower individual risk than Bloque F's live-policy edits, but still a production database change; treat it with the same explicit-confirmation discipline used for every prior EPIC-05 prod deployment in this project.

- [ ] **Step 2: Verify prod**

Run `mcp__supabase__get_advisors` with `type: "security"` and confirm no genuinely new findings beyond the project's already-accepted `SECURITY DEFINER` RPC-exposure pattern (expected for `is_activity_participant`/`activate_club_activity`/`finish_club_activity`/`archive_club_activity`).

- [ ] **Step 3: Update `docs/requirements/social-epic.md`**

Mark `E5.G1`–`E5.G3` as done (`- [x]`) and add a status note matching the style of the other closed EPIC-05 blocks — built + verified in dev (manual checklist), migration applied to prod, note that the full lifecycle is exposed now (not deferred to Bloque H) and that `config`/type-specific behavior is explicitly still deferred to Bloque H.

- [ ] **Step 4: Update `docs/REQUIREMENTS.md`**

Add a dated row to the §9 decision table documenting: the decision to expose the full composer/lifecycle now rather than deferring to Bloque H (mirrors the by-layer build order already used for clubs before the club feed), the opinions-visible-only-to-participants RLS decision (confirms SD-8's own phrasing), and the `archiveActivity` generalization (one RPC covering both "reject a proposal" and "cancel an active activity", reachable from either `proposed` or `active`).

- [ ] **Step 5: Commit**

```bash
git add docs/requirements/social-epic.md docs/REQUIREMENTS.md
git commit -m "docs: mark EPIC-05 Bloque G done (club activities engine)"
```
