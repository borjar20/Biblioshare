# EPIC-05 Bloque E — Clubes: creación, membresía y roles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver E5.E1–E5.E4 of the social epic backlog: club creation, membership (join/leave/invite), roles (member/moderator/owner), and the `/club/[slug]` + `/clubes` UI. Club feed (posts/activities) is Bloque F, explicitly out of scope.

**Architecture:** Two new tables (`clubs`, `club_members`) with a `SECURITY DEFINER` helper trio (`is_club_member`/`club_role`/`has_min_club_role`) replicating the existing RBAC pattern (`has_min_role`). Role-changing operations (`create_club`, `set_club_member_role`, `transfer_club_ownership`) are `SECURITY DEFINER` RPC functions rather than raw client updates, so privilege escalation can never happen through a crafted direct request — plain RLS only ever needs to allow status transitions, never `role`/`owner_id` changes. A `BEFORE DELETE` trigger on `club_members` keeps every club with members owned by someone, regardless of which code path removes the owner's row.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase Postgres/Auth/RLS/Storage, next-intl, TypeScript, Tailwind.

## Global Constraints

- Scope is exactly E5.E1–E5.E4 — no club feed, posts, or activities (Bloque F+).
- Club creation is open to any authenticated user, no role gating.
- The owner cannot leave a club with other members without transferring ownership first; if they're the sole member, leaving deletes the club.
- Club content (including the member roster) is always members-only, regardless of `visibility` — `visibility` only governs discoverability and how you join.
- Joining a private club is invite-only — there is no self-service "request to join" flow. A private club's row is genuinely invisible to non-members (not just its content), which makes a self-request flow impossible to implement consistently (the requester would need to read a row RLS hides from them just to prove the club is private). `club_member_status` therefore has only `invited`/`active`, no `pending`. This was corrected mid-implementation after Task 1's original brief (which did include a `pending` self-request branch) turned out to be internally contradictory — see Task 1's design-correction note.
- `slug` is fixed at creation, never editable.
- Cover images reuse the existing `avatars` Storage bucket and its existing RLS policies (own-folder-only) — path convention `{uploaderUserId}/club-cover-{timestamp}.webp`, **not** `clubs/{club_id}/...` (that would violate the bucket's existing `(storage.foldername(name))[1] = auth.uid()` policy and doesn't solve the chicken-and-egg problem of uploading a cover before a club exists).
- Direct invites are in scope from the start, gated to moderator+.
- Role changes (`set_club_member_role`, `transfer_club_ownership`) and club creation (`create_club`) are `SECURITY DEFINER` RPC functions, never plain client-side table writes — see spec §RLS for why.
- Per `docs/TESTING.md`, UI verification is a manual test checklist document, not an automated browser-driving subagent.
- Run `npx tsc --noEmit` and `npx eslint <touched files>` after every task that touches `.ts`/`.tsx` files. `.next/dev/types/validator.ts` errors while the dev server is running concurrently are a known transient artifact (torn file read) — re-run once, and if they persist on a second run, ignore lines from that specific generated path and verify with `eslint` instead.
- Windows/PowerShell environment — use the Bash tool (Git Bash) for shell commands shown below, not native PowerShell cmdlets.
- Full design rationale: `docs/superpowers/specs/2026-07-12-epic05-bloque-e-clubs-design.md`.

---

### Task 1: Migration — `clubs` + `club_members` schema, helpers, triggers, RPCs, RLS

**Files:**
- Create: `supabase/migrations/20260712_clubs.sql`

**Interfaces:**
- Produces: enums `public.club_visibility`, `public.club_role`, `public.club_member_status`; tables `public.clubs`, `public.club_members`; functions `public.is_club_member(uuid)`, `public.club_role(uuid)`, `public.has_min_club_role(uuid, club_role)`, `public.club_member_row_exists(uuid)`, `public.create_club(text,text,text,club_visibility,text) returns clubs`, `public.set_club_member_role(uuid,uuid,club_role)`, `public.transfer_club_ownership(uuid,uuid)`; extends `public.notification_type` with `club_invite`, `club_invite_accepted`. Consumed by Task 2 (types), Task 3/4 (domain layer). `club_member_row_exists` is an internal RLS-plumbing helper, not expected to be called from application code — Task 2 doesn't need a TypeScript `Functions` entry for it (unlike `create_club`/`set_club_member_role`/`transfer_club_ownership`, which the domain layer calls via `.rpc()`).

**Design correction from the original brainstorming pass:** joining a private club is invite-only — there is no self-service "solicitar unirse" request flow. A private club's row is genuinely invisible to non-members (per SD-4), and a self-request flow is impossible to implement consistently with that (the requester would need to read a row RLS hides from them just to prove the club is private). `club_member_status` therefore has only two non-active states collapsed into one (`invited`), not two (`pending`+`invited`) — see the enum below.

**Second correction, found by the Task 1 implementer's own RLS battery:** an invited (not-yet-`active`) user could never see their own invitation row, because Postgres requires a row to pass a table's `SELECT` policy before any `UPDATE`/`DELETE` policy can touch it — and `is_club_member()` (used by both the `clubs` and `club_members` `SELECT` policies) intentionally requires `status='active'`. This blocked both accepting an invite (the `UPDATE` always affected 0 rows) and viewing the private club's basic info before accepting (would 404). Fixed by broadening both `SELECT` policies to also grant self-only visibility regardless of status — see the RLS section below; both fixes are already reflected in the SQL.

**Third correction, also found by the Task 1 implementer's own RLS battery:** the second fix's broadened `clubs select public or member` policy replaced its `is_club_member()` function call with a raw `exists(select ... from club_members ...)` subquery (needed, since `is_club_member()` deliberately excludes `invited` rows). But `club_members insert self or invite` already directly references `clubs` in its own `WITH CHECK`. With both tables now referencing each other via raw subqueries (not function calls), Postgres's RLS planner statically rejects the whole thing as a structural cycle (`42P17: infinite recursion detected`) — this check happens at plan time based purely on which tables are mentioned in policy clauses, independent of `SECURITY DEFINER` bypass or whether the runtime logic would actually recurse. Fixed with a new helper, `club_member_row_exists(uuid)`, wrapping the raw subquery in a function-call boundary — exactly why `is_club_member()`/`club_role()`/`has_min_club_role()` are already functions rather than inline subqueries elsewhere in this same migration.

**Fourth correction (statement ordering), applied directly by the implementer without escalating** (all four prior rounds fully resolved SQL-level design bugs found via the battery — this one, and the two below, were caught by the *task reviewer* reading the resulting SQL): `transfer_club_ownership()` originally demoted the outgoing owner's `club_members.role` before updating `clubs.owner_id`, so `trg_enforce_club_owner_change` (which re-derives "is the caller currently owner" from `club_members` state) rejected its own legitimate caller. Fixed by updating `clubs.owner_id` first, while the caller still holds `role='owner'`.

**Fifth and sixth corrections, found by the task reviewer reading the round-4 SQL (not caught by the 16-check battery, since nothing exercised these specific paths):**
- `club_members accept invite`'s `WITH CHECK (status = 'active')` never constrained `role` — an invited member could smuggle `role='owner'` into the same UPDATE that accepts their invite, becoming a second owner without ever going through `create_club()`/`transfer_club_ownership()`. Fixed: `with check (status = 'active' and role = 'member')`. Added Test 14 to the battery to cover this specific attack, since it was previously untested.
- `reassign_club_ownership()`'s "sole member leaves → delete the club" branch ran as a `BEFORE DELETE` trigger, which cascades `clubs`'s deletion back into `club_members` — including the very row the outer statement is currently deleting — a classic Postgres "tuple already modified by an operation triggered by the current command" conflict. Fixed by changing the trigger to `AFTER DELETE` (the other branch, promoting the next owner, is unaffected either way since it never touches the row being deleted). Added Test 15 to the battery, since this branch was previously never exercised.

