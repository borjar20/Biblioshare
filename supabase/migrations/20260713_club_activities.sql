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
