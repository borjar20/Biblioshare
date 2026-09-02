-- Mascota fase 2 (spec 2026-09-02-mascota-misiones-logros-design.md, §3).
--
-- La única DECISIÓN que se guarda de las misiones: qué tres te tocaron hoy
-- (si se derivaran, mutarían a mediodía al cambiar de clase o subir un
-- atributo). Progreso y XP se derivan en src/lib/pet/missions. `completed_at`
-- lo pone getPetSnapshot cuando el progreso del día alcanza `target`.
-- Objetivo, XP y título se CONGELAN al asignar para que un cambio de balance
-- o de catálogo no reescriba una misión ya vista.

create table public.pet_daily_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Día LOCAL del usuario (todayISO()), como session_date.
  day date not null,
  slot smallint not null check (slot between 0 and 2),
  -- text, no enum: los ids válidos los fija src/lib/pet/missions/templates.ts.
  template text not null,
  target integer not null check (target > 0),
  xp integer not null check (xp >= 0),
  -- Solo las duras con obra («Termina Dune»): sin FK porque una obra fusionada
  -- o borrada no debe borrar la misión; se compara como "tipo:id".
  item_type text,
  item_id uuid,
  item_title text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, day, slot)
);

comment on table public.pet_daily_missions is
  'Mascota fase 2: las tres misiones asignadas por día y usuario. Progreso y XP se derivan (src/lib/pet/missions); completed_at lo sella getPetSnapshot. Ver spec 2026-09-02-mascota-misiones-logros.';

-- Suma de XP de misiones completadas por usuario (getPetCounts).
create index pet_daily_missions_user_completed_idx
  on public.pet_daily_missions (user_id, completed_at);

alter table public.pet_daily_missions enable row level security;

create policy "pet_daily_missions select own" on public.pet_daily_missions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "pet_daily_missions insert own" on public.pet_daily_missions
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "pet_daily_missions update own" on public.pet_daily_missions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Sin DELETE: las misiones caducan solas (solo se evalúan hoy y ayer).

-- Grant POR COLUMNA (issue #375): una columna nueva sin su grant rompe la
-- escritura entera de la tabla. Al añadir una columna, añádela aquí y pasa la
-- superficie 6 de docs/DRIFT-CHECK.md.
revoke all on public.pet_daily_missions from anon, authenticated;
grant select on public.pet_daily_missions to authenticated;
grant insert (user_id, day, slot, template, target, xp, item_type, item_id, item_title)
  on public.pet_daily_missions to authenticated;
grant update (completed_at) on public.pet_daily_missions to authenticated;