Also noted by the reviewer as a real but lower-severity, accepted gap: a club owner *could* bypass `transfer_club_ownership()` by issuing a raw `update clubs set owner_id = ...` directly — `trg_enforce_club_owner_change` would allow it (caller is owner, target is an active member) but leave `club_members.role` out of sync with the new `owner_id`. Left unfixed deliberately: only an already-fully-privileged owner can trigger it against themselves (not a privilege escalation from a lower role), the real app code never constructs this call (`updateClub`'s TypeScript signature never exposes `ownerId` as settable), and closing it fully would mean duplicating `transfer_club_ownership()`'s role-sync logic into the trigger itself — the same class of "RLS is permissive here, the app layer is trusted not to misuse its own access" tradeoff this codebase already makes explicitly for `notifications insert as actor`.

- [ ] **Step 1: Write the migration file**

```sql
-- EPIC-05 Bloque E — Clubes: creación, membresía y roles. Ver
-- docs/superpowers/specs/2026-07-12-epic05-bloque-e-clubs-design.md (SD-4 en
-- docs/requirements/social-epic.md fijó el patrón: helpers SECURITY DEFINER
-- replicando el RBAC de §7.35, contenido siempre solo-miembros
-- independientemente de `visibility`).

create type public.club_visibility as enum ('public', 'private');

-- Orden ASCENDENTE de autoridad (mismo patrón que user_role: user<collaborator
-- <admin) — Postgres compara enums por orden de declaración, así que 'member'
-- va primero para que has_min_club_role()/las comparaciones de rol funcionen.
create type public.club_role as enum ('member', 'moderator', 'owner');

-- invited: un moderator+ le invitó, espera que ÉL acepte o rechace. No hay
-- 'pending' (solicitud propia) -- unirse a un club privado es SOLO por
-- invitación; un club privado es invisible a no-miembros (SD-4), así que un
-- no-miembro no podría siquiera comprobar que el club existe para solicitar
-- unirse, y una solicitud a un club público no tiene sentido (se une directo).
create type public.club_member_status as enum ('invited', 'active');

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  cover_url text,
  visibility public.club_visibility not null default 'public',
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.club_role not null default 'member',
  status public.club_member_status not null default 'active',
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create index idx_club_members_club on public.club_members (club_id, status);
create index idx_club_members_user on public.club_members (user_id, status);

comment on table public.clubs is 'Clubes de EPIC-05 Bloque E. visibility gobierna descubrimiento/cómo unirse, nunca quién ve el contenido (SD-4) — eso lo decide is_club_member().';
comment on table public.club_members is 'Membresía y rol por club. status=invited (invitación de un moderator+, pendiente de aceptar) / active. Unirse a un club privado es solo por invitación -- no hay solicitud propia. role solo cambia vía create_club/set_club_member_role/transfer_club_ownership (funciones SECURITY DEFINER), nunca por UPDATE de cliente.';

-- ── Helpers SECURITY DEFINER (mismo patrón que has_min_role/current_user_role,
-- §7.35) — evitan RLS recursiva sobre club_members. Solo cuentan filas
-- status='active': una fila invited ya tiene un role (default 'member'),
-- pero no es membresía real todavía.
create or replace function public.is_club_member(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.club_role(p_club_id uuid)
returns public.club_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.club_members
  where club_id = p_club_id and user_id = auth.uid() and status = 'active';
$$;

create or replace function public.has_min_club_role(p_club_id uuid, min public.club_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.club_role(p_club_id) >= min, false);
$$;

comment on function public.is_club_member(uuid) is 'True si el usuario actual es miembro ACTIVO del club (EPIC-05 Bloque E).';
comment on function public.club_role(uuid) is 'Rol del usuario actual en el club, o null si no es miembro activo.';
comment on function public.has_min_club_role(uuid, public.club_role) is 'True si el rol del usuario actual en el club es >= min en la jerarquía member<moderator<owner.';

-- club_member_row_exists: a diferencia de is_club_member() (exige
-- status='active' a propósito), esto cuenta CUALQUIER fila (invited o
-- active) -- lo usa la política SELECT de clubs para que un invitado vea el
-- club antes de aceptar. Tiene que ser una función SECURITY DEFINER y no un
-- exists(...) inline dentro de la política: Postgres detecta como recursión
-- estructural (error 42P17) cualquier par de tablas cuyas políticas se
-- referencien directamente entre sí sin un límite de función por medio --
-- club_members ya referencia clubs directamente en su política INSERT
-- (visibilidad de 'public'), así que clubs no puede referenciar
-- club_members directamente también, aunque en runtime nunca recursionaría
-- de verdad. Este es exactamente el motivo de que is_club_member()/
-- club_role()/has_min_club_role() ya sean funciones en vez de subqueries
-- inline.
create or replace function public.club_member_row_exists(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = auth.uid()
  );
$$;

comment on function public.club_member_row_exists(uuid) is 'True si el usuario actual tiene cualquier fila en club_members para este club (invited o active). Rompe la referencia cruzada directa entre las políticas de clubs y club_members que Postgres rechaza como recursión estructural (42P17) -- ver comentario arriba.';

-- ── Invariante de propiedad: un club con miembros siempre tiene owner ───────
-- Se dispara al borrar CUALQUIER fila de club_members con role='owner', sea
-- por leaveClub (tras su propia guarda, ver Dominio) o por un futuro cascade
-- desde auth.users (borrado de cuenta — no existe todavía, pero este trigger
-- no depende de que un futuro feature recuerde gestionarlo).
--
-- AFTER DELETE, no BEFORE: la rama "sin miembros restantes" borra la fila de
-- clubs, que en cascada (club_members.club_id on delete cascade) intenta
-- volver a borrar filas de club_members del mismo club -- incluida la que
-- este trigger está procesando ahora mismo. Si el trigger fuera BEFORE
-- DELETE, esa fila SEGUIRÍA sin borrarse todavía en el momento en que el
-- cascade la alcanza, y Postgres lo rechaza ("tuple to be deleted was
-- already modified by an operation triggered by the current command").
-- Con AFTER DELETE, cuando el trigger corre la fila original YA ha sido
-- eliminada por la sentencia externa, así que el cascade no encuentra nada
-- que la vuelva a tocar. La otra rama (promocionar al siguiente owner) SÍ
-- se ve afectada por este cambio de forma indirecta: su UPDATE a
-- clubs.owner_id dispara enforce_club_owner_change_authorized(), que
-- comprobaría la autoridad del owner SALIENTE -- cuya fila en club_members
-- ya no existe en este punto (AFTER DELETE). Por eso esa función tiene su
-- propia excepción vía pg_trigger_depth() -- ver su comentario.
create or replace function public.reassign_club_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_user uuid;
begin
  if old.role <> 'owner' then
    return null;
  end if;

  select user_id into v_next_user
    from public.club_members
    where club_id = old.club_id and user_id <> old.user_id and status = 'active'
    order by (role = 'moderator') desc, joined_at asc
    limit 1;

  if v_next_user is null then
    delete from public.clubs where id = old.club_id;
  else
    update public.club_members set role = 'owner'
      where club_id = old.club_id and user_id = v_next_user;
    update public.clubs set owner_id = v_next_user where id = old.club_id;
  end if;

  return null;
end;
$$;

create trigger trg_reassign_club_ownership
  after delete on public.club_members
  for each row execute function public.reassign_club_ownership();

-- ── Guarda de cambio de owner_id: solo el owner actual, y solo hacia un
-- miembro activo. Se aplica pase lo que pase (RPC transfer_club_ownership o,
-- en teoría, un UPDATE directo si alguien se saltara la app) — el RPC
-- necesita esto igualmente para el caso "no toca club_members", así que no es
-- redundante con la política RLS de clubs (que no puede validar "es miembro
-- activo" sin este trigger).
--
-- Excepción: pg_trigger_depth() > 1 significa que este UPDATE se disparó
-- desde DENTRO de otro trigger -- en esta migración, solo puede ser
-- reassign_club_ownership() reasignando tras el DELETE de la fila del owner
-- saliente (transfer_club_ownership() es una función normal, no un trigger,
-- así que llamarla NO añade profundidad; un cliente que se salte la app
-- tampoco). En ese caso concreto, has_min_club_role(old.id,'owner') SIEMPRE
-- daría false -- la fila del owner saliente ya no existe, se acaba de
-- borrar -- aunque la reasignación sea perfectamente legítima; y
-- reassign_club_ownership() ya garantiza por su cuenta que v_next_user es
-- miembro activo (su propia query solo selecciona status='active'), así que
-- repetir ambas comprobaciones aquí no solo es redundante sino que rompe la
-- reasignación real.
create or replace function public.enforce_club_owner_change_authorized()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    if pg_trigger_depth() > 1 then
      return new;
    end if;
    if not public.has_min_club_role(old.id, 'owner') then
      raise exception 'Only the current owner can change club ownership';
    end if;
    if not exists (
      select 1 from public.club_members
      where club_id = old.id and user_id = new.owner_id and status = 'active'
    ) then
      raise exception 'New owner must be an active club member';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_club_owner_change
  before update on public.clubs
  for each row execute function public.enforce_club_owner_change_authorized();

-- ── RPCs SECURITY DEFINER para escritura coordinada/sensible ────────────────
-- create_club: inserta clubs + la fila de club_members del owner atómicamente.
-- No hay política INSERT en clubs (ver RLS) — este RPC es el ÚNICO camino.
create or replace function public.create_club(
  p_slug text,
  p_name text,
  p_description text,
  p_visibility public.club_visibility,
  p_cover_url text
) returns public.clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club public.clubs;
begin
  insert into public.clubs (slug, name, description, visibility, cover_url, owner_id)
  values (p_slug, p_name, p_description, p_visibility, p_cover_url, auth.uid())
  returning * into v_club;

  insert into public.club_members (club_id, user_id, role, status)
  values (v_club.id, auth.uid(), 'owner', 'active');

  return v_club;
end;
$$;

revoke execute on function public.create_club(text, text, text, public.club_visibility, text) from public, anon;
grant execute on function public.create_club(text, text, text, public.club_visibility, text) to authenticated;

-- set_club_member_role: owner-only, nunca hacia/desde 'owner' (eso es
-- transfer_club_ownership). No puedes cambiar tu propio rol.
create or replace function public.set_club_member_role(
  p_club_id uuid,
  p_user_id uuid,
  p_role public.club_role
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_min_club_role(p_club_id, 'owner') then
    raise exception 'forbidden';
  end if;
  if p_role = 'owner' then
    raise exception 'use transfer_club_ownership to change the owner';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot change your own role';
  end if;

  update public.club_members set role = p_role
    where club_id = p_club_id and user_id = p_user_id and status = 'active';
  if not found then
    raise exception 'member not found';
  end if;
end;
$$;

revoke execute on function public.set_club_member_role(uuid, uuid, public.club_role) from public, anon;
grant execute on function public.set_club_member_role(uuid, uuid, public.club_role) to authenticated;

-- transfer_club_ownership: owner-only, target debe ser miembro activo. El
-- owner saliente pasa a moderator (conserva posición de confianza), el
-- entrante pasa a owner, clubs.owner_id se actualiza. Atómico.
create or replace function public.transfer_club_ownership(
  p_club_id uuid,
  p_new_owner_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_owner uuid;
begin
  -- Un solo mensaje 'forbidden' para "no existe" y "no eres el owner" --
  -- distinguirlos daría un oráculo de existencia para probar UUIDs de club
  -- privados arbitrarios (SD-4 los quiere indescubribles). Mismo patrón que
  -- set_club_member_role() de arriba.
  select owner_id into v_current_owner from public.clubs where id = p_club_id;
  if v_current_owner is null or v_current_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;
  if p_new_owner_id = v_current_owner then
    raise exception 'already the owner';
  end if;
  if not exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = p_new_owner_id and status = 'active'
  ) then
    raise exception 'target is not an active member';
  end if;

  update public.club_members set role = 'moderator'
    where club_id = p_club_id and user_id = v_current_owner;
  update public.club_members set role = 'owner'
    where club_id = p_club_id and user_id = p_new_owner_id;
  update public.clubs set owner_id = p_new_owner_id where id = p_club_id;
end;
$$;

revoke execute on function public.transfer_club_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_club_ownership(uuid, uuid) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.clubs enable row level security;

-- La fila ENTERA (incl. description) de un club privado es invisible a
-- no-miembros, no solo su contenido (SD-4). "member" aquí incluye status
-- 'invited', no solo 'active' -- is_club_member() exige 'active' a
-- propósito (ver su comentario), así que NO se usa aquí: alguien invitado a
-- un club privado necesita ver su nombre/descripción/portada para decidir
-- si acepta, antes de ser miembro real. Postgres además exige que una fila
-- sea visible por SELECT antes de que cualquier política UPDATE/DELETE
-- pueda tocarla -- ver la política de club_members más abajo, mismo motivo.
-- Usa club_member_row_exists() (función) en vez de un exists(...) inline a
-- club_members: club_members ya referencia clubs directamente en su
-- política INSERT, y con AMBAS direcciones como subquery inline Postgres
-- rechaza el plan como recursión estructural (42P17) -- ver el comentario
-- de club_member_row_exists() más arriba.
create policy "clubs select public or member" on public.clubs
  for select to anon, authenticated
  using (
    visibility = 'public'
    or public.club_member_row_exists(id)
  );

-- Sin política INSERT a propósito: create_club() es el único camino (bypassa
-- RLS vía SECURITY DEFINER). Esto evita tener que replicar en RLS la lógica
-- coordinada de "inserta clubs Y la fila de owner en club_members".
create policy "clubs update moderator+" on public.clubs
  for update to authenticated
  using (public.has_min_club_role(id, 'moderator'))
  with check (public.has_min_club_role(id, 'moderator'));

alter table public.club_members enable row level security;

-- Roster completo solo para miembros ACTIVOS (is_club_member). Además, CUALQUIERA
-- ve su PROPIA fila sin importar el status -- necesario para que un invitado
-- pueda ver (y por tanto aceptar) su propia invitación: Postgres exige que una
-- fila pase la política SELECT antes de que UPDATE/DELETE puedan tocarla,
-- incluso si su propia política USING ya lo permitiría. Sin esto, "club_members
-- accept invite" nunca afectaría ninguna fila (0 resultados siempre), porque
-- is_club_member() exige status='active' y un invitado todavía no lo es.
create policy "club_members select member" on public.club_members
  for select to authenticated
  using (
    public.is_club_member(club_id)
    or user_id = (select auth.uid())
  );

-- role='member' siempre en esta política — la fila de owner la crea
-- create_club() (bypass RLS), los ascensos van por set_club_member_role().
-- Sin esto, un self-insert o una invitación podrían intentar colarse como
-- role='owner' o cualquier otro valor.
--
-- Solo dos formas de entrar: auto-unirse a un club PÚBLICO (status=active
-- directo) o ser invitado por un moderator+ (status=invited, cualquier
-- visibilidad). No existe un self-insert 'pending' para clubes privados: la
-- fila de un club privado es invisible a no-miembros (SD-4), así que quien
-- quisiera solicitar unirse no podría ni comprobar que el club existe —
-- unirse a un privado es solo por invitación.
create policy "club_members insert self or invite" on public.club_members
  for insert to authenticated
  with check (
    role = 'member'
    and (
      (
        user_id = (select auth.uid())
        and status = 'active'
        and exists (
          select 1 from public.clubs c where c.id = club_id and c.visibility = 'public'
        )
      )
      or (
        user_id <> (select auth.uid())
        and status = 'invited'
        and public.has_min_club_role(club_id, 'moderator')
      )
    )
  );

-- Auto-servicio únicamente: aceptar tu propia invitación. No hay rama de
-- moderación aquí -- sin 'pending', no hay solicitudes que un moderator+
-- tenga que aprobar. with check exige status='active' Y role='member': sin
-- el "and role = 'member'", un invitado podría colar role='owner' en la
-- MISMA llamada que acepta su invitación (with check solo valida la fila
-- NUEVA propuesta, no compara contra la fila vieja) -- se convertiría en
-- owner sin pasar nunca por create_club()/transfer_club_ownership().
create policy "club_members accept invite" on public.club_members
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'invited')
  with check (status = 'active' and role = 'member');

-- Auto-servicio (salir/rechazar tu propia fila) o moderación: un moderator+
-- puede expulsar a alguien de rol estrictamente inferior al suyo — no a otro
-- moderator ni al owner.
create policy "club_members delete self or moderate" on public.club_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (public.has_min_club_role(club_id, 'moderator') and public.club_role(club_id) > role)
  );

-- ── Notificaciones de club (EPIC-05 Bloque E), mismo patrón simétrico que
-- follow_request/follow_accepted. Solo 2 tipos -- sin solicitud de unión
-- propia (ver arriba), no hace falta club_join_request/club_join_approved.
-- notifications.target_type es texto suelto (no el enum target_kind de
-- reactions/comments) — se usa el literal 'club'.
alter type public.notification_type add value 'club_invite';
alter type public.notification_type add value 'club_invite_accepted';
```

- [ ] **Step 2: Apply the migration to dev via the Management API**

```bash
node -e '
const fs = require("fs");
const sql = fs.readFileSync("supabase/migrations/20260712_clubs.sql", "utf8");
fetch("https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/database/query", {
  method: "POST",
  headers: { Authorization: "Bearer " + process.env.SUPABASE_ACCESS_TOKEN, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
}).then(async r => { console.log("STATUS", r.status); console.log(await r.text()); });
'
```

Expected: `STATUS 201` and no error body.

- [ ] **Step 3: Run the RLS + RPC impersonation battery against dev**

Everything happens inside one rolled-back transaction. Uses `set_config(..., false)` (non-local) to persist results across DO block subtransaction rollbacks, read back in one final SELECT — same pattern used for `push_subscriptions`' battery in E5.D4.

```sql
begin;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'rls-test-owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'rls-test-mod@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'rls-test-member@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'rls-test-outsider@example.com');
insert into public.profiles (user_id, username, is_public) values
  ('11111111-1111-1111-1111-111111111111', 'rlstest_owner', true),
  ('22222222-2222-2222-2222-222222222222', 'rlstest_mod', true),
  ('33333333-3333-3333-3333-333333333333', 'rlstest_member', true),
  ('44444444-4444-4444-4444-444444444444', 'rlstest_outsider', true);

-- Test 1: A crea un club PRIVADO vía create_club() -> OK, owner_id = A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.create_club('rlstest-club', 'RLS Test Club', 'desc', 'private', null);
select set_config('app.test1', (select owner_id::text from public.clubs where slug = 'rlstest-club'), false);

-- Test 1b: A crea también un club PÚBLICO, para probar el auto-join directo.
select public.create_club('rlstest-club-pub', 'RLS Test Club Pub', 'desc', 'public', null);
select set_config('app.test1b', (select owner_id::text from public.clubs where slug = 'rlstest-club-pub'), false);

-- Test 2: D (outsider) intenta insertar su propia fila como role=owner en el
-- club privado -> debe fallar (RLS: role='member' obligatorio).
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
do $$
begin
  insert into public.club_members (club_id, user_id, role, status)
    values ((select id from public.clubs where slug = 'rlstest-club'), '44444444-4444-4444-4444-444444444444', 'owner', 'active');
  perform set_config('app.test2', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test2', 'ok_rejected: ' || sqlerrm, false);
end $$;

-- Test 3: D intenta insertar status='pending' -> debe fallar con un error de
-- ENUM inválido (confirma que 'pending' ya no existe como valor válido; unirse
-- a un privado es solo por invitación).
do $$
begin
  insert into public.club_members (club_id, user_id, status)
    values ((select id from public.clubs where slug = 'rlstest-club'), '44444444-4444-4444-4444-444444444444', 'pending');
  perform set_config('app.test3', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test3', 'ok_rejected: ' || sqlerrm, false);
end $$;

-- Test 4: D se auto-une directo al club PÚBLICO (status=active) -> OK, 1 fila.
insert into public.club_members (club_id, user_id, status)
  values ((select id from public.clubs where slug = 'rlstest-club-pub'), '44444444-4444-4444-4444-444444444444', 'active');
select set_config('app.test4', (select status::text from public.club_members where club_id = (select id from public.clubs where slug = 'rlstest-club-pub') and user_id = '44444444-4444-4444-4444-444444444444'), false);

-- Test 5: A invita a B al club PRIVADO -> OK, status=invited.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.club_members (club_id, user_id, status)
  values ((select id from public.clubs where slug = 'rlstest-club'), '22222222-2222-2222-2222-222222222222', 'invited');
select set_config('app.test5', (select status::text from public.club_members where club_id = (select id from public.clubs where slug = 'rlstest-club') and user_id = '22222222-2222-2222-2222-222222222222'), false);

-- Test 5b: B (todavía invited, no active) puede ver la fila del club privado
-- -- necesario para que /club/[slug] no dé 404 antes de aceptar. Sin la rama
-- "exists club_members para mí" en la política SELECT de clubs, esto
-- devolvería 0 (is_club_member exige status='active').
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select set_config('app.test5b', (select count(*)::text from public.clubs where slug = 'rlstest-club'), false);

-- Test 6: B acepta su propia invitación -> OK.
with updated as (
  update public.club_members set status = 'active'
    where club_id = (select id from public.clubs where slug = 'rlstest-club') and user_id = '22222222-2222-2222-2222-222222222222'
    returning user_id
)
select set_config('app.test6', (select count(*)::text from updated), false);

-- Test 7: A invita a C al club PRIVADO, C acepta -> OK (usado para el test de
-- expulsión de Test 9).
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.club_members (club_id, user_id, status)
  values ((select id from public.clubs where slug = 'rlstest-club'), '33333333-3333-3333-3333-333333333333', 'invited');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
with updated as (
  update public.club_members set status = 'active'
    where club_id = (select id from public.clubs where slug = 'rlstest-club') and user_id = '33333333-3333-3333-3333-333333333333'
    returning user_id
)
select set_config('app.test7', (select count(*)::text from updated), false);

-- Test 8: A promueve a B a moderator vía set_club_member_role() -> OK.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.set_club_member_role((select id from public.clubs where slug = 'rlstest-club'), '22222222-2222-2222-2222-222222222222', 'moderator');
select set_config('app.test8', (select role::text from public.club_members where club_id = (select id from public.clubs where slug = 'rlstest-club') and user_id = '22222222-2222-2222-2222-222222222222'), false);

-- Test 9: B (ahora moderator) expulsa a C (member) -> OK, 1 fila.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
with deleted as (
  delete from public.club_members
    where club_id = (select id from public.clubs where slug = 'rlstest-club') and user_id = '33333333-3333-3333-3333-333333333333'
    returning user_id
)
select set_config('app.test9', (select count(*)::text from deleted), false);

-- Test 10: B (moderator) intenta cambiar su PROPIO rol vía set_club_member_role
-- -> debe fallar (no es owner, y además no puedes auto-cambiarte).
do $$
begin
  perform public.set_club_member_role((select id from public.clubs where slug = 'rlstest-club'), '22222222-2222-2222-2222-222222222222', 'owner');
  perform set_config('app.test10', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test10', 'ok_rejected: ' || sqlerrm, false);
end $$;

-- Test 11: A transfiere la propiedad a B (moderator activo) -> OK.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.transfer_club_ownership((select id from public.clubs where slug = 'rlstest-club'), '22222222-2222-2222-2222-222222222222');
select set_config('app.test11', (select owner_id::text from public.clubs where slug = 'rlstest-club') || ' role=' || (select role::text from public.club_members where club_id = (select id from public.clubs where slug = 'rlstest-club') and user_id = '11111111-1111-1111-1111-111111111111'), false);

-- Test 12: A (ya no owner, ahora moderator) intenta leaveClub-equivalent
-- (borrar su propia fila) con B (owner) todavía presente -> permitido a nivel
-- RLS (self-delete siempre permitido); la guarda "no puedes salir sin
-- transferir" es de leaveClub() en la app, no de RLS -- se verifica en el
-- checklist manual, no aquí.
with deleted as (
  delete from public.club_members
    where club_id = (select id from public.clubs where slug = 'rlstest-club') and user_id = '11111111-1111-1111-1111-111111111111'
    returning user_id
)
select set_config('app.test12', (select count(*)::text from deleted), false);

-- Test 13: anon no ve el club privado.
reset role;
set local role anon;
select set_config('app.test13', (select count(*)::text from public.clubs where slug = 'rlstest-club'), false);

-- Test 14: B (owner tras la transferencia) invita a C de nuevo; C intenta
-- aceptar colando role='owner' en la MISMA llamada -> debe fallar (with
-- check de "club_members accept invite" exige role='member').
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.club_members (club_id, user_id, status)
  values ((select id from public.clubs where slug = 'rlstest-club'), '33333333-3333-3333-3333-333333333333', 'invited');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
do $$
begin
  update public.club_members set status = 'active', role = 'owner'
    where club_id = (select id from public.clubs where slug = 'rlstest-club') and user_id = '33333333-3333-3333-3333-333333333333';
  perform set_config('app.test14', 'FAILED_no_error_raised', false);
exception when others then
  perform set_config('app.test14', 'ok_rejected: ' || sqlerrm, false);
end $$;

-- Test 15: A crea un tercer club sin invitar a nadie, luego se borra a sí
-- mismo (único miembro) -> el trigger debe borrar también la fila de clubs,
-- SIN lanzar "tuple to be deleted was already modified" (ver AFTER DELETE
-- en reassign_club_ownership).
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.create_club('rlstest-club-solo', 'RLS Test Solo', 'desc', 'public', null);
do $$
begin
  delete from public.club_members
    where club_id = (select id from public.clubs where slug = 'rlstest-club-solo') and user_id = '11111111-1111-1111-1111-111111111111';
  perform set_config('app.test15', 'ok_no_error: club_rows=' || (select count(*)::text from public.clubs where slug = 'rlstest-club-solo'), false);
exception when others then
  perform set_config('app.test15', 'FAILED_error: ' || sqlerrm, false);
end $$;

-- Test 16: A crea un cuarto club, invita a B, B acepta; A (owner) se borra a
-- sí mismo con B todavía activo -> debe promocionar a B a owner SIN error
-- (regresión del fix de Test 15/AFTER DELETE: la rama "promote next owner"
-- del trigger dispara enforce_club_owner_change_authorized(), que debe
-- reconocer vía pg_trigger_depth() > 1 que es una reasignación interna de
-- confianza y no exigir que la fila de A siga existiendo).
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.create_club('rlstest-club-promo', 'RLS Test Promo', 'desc', 'public', null);
insert into public.club_members (club_id, user_id, status)
  values ((select id from public.clubs where slug = 'rlstest-club-promo'), '22222222-2222-2222-2222-222222222222', 'invited');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
update public.club_members set status = 'active'
  where club_id = (select id from public.clubs where slug = 'rlstest-club-promo') and user_id = '22222222-2222-2222-2222-222222222222';
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
begin
  delete from public.club_members
    where club_id = (select id from public.clubs where slug = 'rlstest-club-promo') and user_id = '11111111-1111-1111-1111-111111111111';
  perform set_config('app.test16', 'ok_no_error: new_owner=' || (select owner_id::text from public.clubs where slug = 'rlstest-club-promo'), false);
exception when others then
  perform set_config('app.test16', 'FAILED_error: ' || sqlerrm, false);
end $$;

reset role;
select
  current_setting('app.test1', true) as test1_create_club_priv_owner_is_a,
  current_setting('app.test1b', true) as test1b_create_club_pub_owner_is_a,
  current_setting('app.test2', true) as test2_outsider_self_insert_as_owner,
  current_setting('app.test3', true) as test3_pending_status_no_longer_valid,
  current_setting('app.test4', true) as test4_self_join_public_club,
  current_setting('app.test5', true) as test5_invite_status,
  current_setting('app.test5b', true) as test5b_invited_user_sees_club_expect_1,
  current_setting('app.test6', true) as test6_accept_invite_expect_1,
  current_setting('app.test7', true) as test7_second_invite_accept_expect_1,
  current_setting('app.test8', true) as test8_promote_to_moderator,
  current_setting('app.test9', true) as test9_moderator_removes_member_expect_1,
  current_setting('app.test10', true) as test10_self_role_change_rejected,
  current_setting('app.test11', true) as test11_transfer_ownership,
  current_setting('app.test12', true) as test12_leave_after_transfer_expect_1,
  current_setting('app.test13', true) as test13_anon_sees_private_club_expect_0,
  current_setting('app.test14', true) as test14_accept_invite_role_escalation_rejected,
  current_setting('app.test15', true) as test15_sole_member_leaves_deletes_club,
  current_setting('app.test16', true) as test16_promote_after_owner_leaves;

rollback;
```

Confirm: test1 = A's id, test1b = A's id, test2 = `ok_rejected: ...`, test3 = `ok_rejected: ...` (must mention `invalid input value for enum`), test4 = `active`, test5 = `invited`, test5b = `1`, test6 = `1`, test7 = `1`, test8 = `moderator`, test9 = `1`, test10 = `ok_rejected: ...`, test11 = `<B's id> role=moderator`, test12 = `1`, test13 = `0`, test14 = `ok_rejected: ...`, test15 = `ok_no_error: club_rows=0`, test16 = `ok_no_error: new_owner=<B's id>` (B = `22222222-2222-2222-2222-222222222222`). If any test doesn't match, fix the migration and re-run Steps 2–3 (drop-and-retry: `drop table if exists public.club_members, public.clubs cascade; drop type if exists public.club_visibility, public.club_role, public.club_member_status cascade; drop function if exists public.is_club_member, public.club_role, public.has_min_club_role, public.club_member_row_exists, public.reassign_club_ownership, public.enforce_club_owner_change_authorized, public.create_club, public.set_club_member_role, public.transfer_club_ownership cascade;` — the `alter type notification_type add value` statements can't be rolled back by dropping, but re-running the migration is idempotent for those since a repeat `add value` on an already-present value errors harmlessly and can be commented out on retry if needed).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260712_clubs.sql
git commit -m "feat: add clubs schema, roles, and RLS for EPIC-05 Bloque E"
```

---

### Task 2: `schema-baseline.sql` + `database.types.ts` patch

**Files:**
- Modify: `supabase/schema-baseline.sql` (append at end)
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: TypeScript types `Database["public"]["Tables"]["clubs"]`, `Database["public"]["Tables"]["club_members"]`, `Database["public"]["Enums"]["club_visibility"|"club_role"|"club_member_status"]`, `Database["public"]["Functions"]["create_club"|"set_club_member_role"|"transfer_club_ownership"]`.

- [ ] **Step 1: Append the migration SQL to `schema-baseline.sql`**

Append the entire content of `supabase/migrations/20260712_clubs.sql` (written in Task 1) verbatim at the very end of `supabase/schema-baseline.sql`, preceded by:

```sql


