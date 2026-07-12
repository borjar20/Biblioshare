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
-- que la vuelva a tocar. La otra rama (promocionar al siguiente owner) no
-- se ve afectada por este cambio: nunca toca la fila que se está borrando.
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
create or replace function public.enforce_club_owner_change_authorized()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id then
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

  -- clubs.owner_id se actualiza PRIMERO, mientras el llamante (v_current_owner)
  -- todavía tiene role='owner' en club_members -- el trigger
  -- trg_enforce_club_owner_change vuelve a comprobar has_min_club_role(id,
  -- 'owner') justo en este UPDATE, así que si degradásemos a v_current_owner
  -- ANTES, el propio trigger rechazaría el cambio que su propio dueño
  -- legítimo está autorizando (encontrado por la batería de RLS del
  -- implementador de la Task 1: transfer_club_ownership() fallaba con "Only
  -- the current owner can change club ownership" al intentar transferir,
  -- porque el orden original degradaba el rol en club_members antes de tocar
  -- clubs.owner_id).
  update public.clubs set owner_id = p_new_owner_id where id = p_club_id;
  update public.club_members set role = 'moderator'
    where club_id = p_club_id and user_id = v_current_owner;
  update public.club_members set role = 'owner'
    where club_id = p_club_id and user_id = p_new_owner_id;
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
