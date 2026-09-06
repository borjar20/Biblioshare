-- Mascota R1 (docs/superpowers/specs/2026-09-06-mascota-r1-contratos-combate-design.md §13).
--
-- Un combate es un HECHO: seed, snapshot inmutable de la mascota, versión de reglas,
-- hash del contenido, log de inputs y resultado RE-SIMULADO en servidor, con su digest.
-- Los eventos NO se guardan: se derivan volviendo a simular (Parte I §16.5).
--
-- Autoridad (#1081 R1): el cliente solo LEE lo suyo (necesita seed y snapshot para
-- simular en vivo). No hay política ni grant de INSERT/UPDATE/DELETE para
-- authenticated ni anon: escribe únicamente el servidor con service_role, después
-- de re-simular. Ninguna RPC accesible al cliente inserta aquí.

create table public.pet_battles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Identificador por INTENCIÓN (uuid v4 que genera el cliente por cada «pelear»):
  -- un reintento trae el mismo intent_id y recupera el combate (#1081 R4).
  intent_id uuid not null,
  -- text, no enum: 'training' hoy; R4 añade 'adventure' sin migración de tipo.
  kind text not null default 'training',
  enemy_id text not null,
  ruleset_version text not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  seed text not null check (seed ~ '^[0-9a-f]{32}$'),
  snapshot jsonb not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  inputs jsonb,
  result jsonb,
  digest text check (digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, intent_id),
  -- Abierto = sin inputs/resultado/digest; resuelto = con los tres y su fecha.
  check (
    (status = 'open' and inputs is null and result is null and digest is null and resolved_at is null)
    or (status = 'resolved' and inputs is not null and result is not null and digest is not null and resolved_at is not null)
  )
);

create index pet_battles_user_created_idx on public.pet_battles (user_id, created_at desc);

comment on table public.pet_battles is
  'Mascota RPG: combates como hechos (seed, snapshot, versión, inputs, resultado re-simulado, digest). Solo escribe el servidor (service_role); authenticated lee los suyos. Eventos no se guardan: se re-simulan. Spec 2026-09-06-mascota-r1-contratos-combate.';

alter table public.pet_battles enable row level security;

create policy "pet_battles select own" on public.pet_battles
  for select to authenticated using ((select auth.uid()) = user_id);

-- Sin políticas de escritura A PROPÓSITO (#1081 R1). service_role no pasa por RLS.
revoke all on public.pet_battles from anon, authenticated;
grant select on public.pet_battles to authenticated;
