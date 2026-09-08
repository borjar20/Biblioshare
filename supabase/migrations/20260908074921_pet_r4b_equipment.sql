-- R4b: immutable quality per opportunity and atomic equipment snapshots.
-- Extends lock namespace 20260908 from adventures to equipment/training starts.
create table public.pet_loadout (
 user_id uuid primary key references auth.users(id) on delete cascade,
 weapon_battle_id uuid references public.pet_battles(id) on delete set null,
 amulet_battle_id uuid references public.pet_battles(id) on delete set null,
 updated_at timestamptz not null default now()
);
alter table public.pet_loadout enable row level security;
revoke all on public.pet_loadout from public, anon, authenticated;
grant select on public.pet_loadout to authenticated;
grant all on public.pet_loadout to service_role;
create policy pet_loadout_read_own on public.pet_loadout for select to authenticated
 using ((select auth.uid()) = user_id);

create function private.pet_quality_v1(p_user uuid,p_day date)
returns integer language sql immutable strict set search_path='' as $$
 select (8000 + 1000 * ((('x' || substr(md5(p_user::text || ':' || p_day::text || ':pet-quality-v1'),1,8))::bit(32)::bigint) % 5))::integer;
$$;
-- DateStyle is fixed at the function boundary so the same date always hashes alike.
alter function private.pet_quality_v1(uuid,date) set datestyle='ISO, YMD';
revoke all on function private.pet_quality_v1(uuid,date) from public,anon,authenticated;

create function private.pet_owned_copy(p_user uuid,p_copy uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('copyId',b.id,'itemId',b.reward->>'itemId',
   'qualityBp',case when b.reward ? 'qualityBp' then b.reward->'qualityBp' else '10000'::jsonb end)
 from public.pet_battles b
 where b.id=p_copy and b.user_id=p_user and b.kind='adventure' and b.status='resolved'
 and b.result->>'outcome'='win'
 and (
  (b.reward->>'slot'='weapon' and b.reward->>'itemId' in ('sharp_bookmark','heavy_ink_quill','librarian_loupe'))
  or (b.reward->>'slot'='amulet' and b.reward->>'itemId' in ('last_page_amulet','loan_pendant','streak_medallion'))
 )
 and ((not (b.reward ? 'qualityBp') and not (b.reward ? 'qualityVersion'))
  or (b.reward->'qualityVersion'='1'::jsonb and b.reward->'qualityBp' in ('8000'::jsonb,'9000'::jsonb,'10000'::jsonb,'11000'::jsonb,'12000'::jsonb)));
$$;
revoke all on function private.pet_owned_copy(uuid,uuid) from public,anon,authenticated;

create function private.pet_equipment_snapshot(p_user uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'weapon',private.pet_owned_copy(p_user,l.weapon_battle_id),
  'amulet',private.pet_owned_copy(p_user,l.amulet_battle_id))
 from (select p_user as id) u left join public.pet_loadout l on l.user_id=u.id;
$$;
revoke all on function private.pet_equipment_snapshot(uuid) from public,anon,authenticated;

create function public.set_pet_equipment(p_user uuid,p_slot text,p_copy uuid)
returns setof public.pet_loadout language plpgsql security definer set search_path='' as $$
declare v_copy jsonb; v_slot text;
begin
 if p_user is null then raise exception 'NOT_OWNED'; end if;
 if p_slot is null or p_slot not in ('weapon','amulet') then raise exception 'INVALID_SLOT'; end if;
 perform pg_advisory_xact_lock(20260908,hashtext(p_user::text));
 if p_copy is not null then
  v_copy := private.pet_owned_copy(p_user,p_copy);
  if v_copy is null then raise exception 'NOT_OWNED'; end if;
  select reward->>'slot' into v_slot from public.pet_battles where id=p_copy and user_id=p_user;
  if v_slot<>p_slot then raise exception 'WRONG_SLOT'; end if;
 end if;
 insert into public.pet_loadout(user_id) values(p_user) on conflict do nothing;
 return query update public.pet_loadout set
  weapon_battle_id=case when p_slot='weapon' then p_copy else weapon_battle_id end,
  amulet_battle_id=case when p_slot='amulet' then p_copy else amulet_battle_id end,
  updated_at=now() where user_id=p_user returning *;
end $$;
revoke all on function public.set_pet_equipment(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.set_pet_equipment(uuid,text,uuid) to service_role;

create function public.start_pet_training(
 p_user uuid,p_intent uuid,p_seed text,p_enemy text,p_ruleset_version text,p_content_hash text,p_snapshot jsonb
) returns setof public.pet_battles language plpgsql security definer set search_path='' as $$
declare v_row public.pet_battles;
begin
 perform pg_advisory_xact_lock(20260908,hashtext(p_user::text));
 select * into v_row from public.pet_battles where user_id=p_user and intent_id=p_intent;
 if found then
  if v_row.kind<>'training' then raise exception 'INVALID_INTENT'; end if;
  return next v_row; return;
 end if;
 if p_ruleset_version='r4.2' then
  p_snapshot := (p_snapshot-'equipment') || jsonb_build_object('equipment',private.pet_equipment_snapshot(p_user));
 end if;
 return query insert into public.pet_battles(user_id,intent_id,kind,enemy_id,ruleset_version,content_hash,seed,snapshot,status)
 values(p_user,p_intent,'training',p_enemy,p_ruleset_version,p_content_hash,p_seed,p_snapshot,'open') returning *;
end $$;
revoke all on function public.start_pet_training(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.start_pet_training(uuid,uuid,text,text,text,text,jsonb) to service_role;

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
  if p_ruleset_version='r4.2' then
    p_snapshot := (p_snapshot-'equipment') || jsonb_build_object('equipment',private.pet_equipment_snapshot(p_user));
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
    if v_row.ruleset_version='r4.2' then
      if jsonb_typeof(p_reward_order) is distinct from 'array' then raise exception 'INVALID_REWARD_ORDER'; end if;
      if jsonb_array_length(p_reward_order)<>6 or (
        select count(distinct o->>'itemId') from jsonb_array_elements(p_reward_order) o
        where (o->>'slot'='weapon' and o->>'itemId' in ('sharp_bookmark','heavy_ink_quill','librarian_loupe'))
        or (o->>'slot'='amulet' and o->>'itemId' in ('last_page_amulet','loan_pendant','streak_medallion'))
      )<>6 then raise exception 'INVALID_REWARD_ORDER'; end if;
    end if;
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
    if v_row.ruleset_version='r4.2' then
      v_reward := jsonb_build_object('itemId',v_reward->>'itemId','slot',v_reward->>'slot',
        'qualityBp',private.pet_quality_v1(p_user,v_row.adventure_day),'qualityVersion',1);
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
