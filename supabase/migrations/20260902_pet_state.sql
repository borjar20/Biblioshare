-- Mascota RPG (spec 2026-09-02-mascota-rpg-design.md, §8).
--
-- Solo DECISIONES del usuario: nombre, clase, ocultar la compañera y el último
-- nivel/etapa que la app calculó (para detectar subidas). XP, atributos, nivel y
-- etapa NO se guardan: se derivan de progress_sessions, passes, notes, club_*…
-- en src/lib/pet/derive.ts. Una fila por usuario (PK = user_id).

create table public.pet_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  -- text, no enum: añadir una clase no exige migración de tipo. Los valores
  -- válidos los fija src/lib/pet/classes.ts.
  class text not null,
  hatched_at timestamptz not null default now(),
  companion_hidden boolean not null default false,
  last_level integer not null default 1,
  last_stage text not null default 'acorn',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pet_state is
  'Mascota RPG: decisiones del usuario (nombre, clase, ocultar) y último nivel/etapa visto. XP y atributos se derivan en la app (src/lib/pet). Ver spec 2026-09-02.';

alter table public.pet_state enable row level security;

create policy "pet_state select own" on public.pet_state
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "pet_state insert own" on public.pet_state
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "pet_state update own" on public.pet_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Sin DELETE: la mascota se va con la cuenta (cascade), no se borra a mano.

-- Grant POR COLUMNA (issue #375): una columna nueva sin su grant rompe la
-- escritura entera de la tabla. Al añadir una columna, añádela aquí y pasa la
-- superficie 6 de docs/DRIFT-CHECK.md.
revoke all on public.pet_state from anon, authenticated;
grant select on public.pet_state to authenticated;
grant insert (user_id, name, class, hatched_at, companion_hidden, last_level, last_stage)
  on public.pet_state to authenticated;
grant update (name, class, companion_hidden, last_level, last_stage, updated_at)
  on public.pet_state to authenticated;
