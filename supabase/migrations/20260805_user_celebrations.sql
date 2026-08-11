-- Sistema de celebraciones (microanimaciones por evento).
--
-- Fuente de verdad de "qué celebración ha ganado ya un usuario", para que un
-- hito NO se repita entre recargas ni entre dispositivos (los localStorage no
-- se comparten). El estado vivo del usuario vive en `passes`; esta tabla NO es
-- estado de progreso, es memoria de UI persistida — de ahí que sea propia y
-- mínima.
--
-- Modelo "ganar → drenar":
--   * Las server actions de dominio GANAN una celebración (insert idempotente).
--     La restricción UNIQUE es la deduplicación: ganar dos veces el mismo hito
--     no crea una segunda fila (ON CONFLICT DO NOTHING vía upsert ignoreDuplicates).
--   * El cliente DRENA las no mostradas (displayed_at IS NULL) por RPC atómica,
--     las anima una vez y las marca como mostradas. Recargar no vuelve a mostrar.

create table public.user_celebrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- text, no enum: añadir un evento nuevo no debe exigir una migración de tipo.
  -- El registro de la app (registry.ts) es la fuente de verdad de los valores.
  event_type text not null,
  -- Clave de deduplicación estable: 'first_activity_of_day:2026-08-05',
  -- 'streak_milestone:30', 'first_club_participation'. Ver getCelebrationKey.
  event_key text not null,
  payload jsonb not null default '{}'::jsonb,
  first_triggered_at timestamptz not null default now(),
  last_triggered_at timestamptz not null default now(),
  -- NULL = ganada pero aún no animada. El drenado la sella con now().
  displayed_at timestamptz,
  created_at timestamptz not null default now(),
  -- La deduplicación permanente: un usuario gana cada (tipo, clave) una vez.
  unique (user_id, event_type, event_key)
);

-- El drenado pide "mis no mostradas": índice parcial, solo las filas que importan.
create index idx_user_celebrations_pending
  on public.user_celebrations (user_id)
  where displayed_at is null;

comment on table public.user_celebrations is
  'Memoria de celebraciones ganadas por usuario (microanimaciones). Dedup permanente vía UNIQUE(user_id,event_type,event_key). Modelo ganar→drenar: dominio gana (idempotente), cliente drena las no mostradas por RPC atómica. Ver src/lib/celebrations.';

alter table public.user_celebrations enable row level security;

-- Cada usuario solo ve, gana y sella las suyas. Escribe con su propia sesión
-- (RLS aplica): no hace falta service-role porque uno gana SUS celebraciones.
create policy "user_celebrations select own" on public.user_celebrations
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "user_celebrations insert own" on public.user_celebrations
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- UPDATE own: el sellado (displayed_at) va por la RPC de abajo, pero la política
-- permite además que el usuario sea dueño de su propia fila sin escalada.
create policy "user_celebrations update own" on public.user_celebrations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.user_celebrations to authenticated;

-- Drenado atómico: reclama y devuelve las no mostradas en UNA sentencia, para
-- que dos pestañas abiertas a la vez no animen la misma celebración dos veces
-- (la segunda encuentra displayed_at ya puesto y no devuelve nada).
create or replace function public.pull_pending_celebrations()
returns table (event_type text, event_key text, payload jsonb)
language sql
security definer
set search_path = public
as $$
  update public.user_celebrations c
     set displayed_at = now()
   where c.user_id = auth.uid()
     and c.displayed_at is null
  returning c.event_type, c.event_key, c.payload;
$$;

comment on function public.pull_pending_celebrations() is
  'Reclama atómicamente las celebraciones no mostradas del usuario actual (marca displayed_at=now) y las devuelve. Idempotente ante llamadas concurrentes.';

revoke all on function public.pull_pending_celebrations() from public, anon;
grant execute on function public.pull_pending_celebrations() to authenticated;
