-- Fase «Post»: tabla `post_preferences` — ajustes de auto-publicación por
-- usuario (opt-out). Semántica clave: SIN FILA = defaults (finished ON, started
-- y dropped OFF). El lector (`maybeAutopostMilestone`, Task 9) trata la ausencia
-- de fila como {finished:true, started:false, dropped:false}, así que la mayoría
-- de usuarios nunca tendrá fila. Es una tabla self-only: sin targets de
-- interacción, sin visibilidad por follow, sin moderación. Cada quien ve y
-- edita SOLO su propia fila.

create table public.post_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  autopost_started boolean not null default false,
  autopost_finished boolean not null default true,
  autopost_dropped boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.post_preferences enable row level security;
create policy "post_prefs select own" on public.post_preferences for select
  using ((select auth.uid()) = user_id);
create policy "post_prefs upsert own" on public.post_preferences for insert
  with check ((select auth.uid()) = user_id);
create policy "post_prefs update own" on public.post_preferences for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger post_preferences_set_updated_at before update on public.post_preferences
  for each row execute function public.set_updated_at();

-- Grants por columna (#375, DRIFT-CHECK superficie 6): `updated_at` la pone el
-- trigger -> fuera de INSERT y UPDATE; `user_id` es la PK inmutable -> fuera de
-- UPDATE (se re-crea la fila, no se remapea). Solo se revoca de `authenticated`;
-- `anon` no recibe grant alguno: una preferencia privada nunca es pública.
revoke all on table public.post_preferences from authenticated;
grant select (user_id, autopost_started, autopost_finished, autopost_dropped, updated_at)
  on public.post_preferences to authenticated;
grant insert (user_id, autopost_started, autopost_finished, autopost_dropped)
  on public.post_preferences to authenticated;
grant update (autopost_started, autopost_finished, autopost_dropped)
  on public.post_preferences to authenticated;
