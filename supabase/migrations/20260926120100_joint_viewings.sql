-- Visionados conjuntos (#1220), paso 2 de 2: tablas, RLS, funciones y el post
-- `joint`. Requiere 20260926120000 (valores de enum) aplicada ANTES y en otra
-- transacción.
--
-- Qué es: «vi / leí esta obra con estas personas». Cada participante conserva SU
-- pase, con SU nota y SU reseña (el pase es el dueño de rating/review, invariante
-- de data-model §3); el visionado conjunto solo ENLAZA los pases. No es un
-- buddy_read de club: no hay club, ni hitos, ni calendario.
--
-- Decisiones de producto (issue #1220, 2026-09-26):
--   · Solo se invita a SEGUIDOS MUTUOS, y lo comprueba la base (no el selector).
--   · Vale para todo item_type.
--   · El post `finished` suelto de un miembro se oculta en el feed de inicio
--     cuando quien mira ve el post conjunto (lo hace el feed, no esta migración).
--   · Quien mira y no puede ver a un miembro ve «y N más»: aquí se sirve el
--     RECUENTO (joint_viewing_accepted_counts), nunca la identidad.
--
-- Escritura: SOLO por las funciones de abajo (security definer). Las tablas no
-- tienen grant de insert/update/delete para anon/authenticated.

-- --- Tablas ------------------------------------------------------------------

create table public.joint_viewings (
  id uuid primary key default gen_random_uuid(),
  item_type public.item_type not null,
  item_id uuid not null,
  -- El día del visionado: el finished_on del pase de quien lo crea (puede ser
  -- null, un completado sin fecha es legítimo desde 20260908103210).
  watched_on date,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index joint_viewings_item_idx on public.joint_viewings (item_type, item_id);
create index joint_viewings_created_by_idx on public.joint_viewings (created_by);

create table public.joint_viewing_members (
  viewing_id uuid not null references public.joint_viewings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- invited  → etiquetado, aún no ha contestado.
  -- accepted → confirmó; su pase queda enlazado en pass_id.
  -- declined → «No fui yo». La fila se conserva para que no se le pueda volver
  --            a invitar al MISMO visionado (la pk lo impide).
  status text not null check (status in ('invited', 'accepted', 'declined')),
  -- Borrar el pase saca a su dueño del visionado (cascade): sin pase no hay nota
  -- ni reseña que agrupar. El trigger de reconciliación retira el post conjunto
  -- si quedan menos de dos.
  pass_id uuid references public.passes(id) on delete cascade,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (viewing_id, user_id),
  constraint joint_viewing_members_pass_matches_status
    check ((status = 'accepted') = (pass_id is not null))
);

-- Un pase pertenece a un visionado conjunto como mucho.
create unique index joint_viewing_members_pass_uidx
  on public.joint_viewing_members (pass_id) where pass_id is not null;
create index joint_viewing_members_user_idx on public.joint_viewing_members (user_id, status);

-- --- Helper de pertenencia (rompe la recursión de RLS) -------------------------

-- ¿Quien llama tiene fila (cualquier estado) en este visionado? security definer
-- porque la policy de joint_viewing_members se consulta a sí misma a través de
-- esto y, invoker, recursaría.
create or replace function private.joint_viewing_member_of(p_viewing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.joint_viewing_members m
    where m.viewing_id = p_viewing_id
      and m.user_id = (select auth.uid())
  );
$$;
-- anon también: las policies la evalúan para quien mira sin sesión (feed
-- público), y ahí devuelve false.
revoke execute on function private.joint_viewing_member_of(uuid) from public;
grant execute on function private.joint_viewing_member_of(uuid) to anon, authenticated;

-- --- RLS -----------------------------------------------------------------------

alter table public.joint_viewings enable row level security;
alter table public.joint_viewing_members enable row level security;

-- Un visionado lo ve quien está en él, y cualquiera que pueda ver su post
-- conjunto. La subconsulta a `posts` es INVOKER: pasa por la RLS de posts
-- (can_view_profile del autor + moderación), así que «ver el visionado» y «ver
-- la tarjeta» no pueden divergir.
create policy "joint_viewings select member or post visible"
  on public.joint_viewings for select
  using (
    private.joint_viewing_member_of(id)
    or exists (
      select 1 from public.posts p
      where p.kind = 'joint'
        and p.source_kind = 'joint_viewing'
        and p.source_id = joint_viewings.id
    )
  );

-- Miembros: los tuyos siempre; los de un visionado en el que estás, todos (el
-- invitado ve a quién más han etiquetado); los de un visionado ajeno visible,
-- solo los ACEPTADOS cuyo perfil puedes ver. El resto se cuenta, no se enseña.
create policy "joint_viewing_members select"
  on public.joint_viewing_members for select
  using (
    user_id = (select auth.uid())
    or private.joint_viewing_member_of(viewing_id)
    or (
      status = 'accepted'
      and public.can_view_profile(user_id)
      and exists (select 1 from public.joint_viewings v where v.id = viewing_id)
    )
  );

revoke all on public.joint_viewings from anon, authenticated;
revoke all on public.joint_viewing_members from anon, authenticated;
grant select on public.joint_viewings to anon, authenticated;
grant select on public.joint_viewing_members to anon, authenticated;

-- --- Recuento para «y N más» ---------------------------------------------------

-- Aceptados por visionado, solo de visionados que quien llama puede ver (mismo
-- criterio que la policy: miembro, o puede ver al autor del post conjunto =
-- created_by). Devuelve números, nunca identidades.
create or replace function public.joint_viewing_accepted_counts(p_viewing_ids uuid[])
returns table (viewing_id uuid, accepted_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, count(m.user_id)::integer
  from public.joint_viewings v
  join public.joint_viewing_members m on m.viewing_id = v.id and m.status = 'accepted'
  where v.id = any (p_viewing_ids)
    and (private.joint_viewing_member_of(v.id) or public.can_view_profile(v.created_by))
  group by v.id;
$$;
revoke execute on function public.joint_viewing_accepted_counts(uuid[]) from public;
grant execute on function public.joint_viewing_accepted_counts(uuid[]) to anon, authenticated;

-- --- Reconciliación del post conjunto ------------------------------------------

-- Con menos de dos aceptados no hay «juntos»: el post conjunto se retira (y con
-- él, por los triggers de posts, su interaction_target). Sin ninguna fila de
-- miembro, el visionado entero sobra.
create or replace function private.reconcile_joint_viewing(p_viewing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_accepted integer;
begin
  select count(*) into v_accepted
  from public.joint_viewing_members m
  where m.viewing_id = p_viewing_id and m.status = 'accepted';

  if v_accepted < 2 then
    delete from public.posts p
    where p.kind = 'joint'
      and p.source_kind = 'joint_viewing'
      and p.source_id = p_viewing_id;
  end if;

  if not exists (select 1 from public.joint_viewing_members m where m.viewing_id = p_viewing_id) then
    delete from public.joint_viewings v where v.id = p_viewing_id;
  end if;
end;
$$;
revoke execute on function private.reconcile_joint_viewing(uuid) from public, anon, authenticated;

create or replace function private.joint_viewing_members_reconcile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.reconcile_joint_viewing(old.viewing_id);
  return null;
end;
$$;
revoke execute on function private.joint_viewing_members_reconcile() from public, anon, authenticated;

create trigger joint_viewing_members_reconcile
  after delete or update of status, pass_id on public.joint_viewing_members
  for each row execute function private.joint_viewing_members_reconcile();

-- Borrar el visionado (cascada de auth.users, o la reconciliación) se lleva su
-- post conjunto. Mismo papel que private.cleanup_source_posts para las demás
-- fuentes, sin filtrar por autor: el post conjunto es del visionado.
create or replace function private.cleanup_joint_viewing_posts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.posts p
  where p.kind = 'joint'
    and p.source_kind = 'joint_viewing'
    and p.source_id = old.id;
  return old;
end;
$$;
revoke execute on function private.cleanup_joint_viewing_posts() from public, anon, authenticated;

create trigger joint_viewings_cleanup_posts
  after delete on public.joint_viewings
  for each row execute function private.cleanup_joint_viewing_posts();

-- --- Escritura -----------------------------------------------------------------

-- Crea un visionado conjunto desde un pase COMPLETADO de quien llama e invita a
-- seguidos mutuos. Si el pase ya es de un visionado que creó quien llama, añade
-- los invitados nuevos a ese mismo visionado (idempotente). Devuelve el id y los
-- usuarios invitados POR ESTA llamada (la app les manda el aviso).
create or replace function public.create_joint_viewing(p_pass_id uuid, p_invitee_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pass record;
  v_viewing_id uuid;
  v_invitees uuid[];
  v_invitee uuid;
  v_new uuid[];
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select p.id, p.item_type, p.item_id, p.finished_on, p.status
    into v_pass
  from public.passes p
  where p.id = p_pass_id and p.user_id = v_uid;
  if not found then
    raise exception 'pass_not_found' using errcode = 'P0002';
  end if;
  if v_pass.status <> 'completed' then
    raise exception 'pass_not_completed' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_invitees
  from unnest(coalesce(p_invitee_ids, '{}')) as x
  where x is not null and x <> v_uid;
  if cardinality(v_invitees) = 0 then
    raise exception 'no_invitees' using errcode = '22023';
  end if;
  if cardinality(v_invitees) > 20 then
    raise exception 'too_many_invitees' using errcode = '22023';
  end if;

  -- Seguidos mutuos, y sin bloqueo entre medias. Todo o nada: un id que no
  -- cumple aborta la llamada entera (el selector solo ofrece mutuos, así que
  -- esto solo salta ante un POST manipulado o un follow retirado a destiempo).
  foreach v_invitee in array v_invitees loop
    if public.users_are_blocked(v_invitee)
      or not exists (
        select 1 from public.follows f
        where f.follower_id = v_uid and f.followee_id = v_invitee and f.status = 'accepted'
      )
      or not exists (
        select 1 from public.follows f
        where f.follower_id = v_invitee and f.followee_id = v_uid and f.status = 'accepted'
      )
    then
      raise exception 'not_mutual' using errcode = '42501';
    end if;
  end loop;

  select m.viewing_id into v_viewing_id
  from public.joint_viewing_members m
  where m.pass_id = p_pass_id;

  if v_viewing_id is not null then
    if not exists (
      select 1 from public.joint_viewings v where v.id = v_viewing_id and v.created_by = v_uid
    ) then
      raise exception 'pass_already_joint' using errcode = '23505';
    end if;
  else
    insert into public.joint_viewings (item_type, item_id, watched_on, created_by)
    values (v_pass.item_type, v_pass.item_id, v_pass.finished_on, v_uid)
    returning id into v_viewing_id;

    insert into public.joint_viewing_members (viewing_id, user_id, status, pass_id, responded_at)
    values (v_viewing_id, v_uid, 'accepted', p_pass_id, now());
  end if;

  with inserted as (
    insert into public.joint_viewing_members (viewing_id, user_id, status)
    select v_viewing_id, x, 'invited' from unnest(v_invitees) as x
    on conflict (viewing_id, user_id) do nothing
    returning user_id
  )
  select coalesce(array_agg(user_id), '{}') into v_new from inserted;

  return jsonb_build_object('viewing_id', v_viewing_id, 'invited', to_jsonb(v_new));
end;
$$;
revoke execute on function public.create_joint_viewing(uuid, uuid[]) from public, anon;
grant execute on function public.create_joint_viewing(uuid, uuid[]) to authenticated;

-- Contesta a una invitación. Aceptar exige un pase COMPLETADO propio de la misma
-- obra que no esté ya en otro visionado (la app lo busca o lo crea antes, por la
-- máquina de estados). Al aceptar se publica el post conjunto si aún no existe:
-- autor = quien creó el visionado, fuente = el visionado. Lo inserta la base
-- porque su autor no es quien llama (la policy de insert de posts lo rechazaría).
create or replace function public.respond_joint_viewing(
  p_viewing_id uuid,
  p_accept boolean,
  p_pass_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_viewing record;
  v_pass record;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select v.id, v.item_type, v.item_id, v.created_by into v_viewing
  from public.joint_viewings v
  join public.joint_viewing_members m on m.viewing_id = v.id
  where v.id = p_viewing_id and m.user_id = v_uid and m.status = 'invited';
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  if not p_accept then
    update public.joint_viewing_members
      set status = 'declined', responded_at = now()
    where viewing_id = p_viewing_id and user_id = v_uid;
    return jsonb_build_object('status', 'declined', 'created_by', v_viewing.created_by);
  end if;

  select p.id, p.item_type, p.item_id, p.status into v_pass
  from public.passes p
  where p.id = p_pass_id and p.user_id = v_uid;
  if not found then
    raise exception 'pass_not_found' using errcode = 'P0002';
  end if;
  if v_pass.item_type <> v_viewing.item_type or v_pass.item_id <> v_viewing.item_id then
    raise exception 'pass_item_mismatch' using errcode = '22023';
  end if;
  if v_pass.status <> 'completed' then
    raise exception 'pass_not_completed' using errcode = '22023';
  end if;
  if exists (select 1 from public.joint_viewing_members m where m.pass_id = p_pass_id) then
    raise exception 'pass_already_joint' using errcode = '23505';
  end if;

  update public.joint_viewing_members
    set status = 'accepted', pass_id = p_pass_id, responded_at = now()
  where viewing_id = p_viewing_id and user_id = v_uid;

  insert into public.posts (author_id, kind, anchor_type, anchor_id, source_kind, source_id)
  values (
    v_viewing.created_by,
    'joint',
    v_viewing.item_type::text::public.post_anchor_type,
    v_viewing.item_id,
    'joint_viewing',
    p_viewing_id
  )
  on conflict do nothing;

  return jsonb_build_object('status', 'accepted', 'created_by', v_viewing.created_by);
end;
$$;
revoke execute on function public.respond_joint_viewing(uuid, boolean, uuid) from public, anon;
grant execute on function public.respond_joint_viewing(uuid, boolean, uuid) to authenticated;

-- Salirse (o retirar al propio pase de un visionado). Borra la fila del miembro;
-- el pase NO se toca. La reconciliación retira el post conjunto si quedan menos
-- de dos, y el visionado si no queda nadie.
create or replace function public.leave_joint_viewing(p_viewing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.joint_viewing_members
  where viewing_id = p_viewing_id and user_id = v_uid;
end;
$$;
revoke execute on function public.leave_joint_viewing(uuid) from public, anon;
grant execute on function public.leave_joint_viewing(uuid) to authenticated;
