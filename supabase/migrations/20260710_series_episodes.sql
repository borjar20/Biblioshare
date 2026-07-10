-- Información y puntuación por episodio de series (§7.x).
--
-- Hasta ahora una serie era indivisible: library_entries guardaba una nota y
-- una posición {season, episode} global, y las reseñas (diary_entries) eran a
-- nivel de serie. Se añade una capa por episodio SIN tocar la nota global:
--
--  * series_episodes  → catálogo de episodios (título/sinopsis/fecha/imagen),
--    rellenado con cache-as-you-go desde TMDB igual que credits (§7.34).
--  * episode_watches  → "visto" por usuario + nota/reseña opcional. La rejilla
--    de la comunidad (temporada × episodio) y las reseñas por episodio salen de
--    agregar estas filas; la existencia de una fila = episodio visto.
--
-- La nota global de serie (library_entries.rating) y todo lo que la consume
-- (comunidad, stats anuales, retos) se mantienen intactos: ambas capas conviven.

-- ── Catálogo de episodios ───────────────────────────────────────────────────
create table public.series_episodes (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  season_number integer not null,
  episode_number integer not null,
  title text,
  synopsis text,
  still_url text,
  air_date date,
  runtime_minutes integer,
  created_at timestamptz not null default now(),
  unique (series_id, season_number, episode_number)
);

create index idx_series_episodes_lookup
  on public.series_episodes (series_id, season_number, episode_number);

comment on table public.series_episodes is 'Catálogo de episodios por serie (§7.x). Se rellena con cache-as-you-go desde TMDB (/tv/{id}/season/{n}) al abrir la ficha; ver src/lib/library/ensure-series-episodes.ts.';

-- Mismo modelo de acceso que el resto del catálogo (series/books/movies): lo
-- lee cualquiera (perfiles públicos anónimos), lo inserta/actualiza cualquier
-- autenticado (enriquecimiento perezoso).
alter table public.series_episodes enable row level security;

create policy "series_episodes readable by all" on public.series_episodes
  for select to anon, authenticated using (true);
create policy "series_episodes insertable" on public.series_episodes
  for insert to authenticated with check (true);
create policy "series_episodes updatable" on public.series_episodes
  for update to authenticated using (true) with check (true);

-- ── Visto + nota/reseña por episodio ────────────────────────────────────────
create table public.episode_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null references public.series(id) on delete cascade,
  season_number integer not null,
  episode_number integer not null,
  -- Nullable: se puede marcar visto sin puntuar. Escala 1–10 como el resto.
  rating integer check (rating between 1 and 10),
  review text,
  watched_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, series_id, season_number, episode_number)
);

create index idx_episode_watches_aggregate
  on public.episode_watches (series_id, season_number, episode_number);

comment on table public.episode_watches is 'Visionado por usuario de un episodio (§7.x). La existencia de la fila = episodio visto; rating/review son opcionales. Alimenta la rejilla de la comunidad y las reseñas por episodio.';

-- Mismo modelo que diary_entries: contenido de perfil público. Lo ve el dueño
-- siempre, y cualquiera si el perfil es público; solo el dueño escribe.
alter table public.episode_watches enable row level security;

create policy "episode_watches select public or own" on public.episode_watches
  for select to anon, authenticated
  using (
    ((select auth.uid()) = user_id)
    or exists (
      select 1 from public.profiles p
      where p.user_id = episode_watches.user_id and p.is_public = true
    )
  );
create policy "episode_watches insert own" on public.episode_watches
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "episode_watches update own" on public.episode_watches
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "episode_watches delete own" on public.episode_watches
  for delete to authenticated using ((select auth.uid()) = user_id);
