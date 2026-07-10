-- Retos de lectura/visionado (§7.10).
--
-- Un objetivo anual por tipo (profiles.annual_goal_*) cubre "50 libros este
-- año". Un reto es la versión con nombre, ventana temporal y criterio libre:
-- "reto de verano: 5 pelis", "10 libros de ciencia ficción", "toda la saga X".
-- Entidad propia, no una fila más de profiles.

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- NULL = cualquier tipo cuenta para el reto.
  item_type public.item_type,
  target_count integer not null check (target_count > 0),
  -- Filtro adicional aplicado en la capa de app (§7.10). v1: {"genre": "..."}
  -- o {"saga_id": "..."}; {} = sin filtro. Jsonb en vez de columnas porque el
  -- formato va a crecer y no se consulta en SQL, se aplica al contar.
  criteria jsonb not null default '{}',
  start_date date not null,
  end_date date not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index idx_challenges_user on public.challenges (user_id, archived_at);

comment on table public.challenges is 'Retos con nombre, ventana temporal y criterio (§7.10). El progreso se calcula al vuelo contando diary_entries que casan tipo+criterio+fechas.';

-- Seguimiento personal: solo el dueño, como queues. No es parte de la vitrina
-- pública del perfil (§8-G).
alter table public.challenges enable row level security;

create policy "own challenges select" on public.challenges
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own challenges insert" on public.challenges
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own challenges update" on public.challenges
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "own challenges delete" on public.challenges
  for delete to authenticated using ((select auth.uid()) = user_id);
