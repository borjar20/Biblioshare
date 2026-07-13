-- Solicitudes de entrada a clubes privados + novedades por club (Paper p3).
--
-- ═════════════════════════════════════════════════════════════════════════════
-- 1 · IDENTIDAD DE CLUB: visible pero no legible
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Hoy `clubs select public or member` niega la fila entera de un club privado a
-- quien no es miembro. Consecuencia: alguien con el enlace de un club privado
-- recibe un 404 — no puede ni comprobar que existe, y mucho menos pedir entrar.
--
-- Se resuelve como ya se resolvió para los perfiles privados: una vista de
-- IDENTIDAD. El club privado pasa a ser visible (nombre, descripción, portada)
-- pero su contenido — posts, actividades, miembros — sigue siendo de sus
-- miembros. Mismo modelo mental que Instagram, y el mismo que ya usa la app.
--
-- Ojo con los grants: los default privileges del esquema public conceden ALL
-- sobre cualquier relación nueva, y `grant select` NO resta. Sin el `revoke`
-- previo, esta vista quedaría escribible por anon — es exactamente el agujero
-- que tuvimos con profile_identities y club_stats. Revoke ANTES del grant.
create view public.club_identities as
  select
    c.id,
    c.slug,
    c.name,
    c.description,
    c.cover_url,
    c.visibility
  from public.clubs c;

comment on view public.club_identities is
  'Identidad pública de CUALQUIER club, incluidos los privados, para la pantalla de "solicitar entrada". Bypassa la RLS de clubs al no ser security_invoker; por eso SOLO contiene columnas de identidad — nunca owner_id ni nada que revele el interior del club. El contenido (posts, actividades, miembros) sigue gateado por is_club_member().';

revoke all on public.club_identities from anon, authenticated;
grant select on public.club_identities to anon, authenticated;
alter view public.club_identities set (security_barrier = true);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2 · SOLICITAR ENTRADA
-- ═════════════════════════════════════════════════════════════════════════════
--
-- La política INSERT actual tiene dos ramas: auto-alta en club PÚBLICO
-- (status='active'), o invitación de un moderator+ (status='invited'). Se añade
-- una tercera: auto-solicitud en club PRIVADO (status='requested').
--
-- 'requested' NO es membresía: is_club_member() solo cuenta 'active', así que
-- una solicitud pendiente no da acceso a nada. Es una fila en la sala de espera.
drop policy "club_members insert self or invite" on public.club_members;

create policy "club_members insert self, request or invite" on public.club_members
  for insert to authenticated
  with check (
    role = 'member'
    and (
      -- Auto-alta en club público: inmediata.
      (
        user_id = (select auth.uid())
        and status = 'active'
        and exists (
          select 1 from public.clubs c
          where c.id = club_id and c.visibility = 'public'
        )
      )
      -- NUEVO. Auto-solicitud en club privado: queda pendiente de moderación.
      -- La condición de visibility='private' es deliberada: en un club público
      -- no hay nada que solicitar, te unes y ya.
      or (
        user_id = (select auth.uid())
        and status = 'requested'
        and exists (
          select 1 from public.clubs c
          where c.id = club_id and c.visibility = 'private'
        )
      )
      -- Invitación de un moderator+.
      or (
        user_id <> (select auth.uid())
        and status = 'invited'
        and public.has_min_club_role(club_id, 'moderator')
      )
    )
  );

-- La política UPDATE de auto-servicio sigue exigiendo status='invited' en su
-- USING, así que quien tiene una solicitud pendiente NO puede auto-aprobarse.
-- No hace falta tocarla — pero conviene dejarlo dicho, porque es la garantía.