-- ============================================================
-- 20260712_clubs.sql (EPIC-05 Bloque E)
-- ============================================================
```

- [ ] **Step 2: Patch `database.types.ts` — add the `clubs` and `club_members` table types**

Find the end of the `push_subscriptions` block in the `Tables` section (ends right before `reactions: {` — anchor used by Bloque E's own migration ordering; verify by grepping for `push_subscriptions: {` and reading forward to its closing `}`) and insert immediately after it:

```ts
      clubs: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          slug: string
          visibility: Database["public"]["Enums"]["club_visibility"]
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          slug: string
          visibility?: Database["public"]["Enums"]["club_visibility"]
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          visibility?: Database["public"]["Enums"]["club_visibility"]
        }
        Relationships: []
      }
      club_members: {
        Row: {
          club_id: string
          joined_at: string
          role: Database["public"]["Enums"]["club_role"]
          status: Database["public"]["Enums"]["club_member_status"]
          user_id: string
        }
        Insert: {
          club_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["club_role"]
          status?: Database["public"]["Enums"]["club_member_status"]
          user_id: string
        }
        Update: {
          club_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["club_role"]
          status?: Database["public"]["Enums"]["club_member_status"]
          user_id?: string
        }
        Relationships: []
      }
```

- [ ] **Step 3: Patch `database.types.ts` — extend the `Enums` block**

Find the `Enums: {` block (alongside `notification_type`/`push_channel`/`target_kind`) and add, keeping alphabetical-ish grouping consistent with the file's existing order:

```ts
      club_member_status: "invited" | "active"
      club_role: "member" | "moderator" | "owner"
      club_visibility: "public" | "private"
```

Also update the existing `notification_type` line to add the two new values:

```ts
      notification_type: "follow_request" | "new_follower" | "follow_accepted" | "review_liked" | "review_commented" | "club_invite" | "club_invite_accepted"
```

- [ ] **Step 4: Patch `database.types.ts` — add the `Functions` block entries**

Find `Functions: {` inside `Database["public"]` (if it doesn't exist yet, add it as a sibling of `Tables`/`Enums` inside `public: {`) and add:

```ts
      create_club: {
        Args: {
          p_slug: string
          p_name: string
          p_description: string
          p_visibility: Database["public"]["Enums"]["club_visibility"]
          p_cover_url: string
        }
        Returns: Database["public"]["Tables"]["clubs"]["Row"]
      }
      set_club_member_role: {
        Args: {
          p_club_id: string
          p_user_id: string
          p_role: Database["public"]["Enums"]["club_role"]
        }
        Returns: undefined
      }
      transfer_club_ownership: {
        Args: {
          p_club_id: string
          p_new_owner_id: string
        }
        Returns: undefined
      }
```

- [ ] **Step 5: Patch `database.types.ts` — extend the `Constants` block**

Find `export const Constants = { public: { Enums: {` and add, matching Step 3's additions:

```ts
      club_member_status: ["invited", "active"],
      club_role: ["member", "moderator", "owner"],
      club_visibility: ["public", "private"],
```

And update the existing `notification_type` array line:

```ts
      notification_type: ["follow_request", "new_follower", "follow_accepted", "review_liked", "review_commented", "club_invite", "club_invite_accepted"],
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add supabase/schema-baseline.sql src/lib/supabase/database.types.ts
git commit -m "chore: sync schema-baseline and generated types for clubs"
```

---

### Task 3: `src/lib/clubs/clubs.ts` — club CRUD

**Files:**
- Create: `src/lib/clubs/clubs.ts`

**Interfaces:**
- Consumes: `Database["public"]["Tables"]["clubs"]`, `Database["public"]["Functions"]["create_club"]` (Task 2).
- Produces: `type Club`, `type ClubMembershipStatus = "none" | "invited" | "active"` (no `"pending"` — joining a private club is invite-only, see Task 1's design correction), `createClub(input: { name: string; slug: string; description?: string; visibility: "public"|"private"; coverUrl?: string }): Promise<Club>`, `updateClub(clubId: string, input: { name?: string; description?: string; visibility?: "public"|"private"; coverUrl?: string }): Promise<void>`, `getClub(slug: string): Promise<(Club & { viewerStatus: ClubMembershipStatus; viewerRole: "member"|"moderator"|"owner"|null }) | null>`, `listMyClubs(): Promise<Club[]>`, `discoverPublicClubs(query?: string): Promise<(Club & { viewerStatus: ClubMembershipStatus })[]>`. Consumed by Task 4 (membership functions reference `Club`), Task 6+ (UI).

- [ ] **Step 1: Write `src/lib/clubs/clubs.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Club = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  visibility: "public" | "private";
  ownerId: string;
  createdAt: string;
};

export type ClubMembershipStatus = "none" | "invited" | "active";

function mapClub(row: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  visibility: "public" | "private";
  owner_id: string;
  created_at: string;
}): Club {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    coverUrl: row.cover_url,
    visibility: row.visibility,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

// Sin política INSERT en clubs (ver migración 20260712_clubs.sql) — create_club
// es el único camino, inserta clubs + la fila de owner en club_members
// atómicamente vía SECURITY DEFINER.
export async function createClub(input: {
  name: string;
  slug: string;
  description?: string;
  visibility: "public" | "private";
  coverUrl?: string;
}): Promise<Club> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("create_club", {
    p_slug: input.slug,
    p_name: input.name,
    p_description: input.description ?? "",
    p_visibility: input.visibility,
    p_cover_url: input.coverUrl ?? "",
  });
  if (error) throw error;
  return mapClub(data);
}

export async function updateClub(
  clubId: string,
  input: {
    name?: string;
    description?: string;
    visibility?: "public" | "private";
    coverUrl?: string;
  },
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("clubs")
    .update({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
      ...(input.coverUrl !== undefined && { cover_url: input.coverUrl }),
    })
    .eq("id", clubId);
  if (error) throw error;
}

export async function getClub(slug: string): Promise<
  (Club & { viewerStatus: ClubMembershipStatus; viewerRole: "member" | "moderator" | "owner" | null }) | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: clubRow, error } = await supabase
    .from("clubs")
    .select("id, slug, name, description, cover_url, visibility, owner_id, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!clubRow) return null;

  let viewerStatus: ClubMembershipStatus = "none";
  let viewerRole: "member" | "moderator" | "owner" | null = null;
  if (user) {
    const { data: membership } = await supabase
      .from("club_members")
      .select("status, role")
      .eq("club_id", clubRow.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership) {
      viewerStatus = membership.status;
      viewerRole = membership.status === "active" ? membership.role : null;
    }
  }

  return { ...mapClub(clubRow), viewerStatus, viewerRole };
}

export async function listMyClubs(): Promise<Club[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("club_members")
    .select("clubs(id, slug, name, description, cover_url, visibility, owner_id, created_at)")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (error) throw error;

  return (data ?? [])
    .map((row) => row.clubs)
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map(mapClub);
}

export async function discoverPublicClubs(
  query?: string,
): Promise<(Club & { viewerStatus: ClubMembershipStatus })[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let request = supabase
    .from("clubs")
    .select("id, slug, name, description, cover_url, visibility, owner_id, created_at")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(30);
  if (query) request = request.ilike("name", `%${query}%`);

  const { data, error } = await request;
  if (error) throw error;
  const clubs = (data ?? []).map(mapClub);
  if (!user || clubs.length === 0) {
    return clubs.map((c) => ({ ...c, viewerStatus: "none" as const }));
  }

  const { data: memberships } = await supabase
    .from("club_members")
    .select("club_id, status")
    .eq("user_id", user.id)
    .in("club_id", clubs.map((c) => c.id));
  const statusByClub = new Map((memberships ?? []).map((m) => [m.club_id, m.status]));

  return clubs.map((c) => ({ ...c, viewerStatus: statusByClub.get(c.id) ?? "none" }));
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean. If `supabase.rpc("create_club", ...)` doesn't type-check against the `Functions` block added in Task 2, double check the `Args` field names match exactly (`p_slug`, `p_name`, `p_description`, `p_visibility`, `p_cover_url`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/clubs/clubs.ts
git commit -m "feat: add club CRUD domain functions"
```

---

### Task 4: `src/lib/clubs/membership.ts` — membership/role actions + notification wiring

**Files:**
- Create: `src/lib/clubs/membership.ts`
- Modify: `src/lib/social/notifications.ts`
- Modify: `src/components/social/notification-bell.tsx`
- Modify: `src/lib/social/notification-types.ts`

**Interfaces:**
- Consumes: `Database["public"]["Functions"]["set_club_member_role"|"transfer_club_ownership"]` (Task 2), `notify()` from `src/lib/social/notifications.ts`.
- Produces: `joinClub(clubId: string): Promise<void>`, `leaveClub(clubId: string): Promise<void>`, `removeMember(clubId: string, userId: string): Promise<void>`, `inviteMember(clubId: string, userId: string): Promise<void>`, `acceptInvite(clubId: string): Promise<void>`, `declineInvite(clubId: string): Promise<void>`, `setMemberRole(clubId: string, userId: string, role: "member"|"moderator"): Promise<void>`, `transferOwnership(clubId: string, newOwnerId: string): Promise<void>`. Consumed by Task 9 (manage-members UI), Task 8 (club-header UI).

No `approveMember` — per Task 1's design correction, joining a private club is invite-only (no self-request flow to approve).

- [ ] **Step 1: Extend `NotificationType` and `NOTIFICATION_TYPE_KEY` in `src/lib/social/notification-types.ts`**

Find:

```ts
export type NotificationType =
  | "follow_request"
  | "new_follower"
  | "follow_accepted"
  | "review_liked"
  | "review_commented";
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
  | "club_invite_accepted";
```

Find:

```ts
export const NOTIFICATION_TYPE_KEY: Record<NotificationType, string> = {
  follow_request: "followRequest",
  new_follower: "newFollower",
  follow_accepted: "followAccepted",
  review_liked: "reviewLiked",
  review_commented: "reviewCommented",
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
};
```

- [ ] **Step 2: Add club href resolution to `notify()`'s `deliverPush` in `src/lib/social/notifications.ts`**

Find the `deliverPush` function's href-resolution block:

```ts
  let href = `/u/${actor.username}`;
  if (params.targetType && params.targetId) {
    const hrefByKey = await resolveReviewHrefs(supabase, [
      { targetType: params.targetType, targetId: params.targetId },
    ]);
    href = hrefByKey.get(`${params.targetType}:${params.targetId}`) ?? href;
  }
```

Replace with:

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

Note: `notify()`'s `params.targetType` is typed `ReviewTargetType` (`"diary_entry" | "episode_watch"`) today — widen it. Find in `src/lib/social/notification-types.ts`:

```ts
export type ReviewTargetType = "diary_entry" | "episode_watch";
```

Replace with:

```ts
export type ReviewTargetType = "diary_entry" | "episode_watch" | "club";
```

- [ ] **Step 3: Do the same club href resolution in `listNotifications()`**

In `src/lib/social/notifications.ts`, find where `hrefByKey` is built in `listNotifications()`:

```ts
  const reviewTargets = representativeRows
    .filter(
      (n): n is typeof n & { target_type: string; target_id: string } =>
        n.target_type != null && n.target_id != null,
    )
    .map((n) => ({ targetType: n.target_type, targetId: n.target_id }));
  const hrefByKey = await resolveReviewHrefs(supabase, reviewTargets);
```

Replace with:

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

- [ ] **Step 4: Add `NOTIFICATION_TYPE_KEY` fallback in `notification-bell.tsx` for the club keys** — no change needed

`notification-bell.tsx` already does `t(NOTIFICATION_TYPE_KEY[n.type], { name: ... })` generically — the two new keys resolve through the same map added in Step 1. Skip to Step 5.

- [ ] **Step 5: Write `src/lib/clubs/membership.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/social/notifications";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

// Solo clubes públicos -- unirse a uno privado es exclusivamente por
// invitación (ver Task 1). Si clubId corresponde a un club privado, la
// SELECT ya devuelve 0 filas para un no-miembro (RLS: SD-4), así que esto
// falla igualmente sin necesitar un chequeo aparte -- el error explícito
// aquí es solo para un mensaje más claro si algo en la UI llegara a
// ofrecer este botón por error.
export async function joinClub(clubId: string): Promise<void> {
  const { supabase, userId } = await requireUser();

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("visibility")
    .eq("id", clubId)
    .single();
  if (clubError) throw clubError;
  if (club.visibility !== "public") {
    throw new Error("private_clubs_require_invitation");
  }

  const { error } = await supabase
    .from("club_members")
    .insert({ club_id: clubId, user_id: userId, status: "active" });
  if (error) throw error;
}

// Rechaza si el actor es owner y hay otros miembros activos -- debe
// transferir la propiedad primero (ver design spec). Si es el único
// miembro, borra el club (el trigger reassign_club_ownership también lo
// haría, pero comprobarlo aquí da un mensaje de error claro en vez de un
// borrado silencioso).
export async function leaveClub(clubId: string): Promise<void> {
  const { supabase, userId } = await requireUser();

  const { data: membership, error: membershipError } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return;

  if (membership.role === "owner") {
    const { count, error: countError } = await supabase
      .from("club_members")
      .select("user_id", { count: "exact", head: true })
      .eq("club_id", clubId)
      .eq("status", "active")
      .neq("user_id", userId);
    if (countError) throw countError;
    if ((count ?? 0) > 0) {
      throw new Error("owner_must_transfer_before_leaving");
    }
  }

  const { error } = await supabase
    .from("club_members")
    .delete()
    .eq("club_id", clubId)
    .eq("user_id", userId);
  if (error) throw error;
}

// moderator+ solo puede invitar; role siempre queda 'member' (promociones
// posteriores van por setMemberRole). No-op si ya existe una fila para ese
// usuario (ya invitado o ya activo) -- no hay un estado 'pending' que
// aprobar directamente (ver Task 1).
export async function inviteMember(clubId: string, userId: string): Promise<void> {
  const { supabase, userId: actorId } = await requireUser();

  const { data: existing } = await supabase
    .from("club_members")
    .select("status")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabase
    .from("club_members")
    .insert({ club_id: clubId, user_id: userId, status: "invited" });
  if (error) throw error;

  try {
    await notify(supabase, {
      userId,
      actorId,
      type: "club_invite",
      targetType: "club",
      targetId: clubId,
    });
  } catch (notifyError) {
    console.error("inviteMember notify failed", notifyError);
  }
}

export async function acceptInvite(clubId: string): Promise<void> {
  const { supabase, userId } = await requireUser();

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("owner_id")
    .eq("id", clubId)
    .single();
  if (clubError) throw clubError;

  const { error } = await supabase
    .from("club_members")
    .update({ status: "active" })
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .eq("status", "invited");
  if (error) throw error;

  try {
    await notify(supabase, {
      userId: club.owner_id,
      actorId: userId,
      type: "club_invite_accepted",
      targetType: "club",
      targetId: clubId,
    });
  } catch (notifyError) {
    console.error("acceptInvite notify failed", notifyError);
  }
}

export async function declineInvite(clubId: string): Promise<void> {
  const { supabase, userId } = await requireUser();

  const { error } = await supabase
    .from("club_members")
    .delete()
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .eq("status", "invited");
  if (error) throw error;
}

export async function removeMember(clubId: string, userId: string): Promise<void> {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("club_members")
    .delete()
    .eq("club_id", clubId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function setMemberRole(
  clubId: string,
  userId: string,
  role: "member" | "moderator",
): Promise<void> {
  const { supabase } = await requireUser();

  const { error } = await supabase.rpc("set_club_member_role", {
    p_club_id: clubId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
}

export async function transferOwnership(clubId: string, newOwnerId: string): Promise<void> {
  const { supabase } = await requireUser();

  const { error } = await supabase.rpc("transfer_club_ownership", {
    p_club_id: clubId,
    p_new_owner_id: newOwnerId,
  });
  if (error) throw error;
}
```

- [ ] **Step 6: Add the `club.*` notification copy to `messages/es.json`**

In `messages/es.json`, find the `notifications` namespace and add two keys alongside the existing ones (after `reviewCommented`):

```json
    "clubInvite": "{name} te invitó a un club",
    "clubInviteAccepted": "{name} aceptó tu invitación al club",
```

- [ ] **Step 7: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/lib/clubs/membership.ts src/lib/social/notifications.ts src/lib/social/notification-types.ts src/components/social/notification-bell.tsx
```

Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/clubs/membership.ts src/lib/social/notifications.ts src/lib/social/notification-types.ts messages/es.json
git commit -m "feat: add club membership/role domain functions and notification wiring"
```

---

### Task 5: Shared square-image upload helper + `ClubCoverUpload`

**Files:**
- Create: `src/lib/image/to-square-webp.ts`
- Modify: `src/components/avatar-upload.tsx`
- Create: `src/components/clubs/club-cover-upload.tsx`

**Interfaces:**
- Produces: `toSquareWebp(file: File, maxDimension: number): Promise<Blob>`, `<ClubCoverUpload onUploaded={(url: string) => void} initialUrl={string | null} />`. Consumed by Task 6 (`club-form.tsx`).

- [ ] **Step 1: Extract `toSquareWebp` to `src/lib/image/to-square-webp.ts`**

```ts
// Redimensiona y recorta (cuadrado central) a maxDimension y devuelve un Blob
// webp — extraído de avatar-upload.tsx para reutilizar en club-cover-upload.tsx
// sin duplicar la lógica de canvas.
export async function toSquareWebp(file: File, maxDimension: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = maxDimension;
  canvas.height = maxDimension;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, maxDimension, maxDimension);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/webp",
      0.85
    );
  });
}
```

- [ ] **Step 2: Update `avatar-upload.tsx` to use the shared helper**

Find:

```ts
const MAX_DIMENSION = 512;

// Redimensiona y recorta (cuadrado central) a MAX_DIMENSION y devuelve un
// Blob webp — mantiene el avatar pequeño y uniforme sin subir el original.
async function toSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = MAX_DIMENSION;
  canvas.height = MAX_DIMENSION;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, MAX_DIMENSION, MAX_DIMENSION);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/webp",
      0.85
    );
  });
}
```

Replace with:

```ts
import { toSquareWebp } from "@/lib/image/to-square-webp";

