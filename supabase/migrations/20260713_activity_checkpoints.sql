-- EPIC-05 Bloque H1 — Checkpoints y lectura conjunta (buddy_read). Ver
-- docs/requirements/social-epic.md. Reutiliza el motor de actividades de club (Bloque G):
-- club_activities/club_activity_items/is_club_member/has_min_club_role/is_activity_participant
-- ya existen y no se recrean aquí. Este bloque añade la extensión específica de buddy_read
-- que SD-8 (Bloque G) dejó pendiente: checkpoints ordenados sobre el único ítem del pool, y
-- un tablero de progreso grupal (quién ha llegado a qué checkpoint) reusando comments/reactions
-- polimórficos (target_kind) para el chat de cada checkpoint.

-- ── Tablas ───────────────────────────────────────────────────────────────
create table public.club_activity_checkpoints (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  label text not null,
  position jsonb not null,        -- mismo vocabulario que library_entries.position (Bloque
                                   -- H1 lo interpreta solo para book/series, ver
                                   -- src/lib/library/position.ts): {"page": n} o
                                   -- {"season": n, "episode": n}
  "order" smallint not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Sin FK de columna hacia club_activity_checkpoints en cuanto a "una lectura por
-- checkpoint" -- la unicidad real es la PK compuesta de abajo, no una restricción de
-- pertenencia a actividad (checkpoint_id ya implica la actividad vía su propia FK).
create table public.club_activity_checkpoint_reads (
  checkpoint_id uuid not null references public.club_activity_checkpoints(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reached_at timestamptz not null default now(),
  primary key (checkpoint_id, user_id)
);

create index idx_club_activity_checkpoints_activity on public.club_activity_checkpoints (activity_id, "order");
create index idx_club_activity_checkpoint_reads_checkpoint on public.club_activity_checkpoint_reads (checkpoint_id);

comment on table public.club_activity_checkpoints is 'Checkpoints ordenados de una actividad buddy_read (EPIC-05 Bloque H1). position es el mismo shape polimórfico que library_entries.position, interpretado solo para book/series. Visibles a todo el club (no solo a participantes) para que puedan decidir si unirse; solo moderator+ los crea/edita/borra, y solo mientras la actividad está active.';
comment on table public.club_activity_checkpoint_reads is 'Quién ha confirmado haber llegado a qué checkpoint (tablero de progreso grupal). Sin política de escritura de cliente -- solo vía confirm_checkpoint() (SECURITY DEFINER), que revalida server-side contra library_entries.position antes de insertar.';

-- ── Helper SECURITY DEFINER ──────────────────────────────────────────────
-- Necesario ANTES de recrear can_view_target() más abajo (lo referencia). Mismo patrón que
-- is_activity_participant()/has_voted_in_club_poll(): evita recursión estructural al usarse
-- desde la política SELECT de reactions/comments sobre target_type='activity_checkpoint'.
create or replace function public.has_reached_checkpoint(p_checkpoint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_activity_checkpoint_reads
    where checkpoint_id = p_checkpoint_id and user_id = auth.uid()
  );
$$;

comment on function public.has_reached_checkpoint(uuid) is 'True si el usuario actual ha confirmado (vía confirm_checkpoint) haber llegado a este checkpoint (EPIC-05 Bloque H1).';

-- ── target_kind (Bloque B/F) gana un valor: los checkpoints se vuelven comentables
-- (chat del checkpoint) -- pero SOLO visibles/comentables para quien ya lo alcanzó (spoiler
-- guard: el chat de un checkpoint puede destripar la trama más allá de ese punto).
alter type public.target_kind add value 'activity_checkpoint';

-- Postgres exige que un valor nuevo de enum esté COMMITted antes de poder usarse (55P04) --
-- can_view_target() de abajo lo referencia como literal inmediatamente. Mismo idiom que
-- 20260712_club_posts.sql (club_post/comment): sin BEGIN explícito que cerrar, Postgres
-- reabre una transacción implícita para el resto del script.
commit;

-- can_view_target() (Bloque B/F) gana una rama. Las 4 ramas existentes se preservan
-- verbatim (misma definición que 20260712_club_posts.sql) -- solo se añade 'activity_checkpoint'.
-- Requiere is_activity_participant() (haberte unido a la actividad) Y has_reached_checkpoint()
-- (haber confirmado ese checkpoint concreto) -- no basta ser miembro del club ni participante:
-- el spoiler guard es por checkpoint individual, no por actividad.
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
    when 'activity_checkpoint' then exists (
      select 1 from public.club_activity_checkpoints cc
      where cc.id = p_target_id
        and public.is_activity_participant(cc.activity_id)
        and public.has_reached_checkpoint(cc.id)
    )
  end;
$$;

-- ── RPCs SECURITY DEFINER ────────────────────────────────────────────────
-- confirm_checkpoint: revalida server-side contra library_entries.position -- nunca confía
-- en que el cliente solo llame esto cuando de verdad ha llegado. Confirmar el checkpoint N
-- auto-confirma 1..N-1 (idempotente vía on conflict do nothing) -- evita que alguien que
-- saltó directo a un checkpoint tardío se quede sin fila en los anteriores.
create or replace function public.confirm_checkpoint(p_checkpoint_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_order smallint;
  v_target_position jsonb;
  v_item_type public.item_type;
  v_item_id uuid;
  v_item_count int;
  v_user_position jsonb;
begin
  select activity_id, "order", position into v_activity_id, v_order, v_target_position
    from public.club_activity_checkpoints
    where id = p_checkpoint_id;

  if v_activity_id is null then
    raise exception 'not found';
  end if;
  if not public.is_activity_participant(v_activity_id) then
    raise exception 'forbidden';
  end if;

  select count(*) into v_item_count
    from public.club_activity_items
    where activity_id = v_activity_id;
  if v_item_count = 0 then
    raise exception 'no item in activity';
  end if;

  -- buddy_read = exactamente un ítem en el pool (enforce_buddy_read_item_rules lo garantiza
  -- más abajo) -- limit 1 es solo defensivo, no una elección arbitraria entre varios.
  select item_type, item_id into v_item_type, v_item_id
    from public.club_activity_items
    where activity_id = v_activity_id
    limit 1;

  select le.position into v_user_position
    from public.library_entries le
    where le.user_id = auth.uid() and le.item_type = v_item_type and le.item_id = v_item_id;

  if v_user_position is null then
    raise exception 'checkpoint_not_reached';
  end if;

  if v_item_type = 'book' then
    if coalesce((v_user_position->>'page')::numeric, 0) < coalesce((v_target_position->>'page')::numeric, 0) then
      raise exception 'checkpoint_not_reached';
    end if;
  elsif v_item_type = 'series' then
    if row(
      coalesce((v_user_position->>'season')::int, 0),
      coalesce((v_user_position->>'episode')::int, 0)
    ) < row(
      coalesce((v_target_position->>'season')::int, 0),
      coalesce((v_target_position->>'episode')::int, 0)
    ) then
      raise exception 'checkpoint_not_reached';
    end if;
  else
    raise exception 'unsupported item type for buddy_read';
  end if;

  insert into public.club_activity_checkpoint_reads (checkpoint_id, user_id)
  select id, auth.uid()
    from public.club_activity_checkpoints
    where activity_id = v_activity_id and "order" <= v_order
  on conflict (checkpoint_id, user_id) do nothing;
end;
$$;

revoke execute on function public.confirm_checkpoint(uuid) from public, anon;
grant execute on function public.confirm_checkpoint(uuid) to authenticated;

-- reorder_activity_checkpoints: mismo idiom que reorder_queue (20260710_reorder_queue_rpc.sql)
-- -- SECURITY INVOKER, un solo UPDATE con unnest ... with ordinality, sin lógica de
-- autorización propia: la política UPDATE de club_activity_checkpoints (moderator+ en
-- actividad active) ya gatea esto, no hay que duplicarla aquí.
create or replace function public.reorder_activity_checkpoints(p_activity_id uuid, p_checkpoint_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.club_activity_checkpoints cc
  set "order" = t.ord - 1
  from unnest(p_checkpoint_ids) with ordinality as t(id, ord)
  where cc.id = t.id
    and cc.activity_id = p_activity_id;
end;
$$;

revoke execute on function public.reorder_activity_checkpoints(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_activity_checkpoints(uuid, uuid[]) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.club_activity_checkpoints enable row level security;

-- Cualquier miembro del club ve los checkpoints (labels/posiciones, no el chat -- eso lo
-- gatea can_view_target arriba) -- a diferencia de club_activity_opinions (Bloque G, solo
-- participantes), aquí un no-participante necesita verlos para decidir si unirse.
create policy "club_activity_checkpoints select member" on public.club_activity_checkpoints
  for select to authenticated
  using (
    exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and public.is_club_member(ca.club_id)
    )
  );

-- Solo moderator+ del club, y solo mientras la actividad está active -- no se pueden
-- proponer checkpoints antes de activar ni tras finalizar/archivar.
create policy "club_activity_checkpoints insert moderator on active" on public.club_activity_checkpoints
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and ca.status = 'active' and public.has_min_club_role(ca.club_id, 'moderator')
    )
  );

create policy "club_activity_checkpoints update moderator on active" on public.club_activity_checkpoints
  for update to authenticated
  using (
    exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and ca.status = 'active' and public.has_min_club_role(ca.club_id, 'moderator')
    )
  )
  with check (
    exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and ca.status = 'active' and public.has_min_club_role(ca.club_id, 'moderator')
    )
  );

