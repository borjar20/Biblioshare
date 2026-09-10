-- R5: bellotas, desbloqueos cosméticos y la escena elegida del campamento.
-- Reserva el espacio de bloqueo consultivo 20260910 para recogidas y compras.
-- 20260908 es de aventuras y equipo: no se reutiliza.

create table public.pet_acorn_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 -- Clave del HECHO que generó el movimiento: 'day:2026-09-11', 'mission:<uuid>',
 -- 'achv:pet_achievement:finished:1', 'welcome', 'buy:creek'.
 source_key text not null,
 amount integer not null,
 created_at timestamptz not null default now(),
 -- Aquí vive la idempotencia: recoger dos veces no puede duplicar.
 unique (user_id, source_key)
);
alter table public.pet_acorn_ledger enable row level security;
revoke all on public.pet_acorn_ledger from public, anon, authenticated;
grant select on public.pet_acorn_ledger to authenticated;
grant all on public.pet_acorn_ledger to service_role;
create policy pet_acorn_ledger_read_own on public.pet_acorn_ledger for select to authenticated
 using ((select auth.uid()) = user_id);

create table public.pet_cosmetics (
 user_id uuid not null references auth.users(id) on delete cascade,
 cosmetic_id text not null,
 acquired_at timestamptz not null default now(),
 primary key (user_id, cosmetic_id)
);
alter table public.pet_cosmetics enable row level security;
revoke all on public.pet_cosmetics from public, anon, authenticated;
grant select on public.pet_cosmetics to authenticated;
grant all on public.pet_cosmetics to service_role;
create policy pet_cosmetics_read_own on public.pet_cosmetics for select to authenticated
 using ((select auth.uid()) = user_id);

-- La escena elegida es una DECISIÓN, así que va en pet_state. Solo la escribe
-- service_role a través de set_pet_camp_scene: sin grant de UPDATE para
-- authenticated, nadie puede ponerse una escena que no ha comprado.
alter table public.pet_state add column camp_scene text;
grant select (camp_scene) on public.pet_state to authenticated;

-- Una sola definición de «qué está pendiente», que usan la lectura y la recogida.
create function private.pet_acorn_pending(p_user uuid, p_epoch date)
returns table (kind text, key text) language sql stable security definer set search_path = '' as $$
 select 'welcome'::text, 'welcome'::text
 where not exists (select 1 from public.pet_acorn_ledger l
                   where l.user_id = p_user and l.source_key = 'welcome')
 union all
 select 'day', 'day:' || d.day::text
 from private.pet_lived_activity_days(p_user) d
 where d.day >= p_epoch
   and not exists (select 1 from public.pet_acorn_ledger l
                   where l.user_id = p_user and l.source_key = 'day:' || d.day::text)
 union all
 select 'mission', 'mission:' || m.id::text
 from public.pet_daily_missions m
 where m.user_id = p_user and m.completed_at is not null and m.day >= p_epoch
   and not exists (select 1 from public.pet_acorn_ledger l
                   where l.user_id = p_user and l.source_key = 'mission:' || m.id::text)
 union all
 select 'achievement', 'achv:' || c.event_key
 from public.user_celebrations c
 where c.user_id = p_user and c.event_type = 'pet_achievement'
   and (timezone('Europe/Madrid', c.first_triggered_at))::date >= p_epoch
   and not exists (select 1 from public.pet_acorn_ledger l
                   where l.user_id = p_user and l.source_key = 'achv:' || c.event_key);
$$;
alter function private.pet_acorn_pending(uuid, date) set datestyle = 'ISO, YMD';
revoke all on function private.pet_acorn_pending(uuid, date) from public, anon, authenticated;

create function public.pet_acorn_state(p_user uuid, p_epoch date)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'balance', coalesce((select sum(amount) from public.pet_acorn_ledger where user_id = p_user), 0),
  'pending', coalesce((select jsonb_agg(jsonb_build_object('kind', p.kind, 'key', p.key) order by p.key)
                       from private.pet_acorn_pending(p_user, p_epoch) p), '[]'::jsonb),
  'owned', coalesce((select jsonb_agg(cosmetic_id order by cosmetic_id)
                     from public.pet_cosmetics where user_id = p_user), '[]'::jsonb),
  'scene', (select camp_scene from public.pet_state where user_id = p_user));
$$;
revoke all on function public.pet_acorn_state(uuid, date) from public, anon, authenticated;
grant execute on function public.pet_acorn_state(uuid, date) to service_role;

-- Las tarifas llegan resueltas desde el código: {"day":10,"mission":5,...}.
create function public.claim_pet_acorns(p_user uuid, p_epoch date, p_rates jsonb)
returns setof public.pet_acorn_ledger language plpgsql security definer set search_path = '' as $$
begin
 perform pg_advisory_xact_lock(20260910, hashtext(p_user::text));
 return query
 insert into public.pet_acorn_ledger (user_id, source_key, amount)
 select p_user, f.key, (p_rates ->> f.kind)::integer
 from private.pet_acorn_pending(p_user, p_epoch) f
 where (p_rates ->> f.kind) is not null and (p_rates ->> f.kind)::integer > 0
 on conflict (user_id, source_key) do nothing
 returning *;
end $$;
revoke all on function public.claim_pet_acorns(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.claim_pet_acorns(uuid, date, jsonb) to service_role;

create function public.buy_pet_cosmetic(p_user uuid, p_cosmetic text, p_price integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_balance integer;
begin
 if p_cosmetic is null or p_price is null or p_price < 0 then raise exception 'INVALID_COSMETIC'; end if;
 -- El bloqueo es lo que impide que dos toques simultáneos compren dos cosas con
 -- el saldo de una: sin él, ambos leen el mismo saldo antes de que nadie gaste.
 perform pg_advisory_xact_lock(20260910, hashtext(p_user::text));
 if exists (select 1 from public.pet_cosmetics
            where user_id = p_user and cosmetic_id = p_cosmetic) then
  return jsonb_build_object('bought', false, 'owned', true);
 end if;
 select coalesce(sum(amount), 0) into v_balance
 from public.pet_acorn_ledger where user_id = p_user;
 if v_balance < p_price then raise exception 'NOT_ENOUGH'; end if;
 insert into public.pet_cosmetics (user_id, cosmetic_id) values (p_user, p_cosmetic);
 insert into public.pet_acorn_ledger (user_id, source_key, amount)
 values (p_user, 'buy:' || p_cosmetic, -p_price);
 return jsonb_build_object('bought', true, 'owned', true);
end $$;
revoke all on function public.buy_pet_cosmetic(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.buy_pet_cosmetic(uuid, text, integer) to service_role;

-- null = la escena de siempre, que es gratis y no tiene fila en pet_cosmetics.
create function public.set_pet_camp_scene(p_user uuid, p_scene text)
returns text language plpgsql security definer set search_path = '' as $$
begin
 if p_scene is not null and not exists (select 1 from public.pet_cosmetics
                                        where user_id = p_user and cosmetic_id = p_scene) then
  raise exception 'NOT_OWNED';
 end if;
 update public.pet_state set camp_scene = p_scene, updated_at = now() where user_id = p_user;
 if not found then raise exception 'NO_PET'; end if;
 return p_scene;
end $$;
revoke all on function public.set_pet_camp_scene(uuid, text) from public, anon, authenticated;
grant execute on function public.set_pet_camp_scene(uuid, text) to service_role;