const MAX_DIMENSION = 512;
```

Find the call site:

```ts
      const webp = await toSquareWebp(file);
```

Replace with:

```ts
      const webp = await toSquareWebp(file, MAX_DIMENSION);
```

(Move the new `import` to the top of the file alongside the other imports, not inline where shown above — Next.js/TypeScript requires imports at module scope.)

- [ ] **Step 3: Write `src/components/clubs/club-cover-upload.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { toSquareWebp } from "@/lib/image/to-square-webp";

const MAX_DIMENSION = 512;

// Portada de club (EPIC-05 Bloque E): reutiliza el bucket "avatars" y sus
// políticas existentes (own-folder-only), NO un bucket/prefijo nuevo -- la
// política exige que el primer segmento de la ruta sea auth.uid(), así que
// el path es {userId}/club-cover-{timestamp}.webp, no clubs/{clubId}/...
// (que además no resolvería el problema de subir portada antes de que el
// club exista, en el formulario de creación).
export function ClubCoverUpload({
  userId,
  initialUrl,
  onUploaded,
}: {
  userId: string;
  initialUrl: string | null;
  onUploaded: (url: string) => void;
}) {
  const t = useTranslations("club");
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(false);
    try {
      const webp = await toSquareWebp(file, MAX_DIMENSION);
      const supabase = createClient();
      const path = `${userId}/club-cover-${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, webp, { upsert: true, contentType: "image/webp" });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
      setPreview(publicUrl);
      onUploaded(publicUrl);
    } catch {
      setError(true);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{t("cover")}</span>
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-surface-muted">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- preview local/remota antes de persistir
            <img src={preview} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-60"
        >
          {uploading ? t("coverUploading") : t("coverChoose")}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      {error && <p className="text-xs text-status-dropped">{t("coverError")}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/lib/image/to-square-webp.ts src/components/avatar-upload.tsx src/components/clubs/club-cover-upload.tsx
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/image/to-square-webp.ts src/components/avatar-upload.tsx src/components/clubs/club-cover-upload.tsx
git commit -m "refactor: extract toSquareWebp, add ClubCoverUpload"
```

---

### Task 6: `ClubForm` — create/edit form

**Files:**
- Create: `src/components/clubs/club-form.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `createClub`, `updateClub`, `type Club` from `src/lib/clubs/clubs.ts` (Task 3); `ClubCoverUpload` from `src/components/clubs/club-cover-upload.tsx` (Task 5).
- Produces: `<ClubForm userId={string} mode="create" onCreated={(club: Club) => void} />` / `<ClubForm userId={string} mode="edit" club={Club} onUpdated={() => void} />`. Consumed by Task 7 (`/clubes` page) and Task 8 (`/club/[slug]` edit toggle).

- [ ] **Step 1: Write `src/components/clubs/club-form.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createClub, updateClub, type Club } from "@/lib/clubs/clubs";
import { ClubCoverUpload } from "./club-cover-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

type Props =
  | { userId: string; mode: "create"; onCreated: (club: Club) => void; onCancel: () => void }
  | { userId: string; mode: "edit"; club: Club; onUpdated: () => void; onCancel: () => void };

// Formulario de crear/editar club (EPIC-05 Bloque E) -- mismo patrón
// expandir-en-línea que EditProfileForm, no una ruta dedicada. El slug solo
// se pide (y es editable en el input) en modo "create": es fijo tras crear
// (ver design spec), así que "edit" no lo muestra.
export function ClubForm(props: Props) {
  const t = useTranslations("club");
  const isEdit = props.mode === "edit";
  const [name, setName] = useState(isEdit ? props.club.name : "");
  const [slug, setSlug] = useState(isEdit ? props.club.slug : "");
  const [description, setDescription] = useState(
    isEdit ? (props.club.description ?? "") : "",
  );
  const [visibility, setVisibility] = useState<"public" | "private">(
    isEdit ? props.club.visibility : "public",
  );
  const [coverUrl, setCoverUrl] = useState<string | null>(
    isEdit ? props.club.coverUrl : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        if (props.mode === "create") {
          const club = await createClub({
            name,
            slug,
            description,
            visibility,
            coverUrl: coverUrl ?? undefined,
          });
          props.onCreated(club);
        } else {
          await updateClub(props.club.id, { name, description, visibility, coverUrl: coverUrl ?? undefined });
          props.onUpdated();
        }
      } catch {
        setError(t("formError"));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
      <Field label={t("name")} htmlFor="club-form-name">
        <Input id="club-form-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      {!isEdit && (
        <Field label={t("slug")} htmlFor="club-form-slug">
          <Input
            id="club-form-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            required
          />
        </Field>
      )}
      <Field label={t("description")} htmlFor="club-form-description">
        <textarea
          id="club-form-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </Field>
      <ClubCoverUpload userId={props.userId} initialUrl={coverUrl} onUploaded={setCoverUrl} />
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={visibility === "private"}
          onChange={(e) => setVisibility(e.target.checked ? "private" : "public")}
        />
        {t("visibilityPrivate")}
      </label>

      {error && <p className="text-xs text-status-dropped">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? t("formSubmitting") : isEdit ? t("formSaveEdit") : t("formSaveCreate")}
        </Button>
        <Button type="button" variant="ghost" onClick={props.onCancel}>
          {t("formCancel")}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Add the `club.*` i18n namespace to `messages/es.json`**

Place it near `feed`/`social`/`notifications` for discoverability:

```json
  "club": {
    "navLabel": "Clubes",
    "myClubs": "Mis clubes",
    "discover": "Descubrir",
    "searchPlaceholder": "Buscar clubes...",
    "create": "Crear club",
    "name": "Nombre",
    "slug": "URL (fija, no editable después)",
    "description": "Descripción",
    "cover": "Portada",
    "coverChoose": "Elegir imagen",
    "coverUploading": "Subiendo...",
    "coverError": "No se pudo subir la portada.",
    "visibilityPrivate": "Club privado (solo se entra por invitación)",
    "formSubmitting": "Guardando...",
    "formSaveCreate": "Crear",
    "formSaveEdit": "Guardar cambios",
    "formCancel": "Cancelar",
    "formError": "Algo falló. Inténtalo de nuevo.",
    "editToggle": "Editar",
    "empty": "Todavía no tienes clubes.",
    "emptyDiscover": "No se encontraron clubes.",
    "members": "miembros",
    "join": "Unirse",
    "leave": "Salir",
    "acceptInvite": "Aceptar invitación",
    "declineInvite": "Rechazar",
    "manageMembers": "Gestionar miembros",
    "invite": "Invitar",
    "invitePlaceholder": "Buscar usuario a invitar...",
    "promote": "Ascender a moderador",
    "demote": "Bajar a miembro",
    "remove": "Expulsar",
    "transferOwnership": "Transferir propiedad",
    "roleOwner": "Owner",
    "roleModerator": "Moderador",
    "roleMember": "Miembro",
    "leaveOwnerError": "Transfiere la propiedad antes de salir del club."
  },
```

- [ ] **Step 3: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/clubs/club-form.tsx
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubs/club-form.tsx messages/es.json
git commit -m "feat: add ClubForm (create/edit)"
```

---

### Task 7: `/clubes` page — mis clubes, descubrir, crear

**Files:**
- Create: `src/components/clubs/club-card.tsx`
- Create: `src/app/clubes/page.tsx`
- Modify: `src/components/header.tsx`
- Modify: `src/components/mobile-nav.tsx`

**Interfaces:**
- Consumes: `listMyClubs`, `discoverPublicClubs`, `type Club`, `type ClubMembershipStatus` from `src/lib/clubs/clubs.ts` (Task 3); `joinClub` from `src/lib/clubs/membership.ts` (Task 4); `ClubForm` from `src/components/clubs/club-form.tsx` (Task 6).
- Produces: `<ClubCard club={Club & { viewerStatus: ClubMembershipStatus }} />`.

- [ ] **Step 1: Write `src/components/clubs/club-card.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { Club, ClubMembershipStatus } from "@/lib/clubs/clubs";
import { joinClub } from "@/lib/clubs/membership";
import { Button } from "@/components/ui/button";

// discoverPublicClubs solo devuelve clubes visibility='public' (filtrado en
// la query), así que viewerStatus aquí solo es realmente "none" o "active"
// -- un club privado nunca aparece en esta lista (unirse a uno es solo por
// invitación, ver Task 1/4), así que no hace falta un botón de "solicitar".
export function ClubCard({ club }: { club: Club & { viewerStatus: ClubMembershipStatus } }) {
  const t = useTranslations("club");
  const [status, setStatus] = useState(club.viewerStatus);
  const [isPending, startTransition] = useTransition();

  function handleJoin() {
    startTransition(async () => {
      await joinClub(club.id);
      setStatus("active");
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
      <Link href={`/club/${club.slug}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{club.name}</span>
        {club.description && (
          <span className="truncate text-xs text-muted-foreground">{club.description}</span>
        )}
      </Link>
      {status === "none" && (
        <Button type="button" variant="secondary" disabled={isPending} onClick={handleJoin}>
          {t("join")}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/app/clubes/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { listMyClubs, discoverPublicClubs, type Club, type ClubMembershipStatus } from "@/lib/clubs/clubs";
import { ClubCard } from "@/components/clubs/club-card";
import { ClubForm } from "@/components/clubs/club-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ClubesPage() {
  const t = useTranslations("club");
  const [userId, setUserId] = useState<string | null>(null);
  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [discovered, setDiscovered] = useState<(Club & { viewerStatus: ClubMembershipStatus })[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    listMyClubs().then(setMyClubs);
    discoverPublicClubs().then(setDiscovered);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      discoverPublicClubs(query || undefined).then(setDiscovered);
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  if (!userId) return null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("navLabel")}</h1>
        <Button type="button" onClick={() => setCreating((v) => !v)}>
          {t("create")}
        </Button>
      </div>

      {creating && (
        <ClubForm
          userId={userId}
          mode="create"
          onCreated={(club) => {
            setMyClubs((prev) => [club, ...prev]);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("myClubs")}</h2>
        {myClubs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {myClubs.map((club) => (
              <ClubCard key={club.id} club={{ ...club, viewerStatus: "active" }} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("discover")}</h2>
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
        />
        {discovered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyDiscover")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {discovered.map((club) => (
              <ClubCard key={club.id} club={club} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Add the header nav link**

In `src/components/header.tsx`, find (the block right after `/usuarios`, per the current file):

```tsx
            <Link
              href="/usuarios"
              className="inline-flex shrink-0 items-center gap-2 hover:text-foreground"
            >
              <UsersIcon className="h-4 w-4" />
              {t("users.navLabel")}
            </Link>
            {isAdmin && (
```

Replace with:

```tsx
            <Link
              href="/usuarios"
              className="inline-flex shrink-0 items-center gap-2 hover:text-foreground"
            >
              <UsersIcon className="h-4 w-4" />
              {t("users.navLabel")}
            </Link>
            <Link href="/clubes" className="shrink-0 hover:text-foreground">
              {t("club.navLabel")}
            </Link>
            {isAdmin && (
```

(Text-only, no icon, matching the same precedent the removed `/cuenta` link used to follow — `icons.tsx` has an in-progress redesign, don't add a new icon.)

- [ ] **Step 4: Add the mobile drawer nav link**

In `src/components/mobile-nav.tsx`, find:

```tsx
            <Link href="/usuarios" onClick={close} className={linkClassName}>
              <UsersIcon className="h-4 w-4" />
              {t("users.navLabel")}
            </Link>
            {isAdmin && (
```

Replace with:

```tsx
            <Link href="/usuarios" onClick={close} className={linkClassName}>
              <UsersIcon className="h-4 w-4" />
              {t("users.navLabel")}
            </Link>
            <Link href="/clubes" onClick={close} className={linkClassName}>
              {t("club.navLabel")}
            </Link>
            {isAdmin && (
```

- [ ] **Step 5: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/clubs/club-card.tsx "src/app/clubes/page.tsx" src/components/header.tsx src/components/mobile-nav.tsx
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/club-card.tsx "src/app/clubes/page.tsx" src/components/header.tsx src/components/mobile-nav.tsx
git commit -m "feat: add /clubes page (mis clubes, descubrir, crear)"
```

---

### Task 8: `/club/[slug]` page — cabecera, acción según estado, edición

**Files:**
- Create: `src/components/clubs/club-header.tsx`
- Create: `src/app/club/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getClub` from `src/lib/clubs/clubs.ts` (Task 3); `joinClub`, `leaveClub`, `acceptInvite`, `declineInvite` from `src/lib/clubs/membership.ts` (Task 4); `ClubForm` from `src/components/clubs/club-form.tsx` (Task 6).
- Produces: `<ClubHeader club={Awaited<ReturnType<typeof getClub>>} userId={string} />`. Consumed by Task 9 (adds the manage-members section to the same page).

- [ ] **Step 1: Write `src/components/clubs/club-header.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { getClub } from "@/lib/clubs/clubs";
import { joinClub, leaveClub, acceptInvite, declineInvite } from "@/lib/clubs/membership";
import { ClubForm } from "./club-form";
import { Button } from "@/components/ui/button";

type ClubDetail = NonNullable<Awaited<ReturnType<typeof getClub>>>;

export function ClubHeader({ club, userId }: { club: ClubDetail; userId: string }) {
  const t = useTranslations("club");
  const [status, setStatus] = useState(club.viewerStatus);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleJoin() {
    startTransition(async () => {
      await joinClub(club.id);
      setStatus("active");
    });
  }

  function handleLeave() {
    startTransition(async () => {
      try {
        await leaveClub(club.id);
        setStatus("none");
      } catch {
        setError(t("leaveOwnerError"));
      }
    });
  }

  function handleAccept() {
    startTransition(async () => {
      await acceptInvite(club.id);
      setStatus("active");
    });
  }

  function handleDecline() {
    startTransition(async () => {
      await declineInvite(club.id);
      setStatus("none");
    });
  }

  const canEdit = club.viewerRole === "moderator" || club.viewerRole === "owner";

  // status === "none" solo puede ocurrir aquí para un club PÚBLICO: getClub()
  // devuelve null (404, ver page.tsx) para un club privado visto por un
  // no-miembro, así que ClubHeader nunca llega a renderizar en ese caso -- no
  // hace falta distinguir público/privado en el botón de unirse.
  return (
    <div className="flex flex-col gap-4">
      {club.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage, mismo criterio que profile-header
        <img src={club.coverUrl} alt="" className="h-40 w-full rounded-lg object-cover" />
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{club.name}</h1>
          {club.description && (
            <p className="max-w-prose text-sm text-muted-foreground">{club.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status === "none" && (
            <Button type="button" disabled={isPending} onClick={handleJoin}>
              {t("join")}
            </Button>
          )}
          {status === "invited" && (
            <>
              <Button type="button" disabled={isPending} onClick={handleAccept}>
                {t("acceptInvite")}
              </Button>
              <Button type="button" variant="ghost" disabled={isPending} onClick={handleDecline}>
                {t("declineInvite")}
              </Button>
            </>
          )}
          {status === "active" && club.viewerRole !== "owner" && (
            <Button type="button" variant="secondary" disabled={isPending} onClick={handleLeave}>
              {t("leave")}
            </Button>
          )}
          {canEdit && (
            <Button type="button" variant="ghost" onClick={() => setEditing((v) => !v)}>
              {t("editToggle")}
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-status-dropped">{error}</p>}

      {editing && (
        <ClubForm
          userId={userId}
          mode="edit"
          club={club}
          onUpdated={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/app/club/[slug]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getClub } from "@/lib/clubs/clubs";
import { ClubHeader } from "@/components/clubs/club-header";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClub(slug);
  return { title: club ? `${club.name} — Biblioshare` : "Club — Biblioshare" };
}

export default async function ClubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const club = await getClub(slug);
  if (!club) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <ClubHeader club={club} userId={user.id} />
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/clubs/club-header.tsx "src/app/club/[slug]/page.tsx"
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubs/club-header.tsx "src/app/club/[slug]/page.tsx"
git commit -m "feat: add /club/[slug] page with join/leave/invite actions"
```

---

### Task 9: `ManageMembers` — moderator+ roster and invites

**Files:**
- Create: `src/components/clubs/manage-members.tsx`
- Modify: `src/app/club/[slug]/page.tsx`

**Interfaces:**
- Consumes: `removeMember`, `inviteMember`, `setMemberRole`, `transferOwnership` from `src/lib/clubs/membership.ts` (Task 4).
- Produces: `listMembers(clubId: string): Promise<ClubMember[]>`, `resolveUsername(username: string): Promise<string | null>` (both added to `src/lib/clubs/clubs.ts`), `<ManageMembers clubId={string} viewerRole={"moderator"|"owner"} viewerId={string} />`. Consumed by `src/app/club/[slug]/page.tsx`.

- [ ] **Step 1: Add a `listMembers` function to `src/lib/clubs/clubs.ts`**

Find the end of `discoverPublicClubs` (the last function in the file) and add after it:

```ts

export type ClubMember = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "member" | "moderator" | "owner";
  status: "invited" | "active";
  joinedAt: string;
};

// Solo miembros ven el roster (RLS: club_members select gateado por
// is_club_member). Incluye 'invited' para que la sección de gestión pueda
// mostrar quién tiene una invitación pendiente de aceptar.
export async function listMembers(clubId: string): Promise<ClubMember[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("club_members")
    .select("user_id, role, status, joined_at")
    .eq("club_id", clubId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const { data: identities, error: identitiesError } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", data.map((m) => m.user_id));
  if (identitiesError) throw identitiesError;

  const byId = new Map(
    (identities ?? [])
      .filter((i): i is typeof i & { user_id: string; username: string } => i.user_id != null && i.username != null)
      .map((i) => [i.user_id, i]),
  );

  return data
    .map((m): ClubMember | null => {
      const identity = byId.get(m.user_id);
      if (!identity) return null;
      return {
        userId: m.user_id,
        username: identity.username,
        displayName: identity.display_name,
        avatarUrl: identity.avatar_url,
        role: m.role,
        status: m.status,
        joinedAt: m.joined_at,
      };
    })
    .filter((m): m is ClubMember => m !== null);
}

// Resuelve un username a user_id para el formulario de invitar (manage-members.tsx) --
// server-side, en vez de una query de cliente ad-hoc, para mantener el mismo
// patrón de dominio del resto del fichero.
export async function resolveUsername(username: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", username)
    .maybeSingle();
  return data?.user_id ?? null;
}
```

- [ ] **Step 2: Write `src/components/clubs/manage-members.tsx`**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { listMembers, resolveUsername, type ClubMember } from "@/lib/clubs/clubs";
import {
  removeMember,
  inviteMember,
  setMemberRole,
  transferOwnership,
} from "@/lib/clubs/membership";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Sección de gestión (EPIC-05 Bloque E), moderator+ únicamente -- ver
// club-header.tsx/[slug]/page.tsx para el gateo de quién la ve. La invitación
// se hace por user_id: este componente no incluye un buscador de usuarios
// propio, reutiliza el mismo input libre que search-profiles.ts ya resuelve
// en /usuarios (fuera de alcance de este task añadir un autocomplete nuevo;
// se pega un user_id o username exacto y se resuelve server-side).
export function ManageMembers({
  clubId,
  viewerRole,
  viewerId,
}: {
  clubId: string;
  viewerRole: "moderator" | "owner";
  viewerId: string;
}) {
  const t = useTranslations("club");
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [inviteUsername, setInviteUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    listMembers(clubId).then(setMembers);
  }

  useEffect(refresh, [clubId]);

  const active = members.filter((m) => m.status === "active");

  function handleRemove(userId: string) {
    startTransition(async () => {
      await removeMember(clubId, userId);
      refresh();
    });
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const userId = await resolveUsername(inviteUsername);
        if (!userId) {
          setError(t("formError"));
          return;
        }
        await inviteMember(clubId, userId);
        setInviteUsername("");
        refresh();
      } catch {
        setError(t("formError"));
      }
    });
  }

  function handlePromote(userId: string, role: "member" | "moderator") {
    startTransition(async () => {
      await setMemberRole(clubId, userId, role);
      refresh();
    });
  }

  function handleTransfer(userId: string) {
    startTransition(async () => {
      await transferOwnership(clubId, userId);
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("manageMembers")}</h2>

      <form onSubmit={handleInvite} className="flex items-center gap-2">
        <Input
          value={inviteUsername}
          onChange={(e) => setInviteUsername(e.target.value)}
          placeholder={t("invitePlaceholder")}
        />
        <Button type="submit" disabled={isPending || !inviteUsername}>
          {t("invite")}
        </Button>
      </form>
      {error && <p className="text-xs text-status-dropped">{error}</p>}

      <div className="flex flex-col gap-2">
        {active.map((m) => (
          <div key={m.userId} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              {m.displayName || m.username}
              <span className="text-xs text-muted-foreground">
                {m.role === "owner" ? t("roleOwner") : m.role === "moderator" ? t("roleModerator") : t("roleMember")}
              </span>
            </span>
            {m.userId !== viewerId && (
              <div className="flex items-center gap-1">
                {viewerRole === "owner" && m.role === "member" && (
                  <Button type="button" variant="ghost" disabled={isPending} onClick={() => handlePromote(m.userId, "moderator")}>
                    {t("promote")}
                  </Button>
                )}
                {viewerRole === "owner" && m.role === "moderator" && (
                  <Button type="button" variant="ghost" disabled={isPending} onClick={() => handlePromote(m.userId, "member")}>
                    {t("demote")}
                  </Button>
                )}
                {viewerRole === "owner" && m.role !== "owner" && (
                  <Button type="button" variant="ghost" disabled={isPending} onClick={() => handleTransfer(m.userId)}>
                    {t("transferOwnership")}
                  </Button>
                )}
                {m.role !== "owner" && (viewerRole === "owner" || m.role === "member") && (
                  <Button type="button" variant="ghost" disabled={isPending} onClick={() => handleRemove(m.userId)}>
                    {t("remove")}
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire `ManageMembers` into `src/app/club/[slug]/page.tsx`**

Find:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getClub } from "@/lib/clubs/clubs";
import { ClubHeader } from "@/components/clubs/club-header";
```

Replace with:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getClub } from "@/lib/clubs/clubs";
import { ClubHeader } from "@/components/clubs/club-header";
import { ManageMembers } from "@/components/clubs/manage-members";
```

Find:

```tsx
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <ClubHeader club={club} userId={user.id} />
    </div>
  );
```

Replace with:

```tsx
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <ClubHeader club={club} userId={user.id} />
      {(club.viewerRole === "moderator" || club.viewerRole === "owner") && (
        <ManageMembers clubId={club.id} viewerRole={club.viewerRole} viewerId={user.id} />
      )}
    </div>
  );
```

- [ ] **Step 4: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/lib/clubs/clubs.ts src/components/clubs/manage-members.tsx "src/app/club/[slug]/page.tsx"
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clubs/clubs.ts src/components/clubs/manage-members.tsx "src/app/club/[slug]/page.tsx"
git commit -m "feat: add ManageMembers section (invite, roles, transfer)"
```

---

### Task 10: Manual test checklist

**Files:**
- Create: `docs/superpowers/plans/2026-07-12-epic05-bloque-e-clubs-manual-test.md`

- [ ] **Step 1: Write the checklist document**

Per `docs/TESTING.md`, this replaces automated browser verification. Write a markdown checklist covering, with two test accounts (A = will become owner, B = second account):

1. **Setup**: `npm run dev`, log in as A.
2. **Create (public)**: `/clubes` → "Crear club", fill name/slug/description, leave visibility public, upload a cover, submit. Confirm redirect/list shows the new club, `/club/[slug]` renders with the cover, no "Unirse" button for A (already owner), "Editar" visible.
3. **Create (private)**: repeat as a private club (checkbox checked). Confirm `/clubes` → "Descubrir" does NOT list it for account B (private clubs never appear in discovery), and B visiting `/club/[private-slug]` directly (paste the URL) gets a 404 — a private club's row is entirely invisible to non-members (SD-4), so there is no join-request stub of any kind. Joining a private club is invite-only; there is no self-service request flow.
4. **Join public club (B)**: as B, `/clubes` → "Descubrir", find A's public club, click "Unirse". Confirm B is immediately active (no approval step), club appears in B's "Mis clubes".
5. **Invite to private club (B)**: as A (owner of the private club), open /club/[private-slug] -> "Gestionar miembros", type B's username into the invite field, submit. As B, confirm a "te invito a un club" notification arrives, and that B can now reach /club/[private-slug] directly (previously 404) showing "Aceptar invitacion"/"Rechazar" instead of nothing. Click "Aceptar". Confirm A gets a "acepto tu invitacion" notification, and B now appears as an active member in "Gestionar miembros".
6. **Decline an invite**: repeat step 5 with a fresh invite (remove B first if still a member), but click "Rechazar" instead. Confirm B no longer has access to /club/[private-slug] (back to 404) and does not appear in the member list.
7. **Roles**: re-invite B and accept again, then as A (owner), in "Gestionar miembros" promote B to moderator ("Ascender a moderador"). Confirm B's role label updates to "Moderador". As B, confirm B can now see "Gestionar miembros" too (moderator+) but does NOT see "Ascender/Bajar/Transferir propiedad" options for A (owner-only actions, B is only moderator).
8. **Leave-blocked-as-owner**: as A (owner) on a club where B is also an active member, try clicking a way to leave (there shouldn't be a visible "Salir" button for the owner in `club-header.tsx` per the plan — confirm that's the case; the block is enforced by hiding the button, not just server-side).
9. **Transfer ownership**: as A, "Transferir propiedad" on B. Confirm A's role becomes "Moderador" and B's becomes "Owner" (check both accounts' views). Confirm A can now see a "Salir" button (no longer owner) and B cannot (now owner).
10. **Remove member**: as B (now owner), expel A from the club via "Expulsar". Confirm A no longer sees the club in "Mis clubes" and can't access `/club/[slug]` content restricted to members (for a private club) or sees the join button again (for a public club).
11. **No console errors** throughout.
12. **Cleanup**: this plan doesn't add a `deleteClub` UI action (not in the E5.E1–E4 scope) — remove both test clubs directly via SQL against dev, scoped to the two test slugs: `delete from public.club_members where club_id in (select id from public.clubs where slug in ('<public-slug>', '<private-slug>')); delete from public.clubs where slug in ('<public-slug>', '<private-slug>');`. Alternatively, leaving as the sole remaining member on each (remove every other member first) triggers the ownership trigger's auto-delete path, which also exercises that code path as a side effect of cleanup.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-12-epic05-bloque-e-clubs-manual-test.md
git commit -m "docs: add manual test checklist for EPIC-05 Bloque E clubs"
```

---

### Task 11: Apply to prod, update docs

**Files:**
- Modify: `docs/requirements/social-epic.md`
- Modify: `docs/REQUIREMENTS.md`

- [ ] **Step 1: Apply the migration to prod**

Use `mcp__supabase__apply_migration` with `name: "clubs"` and the exact SQL from Task 1, Step 1 (pinned to the prod project ref).

- [ ] **Step 2: Verify prod**

Run `mcp__supabase__get_advisors` with `type: "security"` and confirm no genuinely new findings beyond the project's already-accepted pre-existing patterns.

- [ ] **Step 3: Update `docs/requirements/social-epic.md`**

Mark `E5.E1`–`E5.E4` as done (`- [x]`) and add a status note matching the style of the other closed EPIC-05 blocks — built + verified in dev (manual checklist), migration applied to prod, feed (Bloque F) explicitly still deferred.

- [ ] **Step 4: Update `docs/REQUIREMENTS.md`**

Add a dated row to the §9 decision table documenting: the `SECURITY DEFINER` RPC pattern for role-changing operations (`create_club`/`set_club_member_role`/`transfer_club_ownership`) instead of raw client updates, the ownership-reassignment trigger as a database-level safety net independent of any future account-deletion feature, the enum-declaration-order gotcha (ascending authority order required for `>=` comparisons to work, same pattern as `user_role`), and the mid-implementation correction to invite-only private-club joining (no self-service "solicitar unirse" — a private club's row is genuinely invisible to non-members per SD-4, which makes a self-request flow impossible to implement consistently; discovered when Task 1's original RLS battery hit a real circular-visibility bug).

- [ ] **Step 5: Commit**

```bash
git add docs/requirements/social-epic.md docs/REQUIREMENTS.md
git commit -m "docs: mark EPIC-05 Bloque E done (clubs)"
```
