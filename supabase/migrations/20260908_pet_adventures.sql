-- R4a (spec docs/superpowers/specs/2026-09-06-mascota-r4a-aventuras-design.md §4–§6).
-- Aditiva sobre pet_battles. Dev primero; prod solo tras la aceptación de R3 (#1106).

-- 1. Columnas, CHECKs e índices
alter table public.pet_battles
  add column adventure_day date,
  add column attempt smallint,
  add column reward jsonb;

alter table public.pet_battles add constraint pet_battles_adventure_shape check (
  (kind = 'adventure' and adventure_day is not null and attempt is not null and attempt >= 1)
  or (kind <> 'adventure' and adventure_day is null and attempt is null)
);
alter table public.pet_battles add constraint pet_battles_reward_resolved check (
  reward is null or status = 'resolved'
);
create unique index pet_battles_adventure_attempt_idx
  on public.pet_battles (user_id, adventure_day, attempt) where kind = 'adventure';
create unique index pet_battles_adventure_open_idx
  on public.pet_battles (user_id) where kind = 'adventure' and status = 'open';
create unique index pet_battles_adventure_win_idx
  on public.pet_battles (user_id, adventure_day)
  where kind = 'adventure' and status = 'resolved' and result->>'outcome' = 'win';

comment on column public.pet_battles.adventure_day is 'R4a: día local (Europe/Madrid) cuya aventura es esta fila; null en entrenamiento.';
comment on column public.pet_battles.attempt is 'R4a: número de intento de ese día (1..n); un día se reintenta hasta ganarlo.';
comment on column public.pet_battles.reward is 'R4a: {itemId, slot} entregado al ganar; fuera del digest porque depende del inventario.';

-- 2. Concesión derivada (§5). La pura no mira auth.uid(): la llaman las funciones de escritura
--    con service_role. La de espectador exige identidad; el wrapper público toma la sesión.
create or replace function private.pet_pending_adventure_days(p_user uuid)
returns table (day date)
language sql stable security definer
set search_path = ''
as $$
  select d.day
  from private.pet_lived_activity_days(p_user) d
  where d.day between (timezone('Europe/Madrid', now()))::date - 6 and (timezone('Europe/Madrid', now()))::date
    and not exists (
      select 1 from public.pet_battles b
      where b.user_id = p_user and b.kind = 'adventure' and b.adventure_day = d.day
    )
  order by d.day;
$$;
revoke all on function private.pet_pending_adventure_days(uuid) from public, anon, authenticated;

create or replace function private.pet_adventure_days(p_viewer uuid)
returns table (day date)
language sql stable security definer
set search_path = ''
as $$
  select * from private.pet_pending_adventure_days(p_viewer) where p_viewer = (select auth.uid());
$$;
revoke all on function private.pet_adventure_days(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.pet_adventure_days(uuid) to authenticated;

create or replace function public.get_pet_adventure_days()
returns table (day date)
language sql stable security invoker
set search_path = ''
as $$
  select * from private.pet_adventure_days((select auth.uid()));
$$;
revoke all on function public.get_pet_adventure_days() from public, anon;
grant execute on function public.get_pet_adventure_days() to authenticated;

-- 3. Escritura serializada por usuario (§6). Primer bloqueo consultivo del repo:
--    clave (20260908, hashtext(user)). No reutilizar 20260908 para otra cosa.
create or replace function public.start_pet_adventure(
  p_user uuid, p_seed text, p_intent uuid, p_enemies text,
  p_ruleset_version text, p_content_hash text, p_snapshot jsonb
)
returns setof public.pet_battles
language plpgsql security definer
set search_path = ''
as $$
declare
  v_open public.pet_battles;
  v_day date;
  v_attempt smallint;
begin
  perform pg_advisory_xact_lock(20260908, hashtext(p_user::text));
  -- (1) intento abierto: se devuelve tal cual
  select * into v_open from public.pet_battles
   where user_id = p_user and kind = 'adventure' and status = 'open';
  if found then
    return next v_open;
    return;
  end if;
  -- (2) día con intentos y sin victoria: siguiente intento
  select b.adventure_day, max(b.attempt) + 1 into v_day, v_attempt
    from public.pet_battles b
   where b.user_id = p_user and b.kind = 'adventure'
     and not exists (
       select 1 from public.pet_battles w
        where w.user_id = p_user and w.kind = 'adventure' and w.adventure_day = b.adventure_day
          and w.status = 'resolved' and w.result->>'outcome' = 'win')
   group by b.adventure_day
   order by b.adventure_day
   limit 1;
  -- (3) día pendiente más antiguo, recalculado bajo el bloqueo
  if v_day is null then
    select min(day) into v_day from private.pet_pending_adventure_days(p_user);
    v_attempt := 1;
  end if;
  -- (4) nada: cero filas
  if v_day is null then
    return;
  end if;
  return query
    insert into public.pet_battles
      (user_id, intent_id, kind, enemy_id, ruleset_version, content_hash, seed, snapshot, status, adventure_day, attempt)
    values
      (p_user, p_intent, 'adventure', p_enemies, p_ruleset_version, p_content_hash, p_seed, p_snapshot, 'open', v_day, v_attempt)
    returning *;
end;
$$;
revoke all on function public.start_pet_adventure(uuid, text, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.start_pet_adventure(uuid, text, uuid, text, text, text, jsonb) to service_role;

create or replace function public.resolve_pet_adventure(
  p_user uuid, p_intent uuid, p_inputs jsonb, p_result jsonb, p_digest text, p_reward_order jsonb
)
returns setof public.pet_battles
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.pet_battles;
  v_reward jsonb := null;
begin
  perform pg_advisory_xact_lock(20260908, hashtext(p_user::text));
  select * into v_row from public.pet_battles
   where user_id = p_user and intent_id = p_intent and kind = 'adventure';
  if not found then
    return;
  end if;
  -- Un resultado guardado gana sobre cualquier reintento: se devuelve sin tocarlo.
  if v_row.status = 'resolved' then
    return next v_row;
    return;
  end if;
  if p_result->>'outcome' = 'win' then
    if exists (
      select 1 from public.pet_battles w
       where w.user_id = p_user and w.kind = 'adventure' and w.adventure_day = v_row.adventure_day
         and w.status = 'resolved' and w.result->>'outcome' = 'win') then
      raise exception 'DAY_ALREADY_WON' using errcode = 'P0001';
    end if;
    -- Primer objeto de la permutación que el usuario no posee; si los posee todos, el primero.
    select o.item into v_reward
      from jsonb_array_elements(p_reward_order) with ordinality as o(item, ord)
     where not exists (
       select 1 from public.pet_battles w
        where w.user_id = p_user and w.kind = 'adventure' and w.reward is not null
          and w.reward->>'itemId' = o.item->>'itemId')
     order by o.ord
     limit 1;
    if v_reward is null then
      v_reward := p_reward_order->0;
    end if;
    -- Una victoria sin lista de botín es un bug del servidor, no un caso: se rechaza para no quemar el día sin recompensa.
    if v_reward is null then
      raise exception 'EMPTY_REWARD_ORDER' using errcode = 'P0001';
    end if;
  end if;
  return query
    update public.pet_battles
       set status = 'resolved', inputs = p_inputs, result = p_result, digest = p_digest,
           resolved_at = now(), reward = v_reward
     where id = v_row.id and status = 'open'
    returning *;
end;
$$;
revoke all on function public.resolve_pet_adventure(uuid, uuid, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_pet_adventure(uuid, uuid, jsonb, jsonb, text, jsonb) to service_role;