create policy "club_activity_checkpoints delete moderator on active" on public.club_activity_checkpoints
  for delete to authenticated
  using (
    exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and ca.status = 'active' and public.has_min_club_role(ca.club_id, 'moderator')
    )
  );

alter table public.club_activity_checkpoint_reads enable row level security;

-- Solo SELECT -- sin INSERT/UPDATE/DELETE de cliente a propósito, confirm_checkpoint()
-- (SECURITY DEFINER) es el único camino de escritura (bypassa RLS). Tablero de progreso
-- grupal: cualquier PARTICIPANTE ve las lecturas de TODOS los participantes, no solo la
-- propia -- ver quién va por dónde es el punto de esta tabla.
create policy "club_activity_checkpoint_reads select participant" on public.club_activity_checkpoint_reads
  for select to authenticated
  using (
    exists (
      select 1 from public.club_activity_checkpoints cc
      where cc.id = checkpoint_id and public.is_activity_participant(cc.activity_id)
    )
  );

-- ── Trigger: reglas de buddy_read sobre el pool de ítems compartido ─────────
-- club_activity_items (Bloque G) es genérico entre kinds -- este trigger solo actúa cuando
-- kind='buddy_read' (no-op para tierlist/list_challenge/criteria_challenge, que tendrán sus
-- propias reglas en bloques futuros). buddy_read exige exactamente UN ítem, y solo book o
-- series (un checkpoint de página/temporada-episodio no tiene sentido para una película).
create or replace function public.enforce_buddy_read_item_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.activity_kind;
  v_existing_count int;
begin
  select kind into v_kind from public.club_activities where id = new.activity_id;

  if v_kind is distinct from 'buddy_read' then
    return new;
  end if;

  if new.item_type not in ('book', 'series') then
    raise exception 'buddy_read activities only accept book or series items';
  end if;

  if tg_op = 'INSERT' then
    select count(*) into v_existing_count
      from public.club_activity_items
      where activity_id = new.activity_id;
    if v_existing_count >= 1 then
      raise exception 'buddy_read activities can only have one item';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_buddy_read_item_rules() is 'BEFORE INSERT/UPDATE en club_activity_items (EPIC-05 Bloque H1): para kind=buddy_read exige item_type book/series y como máximo un ítem en el pool. No-op para el resto de kinds -- ver comentario de la función.';

create trigger trg_enforce_buddy_read_item_rules
  before insert or update on public.club_activity_items
  for each row execute function public.enforce_buddy_read_item_rules();