-- Aprobar es un cambio de estado que hace OTRA persona sobre TU fila, y no hay
-- (ni queremos) una política UPDATE para moderadores sobre club_members: abriría
-- la puerta a que un moderator+ reescribiera roles a mano. Va por RPC.
create or replace function public.approve_club_join_request(
  p_club_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_min_club_role(p_club_id, 'moderator') then
    raise exception 'not_authorized';
  end if;

  -- Solo promueve filas que estén REALMENTE esperando. Sin este filtro, un
  -- moderador podría "aprobar" a un invitado que aún no aceptó, saltándose su
  -- consentimiento, o reactivar a alguien a quien se expulsó.
  update public.club_members
     set status = 'active'
   where club_id = p_club_id
     and user_id = p_user_id
     and status = 'requested'
     and role = 'member';

  if not found then
    raise exception 'no_pending_request';
  end if;
end;
$$;

revoke all on function public.approve_club_join_request(uuid, uuid) from public, anon;
grant execute on function public.approve_club_join_request(uuid, uuid) to authenticated;

comment on function public.approve_club_join_request is
  'Aprueba una solicitud de entrada: requested -> active. SECURITY DEFINER porque no existe política UPDATE de moderador sobre club_members (a propósito: permitiría reescribir roles). Solo promueve filas en estado requested con role=member, así que no puede usarse para saltarse el consentimiento de un invitado ni para readmitir a un expulsado.';

-- Rechazar una solicitud = borrar la fila. Ya lo cubre la política existente
-- "club_members delete self or moderate": un moderator+ puede borrar filas de
-- rol estrictamente inferior, y una solicitud siempre tiene role='member'.
-- Y quien solicitó puede retirar su propia solicitud (rama user_id = auth.uid()).

-- ═════════════════════════════════════════════════════════════════════════════
-- 3 · NOVEDADES POR CLUB
-- ═════════════════════════════════════════════════════════════════════════════
--
-- "3 novedades" en la tarjeta del club. Hace falta saber hasta dónde has leído.
create table public.club_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, club_id)
);

comment on table public.club_reads is
  'Hasta cuándo ha leído cada persona cada club. Alimenta el contador de novedades. Sin fila = no lo ha abierto nunca desde que se unió, y se cuenta desde joined_at.';

alter table public.club_reads enable row level security;

-- Es tuya y solo tuya: nadie más necesita saber cuándo abriste un club.
create policy "club_reads select own" on public.club_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "club_reads upsert own" on public.club_reads
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "club_reads update own" on public.club_reads
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Recuento de novedades de TODOS tus clubes de una vez.
--
-- security invoker: corre con TUS permisos, así que la RLS de club_posts y
-- club_activities (ambas gateadas por is_club_member) sigue aplicando. No hace
-- falta bypass: solo cuenta clubes de los que YA eres miembro.
--
-- Novedad = post o actividad creada DESPUÉS de tu última lectura y por OTRA
-- persona. Lo tuyo propio no es novedad para ti.
--
-- Sin fila en club_reads se cuenta desde joined_at, no desde el principio de los
-- tiempos: al entrar en un club de 3 años no quieres ver "412 novedades".
create or replace function public.club_unread_counts()
returns table (club_id uuid, unread integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.club_id,
    (
      (
        select count(*)
        from public.club_posts p
        where p.club_id = m.club_id
          and p.author_id <> (select auth.uid())
          and p.created_at > coalesce(r.last_read_at, m.joined_at)
      )
      +
      (
        select count(*)
        from public.club_activities a
        where a.club_id = m.club_id
          and a.created_by <> (select auth.uid())
          and a.created_at > coalesce(r.last_read_at, m.joined_at)
      )
    )::integer as unread
  from public.club_members m
  left join public.club_reads r
    on r.club_id = m.club_id
   and r.user_id = m.user_id
  where m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

revoke all on function public.club_unread_counts() from public, anon;
grant execute on function public.club_unread_counts() to authenticated;

comment on function public.club_unread_counts is
  'Novedades (posts + actividades ajenas y posteriores a tu última lectura) de cada club del que eres miembro activo. security invoker: la RLS de club_posts/club_activities sigue aplicando. Sin fila en club_reads se cuenta desde joined_at, para que entrar en un club antiguo no muestre cientos de novedades.';
