-- ============================================================================
-- Biblioshare — esquema consolidado (replay de las migraciones de producción)
-- Generado desde supabase_migrations.schema_migrations el 2026-07-10.
-- Uso: aplicar EN ORDEN en un proyecto Supabase limpio (SQL editor o psql)
-- para replicar el esquema de producción (p. ej. el proyecto dev).
-- No incluye datos. Tras aplicarlo, crear el usuario de prueba vía signup.
-- NOTA (2026-07-14): faltaban aquí 15 migraciones ya aplicadas en prod (todo lo
-- posterior a tierlist Y el bloque del 10-jul: colas/retos/import/avatars). Se
-- anexan al final EN EL ORDEN DE APLICACIÓN REAL de prod — que no coincide con
-- el orden de los ficheros de supabase/migrations (tierlist se aplicó ANTES que
-- propose_with_setup; ver 20260715_consolidate_activity_items_policies.sql).
-- NOTA (2026-07-17): se había vuelto a desincronizar — le faltaban 14
-- migraciones ya en prod (book_hydration, book_editions_no_blank_primary, los
-- 8 del pase-hub #42 que RENOMBRAN diary_entries -> passes, y las 3 del plan 05
-- estadísticas: started_at, notes, fuse_annual_goals_into_challenges). Anexadas
-- al final bajo "ANEXO 2026-07-17" en el orden de aplicación REAL de prod. Tras
-- este anexo el esquema replica prod al 17-jul. (El fichero
-- 20260716_list_challenge_completion_mode.sql existe en migrations pero NO está
-- en prod: se deja fuera a propósito.)
-- NOTA (2026-07-22): anexadas las 2 migraciones de eventos de club en la misma
-- pasada en que se aplicaron a prod, que es la única forma de que este fichero
-- no vuelva a quedarse atrás. Ver "ANEXO 2026-07-22" al final.
-- Este fichero se mantiene a mano y ya se desincronizó DOS veces; ante la duda,
-- regenerarlo con `pg_dump --schema-only` de prod.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 20260707131316 init_schema
-- ──────────────────────────────────────────────────────────────────────────

-- Media status shared across all trackable item types
create type media_status as enum ('planned', 'in_progress', 'completed', 'dropped');

-- ==================== CATALOG TABLES ====================
-- Shared catalog of items (metadata only, not user-specific)

create table books (
  id uuid primary key default gen_random_uuid(),
  google_books_id text unique,
  title text not null,
  author text,
  cover_url text,
  isbn text,
  total_pages int,
  synopsis text,
  published_year int,
  genres text[] default '{}',
  created_at timestamptz not null default now()
);

create table movies (
  id uuid primary key default gen_random_uuid(),
  tmdb_id int unique,
  title text not null,
  director text,
  cover_url text,
  duration_minutes int,
  synopsis text,
  release_year int,
  genres text[] default '{}',
  created_at timestamptz not null default now()
);

create table series (
  id uuid primary key default gen_random_uuid(),
  tmdb_id int unique,
  title text not null,
  creator text,
  cover_url text,
  total_seasons int,
  total_episodes int,
  synopsis text,
  release_year int,
  genres text[] default '{}',
  created_at timestamptz not null default now()
);

-- ==================== PROGRESS TABLES ====================
-- Per-user tracking of catalog items

create table book_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  status media_status not null default 'planned',
  rating smallint check (rating between 1 and 10),
  current_page int not null default 0,
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);

create table movie_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id uuid not null references movies(id) on delete cascade,
  status media_status not null default 'planned',
  rating smallint check (rating between 1 and 10),
  watched_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, movie_id)
);

create table series_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null references series(id) on delete cascade,
  status media_status not null default 'planned',
  rating smallint check (rating between 1 and 10),
  current_season int not null default 0,
  current_episode int not null default 0,
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, series_id)
);

-- ==================== INDEXES ====================

create index idx_book_progress_user on book_progress(user_id);
create index idx_movie_progress_user on movie_progress(user_id);
create index idx_series_progress_user on series_progress(user_id);

-- ==================== ROW LEVEL SECURITY ====================

alter table books enable row level security;
alter table movies enable row level security;
alter table series enable row level security;
alter table book_progress enable row level security;
alter table movie_progress enable row level security;
alter table series_progress enable row level security;

-- Catalog tables: readable by any authenticated user, insertable by any authenticated user
create policy "catalog books readable" on books for select to authenticated using (true);
create policy "catalog books insertable" on books for insert to authenticated with check (true);

create policy "catalog movies readable" on movies for select to authenticated using (true);
create policy "catalog movies insertable" on movies for insert to authenticated with check (true);

create policy "catalog series readable" on series for select to authenticated using (true);
create policy "catalog series insertable" on series for insert to authenticated with check (true);

-- Progress tables: users can only see/modify their own rows
create policy "own book progress select" on book_progress for select to authenticated using (auth.uid() = user_id);
create policy "own book progress insert" on book_progress for insert to authenticated with check (auth.uid() = user_id);
create policy "own book progress update" on book_progress for update to authenticated using (auth.uid() = user_id);
create policy "own book progress delete" on book_progress for delete to authenticated using (auth.uid() = user_id);

create policy "own movie progress select" on movie_progress for select to authenticated using (auth.uid() = user_id);
create policy "own movie progress insert" on movie_progress for insert to authenticated with check (auth.uid() = user_id);
create policy "own movie progress update" on movie_progress for update to authenticated using (auth.uid() = user_id);
create policy "own movie progress delete" on movie_progress for delete to authenticated using (auth.uid() = user_id);

create policy "own series progress select" on series_progress for select to authenticated using (auth.uid() = user_id);
create policy "own series progress insert" on series_progress for insert to authenticated with check (auth.uid() = user_id);
create policy "own series progress update" on series_progress for update to authenticated using (auth.uid() = user_id);
create policy "own series progress delete" on series_progress for delete to authenticated using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 20260707133223 unified_library_and_profiles
-- ──────────────────────────────────────────────────────────────────────────

-- ==================== CLEANUP ====================
-- Drop the per-type progress tables in favor of a unified library_entries table.
drop table if exists book_progress cascade;
drop table if exists movie_progress cascade;
drop table if exists series_progress cascade;

-- ==================== ENUMS ====================
create type item_type as enum ('book', 'movie', 'series');

-- ==================== PROFILES ====================
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  avatar_url text,
  bio text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,30}$')
);

create index idx_profiles_username on profiles(lower(username));

-- ==================== LIBRARY ENTRIES (unified progress) ====================
-- One row per (user, catalog item). Polymorphic reference to the catalog
-- via (item_type, item_id). Type-specific progress detail lives in `position`
-- (e.g. {"page": 42} for books, {"season": 2, "episode": 5} for series).
create table library_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type item_type not null,
  item_id uuid not null,
  status media_status not null default 'planned',
  rating smallint check (rating between 1 and 10),
  position jsonb not null default '{}'::jsonb,
  started_at date,
  finished_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);

create index idx_library_entries_user on library_entries(user_id);
create index idx_library_entries_item on library_entries(item_type, item_id);
create index idx_library_entries_status on library_entries(user_id, status);

-- ==================== updated_at TRIGGER ====================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger library_entries_set_updated_at
  before update on library_entries
  for each row execute function set_updated_at();

-- ==================== ROW LEVEL SECURITY ====================
alter table profiles enable row level security;
alter table library_entries enable row level security;

-- Catalog tables were previously readable only by `authenticated`.
-- Broaden to anon so logged-out visitors can render public profiles.
drop policy if exists "catalog books readable" on books;
drop policy if exists "catalog movies readable" on movies;
drop policy if exists "catalog series readable" on series;

create policy "books readable by all" on books for select to anon, authenticated using (true);
create policy "movies readable by all" on movies for select to anon, authenticated using (true);
create policy "series readable by all" on series for select to anon, authenticated using (true);

-- Catalog inserts remain restricted to authenticated users (metadata is public,
-- but only logged-in users add items when tracking something).
-- (Existing "catalog * insertable" policies are kept as-is.)

-- Profiles: public profiles readable by anyone; a user always sees their own.
create policy "profiles public or own readable" on profiles
  for select to anon, authenticated
  using (is_public = true or (select auth.uid()) = user_id);

create policy "profiles insert own" on profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "profiles update own" on profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Library entries: owner sees all their own; anyone sees entries that belong
-- to a public profile. Writes are owner-only.
create policy "library entries select public or own" on library_entries
  for select to anon, authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from profiles p
      where p.user_id = library_entries.user_id
        and p.is_public = true
    )
  );

create policy "library entries insert own" on library_entries
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "library entries update own" on library_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "library entries delete own" on library_entries
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 20260707133254 harden_set_updated_at_search_path
-- ──────────────────────────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 20260707134148 add_diary_entries
-- ──────────────────────────────────────────────────────────────────────────

-- The unified library_entries row is the *current state* of an item on your
-- shelf. Individual reading/watching passes (incl. re-reads / re-watches) are
-- logged as diary_entries, so an item can have many dated passes over time.

-- finished_at now lives per-pass in diary_entries; started_at stays on the
-- library entry to represent the current in-progress pass.
alter table library_entries drop column finished_at;

create table diary_entries (
  id uuid primary key default gen_random_uuid(),
  library_entry_id uuid not null references library_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_on date,
  finished_on date not null default current_date,
  rating smallint check (rating between 1 and 10),
  review text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_diary_entries_library_entry on diary_entries(library_entry_id);
create index idx_diary_entries_user on diary_entries(user_id);
create index idx_diary_entries_finished on diary_entries(user_id, finished_on desc);

create trigger diary_entries_set_updated_at
  before update on diary_entries
  for each row execute function set_updated_at();

alter table diary_entries enable row level security;

-- Same visibility model as library_entries: owner sees all their own; anyone
-- can read passes that belong to a public profile. Writes are owner-only.
create policy "diary entries select public or own" on diary_entries
  for select to anon, authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from profiles p
      where p.user_id = diary_entries.user_id
        and p.is_public = true
    )
  );

create policy "diary entries insert own" on diary_entries
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "diary entries update own" on diary_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "diary entries delete own" on diary_entries
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 20260707222213 add_publisher_to_books
-- ──────────────────────────────────────────────────────────────────────────

alter table public.books add column publisher text;

-- ──────────────────────────────────────────────────────────────────────────
-- 20260708213757 add_pinned_order_to_library_entries
-- ──────────────────────────────────────────────────────────────────────────

alter table public.library_entries
  add column pinned_order integer;

comment on column public.library_entries.pinned_order is 'NULL = not pinned. Small positive integer = display order among this user''s pinned items (max 6, enforced by application code, not a DB constraint).';

-- ──────────────────────────────────────────────────────────────────────────
-- 20260708220637 create_progress_sessions
-- ──────────────────────────────────────────────────────────────────────────

create table public.progress_sessions (
  id uuid primary key default gen_random_uuid(),
  library_entry_id uuid not null references public.library_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null default (now()::date),
  duration_minutes integer,
  position jsonb not null default '{}',
  note text,
  created_at timestamptz not null default now()
);

create index progress_sessions_library_entry_id_idx on public.progress_sessions (library_entry_id);

comment on table public.progress_sessions is 'Daily reading/watching sessions (§7.14). One row per logged session; position is the point REACHED ({page} for books, {season,episode} for series). Separate from diary_entries, which records complete passes (rating+review).';

alter table public.progress_sessions enable row level security;

create policy "progress sessions select public or own"
  on public.progress_sessions
  for select
  to anon, authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1
      from public.profiles p
      where p.user_id = progress_sessions.user_id
        and p.is_public = true
    )
  );

create policy "progress sessions insert own"
  on public.progress_sessions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "progress sessions update own"
  on public.progress_sessions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "progress sessions delete own"
  on public.progress_sessions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 20260708224117 add_profile_goal_columns
-- ──────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column daily_goal_minutes integer,
  add column annual_goal_items integer;

comment on column public.profiles.daily_goal_minutes is 'Optional per-user daily goal in minutes of session time (§7.14 stats). NULL = no goal set.';
comment on column public.profiles.annual_goal_items is 'Optional per-user annual goal in completed items (§7.14 stats). NULL = no goal set.';

-- ──────────────────────────────────────────────────────────────────────────
-- 20260709062254 add_people_credits_sagas
-- ──────────────────────────────────────────────────────────────────────────

-- Personas (autores/reparto/equipo) y sagas. Entidades de catálogo compartido,
-- mismo modelo de RLS que books/movies/series (SELECT abierto; INSERT/UPDATE
-- autenticado) y referencia polimórfica item_type+item_id como library_entries.

-- ── people ──────────────────────────────────────────────────────────────────
create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tmdb_id integer,
  openlibrary_key text,
  photo_url text,
  bio text,
  birth_date text,
  death_date text,
  place_of_birth text,
  known_for text,
  created_at timestamptz not null default now()
);
create unique index people_tmdb_id_key on public.people (tmdb_id) where tmdb_id is not null;
create unique index people_openlibrary_key_key on public.people (openlibrary_key) where openlibrary_key is not null;

alter table public.people enable row level security;
create policy "people readable by all" on public.people for select to anon, authenticated using (true);
create policy "people insertable" on public.people for insert to authenticated with check (true);
create policy "people updatable" on public.people for update to authenticated using (true) with check (true);

-- ── credits (persona ↔ ítem) ────────────────────────────────────────────────
create table public.credits (
  id uuid primary key default gen_random_uuid(),
  item_type public.item_type not null,
  item_id uuid not null,
  person_id uuid not null references public.people (id) on delete cascade,
  role text not null,
  character text,
  billing_order integer,
  created_at timestamptz not null default now(),
  unique (item_type, item_id, person_id, role)
);
create index credits_item_idx on public.credits (item_type, item_id);
create index credits_person_idx on public.credits (person_id);

alter table public.credits enable row level security;
create policy "credits readable by all" on public.credits for select to anon, authenticated using (true);
create policy "credits insertable" on public.credits for insert to authenticated with check (true);

-- ── sagas ───────────────────────────────────────────────────────────────────
create table public.sagas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  overview text,
  cover_url text,
  tmdb_collection_id integer,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
create unique index sagas_tmdb_collection_id_key on public.sagas (tmdb_collection_id) where tmdb_collection_id is not null;

alter table public.sagas enable row level security;
create policy "sagas readable by all" on public.sagas for select to anon, authenticated using (true);
create policy "sagas insertable" on public.sagas for insert to authenticated with check (true);
create policy "sagas updatable" on public.sagas for update to authenticated using (true) with check (true);

-- ── saga_items (miembros ordenados) ─────────────────────────────────────────
create table public.saga_items (
  id uuid primary key default gen_random_uuid(),
  saga_id uuid not null references public.sagas (id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  position integer,
  created_at timestamptz not null default now(),
  unique (saga_id, item_type, item_id)
);
create index saga_items_item_idx on public.saga_items (item_type, item_id);
create index saga_items_saga_idx on public.saga_items (saga_id);

alter table public.saga_items enable row level security;
create policy "saga items readable by all" on public.saga_items for select to anon, authenticated using (true);
create policy "saga items insertable" on public.saga_items for insert to authenticated with check (true);
create policy "saga items deletable" on public.saga_items for delete to authenticated using (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 20260709075255 add_rbac_roles
-- ──────────────────────────────────────────────────────────────────────────

-- RBAC: roles user < collaborator < admin. El rol vive en profiles.role; las
-- funciones helper (SECURITY DEFINER) se usan en RLS sin recursión, y un trigger
-- impide que nadie eleve su propio rol salvo un admin. Ver docs/REQUIREMENTS.md.

-- Orden de declaración = orden del enum, habilita comparaciones >=.
create type public.user_role as enum ('user', 'collaborator', 'admin');

alter table public.profiles
  add column role public.user_role not null default 'user';

-- Rol del usuario actual, leyendo profiles con privilegios de owner para evitar
-- recursión de RLS (esta función se usa DENTRO de las políticas de profiles).
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid();
$$;

-- true si el rol actual es >= min en la jerarquía (NULL/anónimo => false).
create or replace function public.has_min_role(min public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() >= min, false);
$$;

-- Anti-escalada: el rol solo lo cambia un admin. Cubre cualquier vía de UPDATE
-- (incl. la política "update own profile"), que si no permitiría auto-promoverse.
create or replace function public.enforce_role_change_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.has_min_role('admin') then
    raise exception 'Only an admin can change a user role';
  end if;
  return new;
end;
$$;

create trigger enforce_role_change_admin_only
  before update on public.profiles
  for each row execute function public.enforce_role_change_admin_only();

-- Los admins pueden leer todos los perfiles (incl. privados) y actualizar el rol
-- de cualquiera. Se conservan las políticas existentes (public/own).
create policy "admins select all profiles" on public.profiles
  for select to authenticated using (public.has_min_role('admin'));

create policy "admins update any profile" on public.profiles
  for update to authenticated
  using (public.has_min_role('admin'))
  with check (public.has_min_role('admin'));

-- ──────────────────────────────────────────────────────────────────────────
-- 20260709075958 rbac_bootstrap_trigger_guard
-- ──────────────────────────────────────────────────────────────────────────

-- Permitir cambiar el rol desde contextos SIN usuario autenticado (service_role
-- o SQL directo del owner, que de todas formas ya bypassan RLS) — necesario para
-- bootstrapear el primer admin. Los usuarios finales (auth.uid() no nulo) siguen
-- sin poder auto-promoverse salvo que sean admin.
create or replace function public.enforce_role_change_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.has_min_role('admin') then
    raise exception 'Only an admin can change a user role';
  end if;
  return new;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 20260709221519 add_library_entries_queue_order
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE library_entries ADD COLUMN queue_order integer;
COMMENT ON COLUMN library_entries.queue_order IS 'NULL = not in priority queue. Small positive integer = display order among this user''s planned/queued items. Density/uniqueness maintained at the application level (full renumber on write), not a DB constraint.';
CREATE INDEX idx_library_entries_queue_order
  ON library_entries (user_id, queue_order)
  WHERE status = 'planned';

-- ──────────────────────────────────────────────────────────────────────────
-- 20260709223517 add_catalog_movies_series_update_policies
-- (políticas luego eliminadas por fix_catalog_rls_policies; se mantienen
--  aquí por fidelidad del replay)
-- ──────────────────────────────────────────────────────────────────────────

CREATE POLICY "catalog movies updatable" ON movies
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "catalog series updatable" ON series
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 20260709230750 fix_catalog_rls_policies
-- ──────────────────────────────────────────────────────────────────────────

-- 1. movies/series: quitar el UPDATE abierto al rol public (vandalismo anónimo).
--    El único UPDATE legítimo de la app es el backfill de tamaños
--    (src/lib/queue/backfill-queue-sizes.ts), acotado por grants de columna.
drop policy "catalog movies updatable" on public.movies;
drop policy "catalog series updatable" on public.series;

revoke update on public.movies from anon, authenticated;
revoke update on public.series from anon, authenticated;
grant update (duration_minutes) on public.movies to authenticated;
grant update (total_episodes, total_seasons) on public.series to authenticated;

create policy "movies size backfill updatable" on public.movies
  for update to authenticated using (true) with check (true);
create policy "series size backfill updatable" on public.series
  for update to authenticated using (true) with check (true);

-- 2. people: el único UPDATE de la app es el enriquecimiento de bio/foto/fechas
--    (src/lib/people/get-person.ts); name y el resto quedan protegidos.
drop policy "people updatable" on public.people;

revoke update on public.people from anon, authenticated;
grant update (bio, photo_url, birth_date, death_date, place_of_birth)
  on public.people to authenticated;

create policy "people bio enrichable" on public.people
  for update to authenticated using (true) with check (true);

-- 3. sagas: editar una saga es curación manual → collaborator+ (§7.35).
drop policy "sagas updatable" on public.sagas;
create policy "sagas updatable by collaborators" on public.sagas
  for update to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));

-- 4. saga_items: quitar de una saga es curación manual → collaborator+.
--    El INSERT sigue abierto a authenticated: lo necesita el cache-as-you-go
--    (src/lib/sagas/persist-collection.ts).
drop policy "saga items deletable" on public.saga_items;
create policy "saga items deletable by collaborators" on public.saga_items
  for delete to authenticated
  using (public.has_min_role('collaborator'));

-- ──────────────────────────────────────────────────────────────────────────
-- 20260709230804 owner_integrity_composite_fks
-- ──────────────────────────────────────────────────────────────────────────

-- Garantiza a nivel de BD que diary_entries y progress_sessions solo pueden
-- referenciar entradas de biblioteca de SU MISMO usuario: el par
-- (library_entry_id, user_id) debe existir en library_entries (id, user_id).
-- Cierra el vector de colgar diario/sesiones de la biblioteca de otro usuario
-- vía REST directo o server actions sin check de propiedad.

alter table public.library_entries
  add constraint library_entries_id_user_key unique (id, user_id);

alter table public.diary_entries
  drop constraint diary_entries_library_entry_id_fkey;
alter table public.diary_entries
  add constraint diary_entries_entry_owner_fkey
  foreign key (library_entry_id, user_id)
  references public.library_entries (id, user_id) on delete cascade;

alter table public.progress_sessions
  drop constraint progress_sessions_library_entry_id_fkey;
alter table public.progress_sessions
  add constraint progress_sessions_entry_owner_fkey
  foreign key (library_entry_id, user_id)
  references public.library_entries (id, user_id) on delete cascade;

-- ──────────────────────────────────────────────────────────────────────────
-- 20260709230819 saga_single_membership_and_hardening
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Invariante "un ítem pertenece a una sola saga" (asumida por getItemSaga
--    con maybeSingle y por el delete+insert de assignItemToSaga). El nuevo
--    UNIQUE subsume al anterior (saga_id, item_type, item_id) y al índice
--    saga_items_item_idx.
alter table public.saga_items
  add constraint saga_items_item_key unique (item_type, item_id);
alter table public.saga_items
  drop constraint saga_items_saga_id_item_type_item_id_key;
drop index public.saga_items_item_idx;

-- 2. Funciones SECURITY DEFINER: no deben ser RPCs públicas para anon.
--    has_min_role/current_user_role siguen ejecutables por authenticated
--    (las usan las políticas RLS de profiles/sagas/saga_items).
revoke execute on function public.current_user_role() from anon;
revoke execute on function public.has_min_role(public.user_role) from anon;
revoke execute on function public.enforce_role_change_admin_only() from anon, authenticated;

-- 3. Índice para el FK sin cubrir de progress_sessions y las queries de stats
--    (filtran por user_id + rango de session_date).
create index progress_sessions_user_date_idx
  on public.progress_sessions (user_id, session_date desc);

-- 4. Índices nunca usados (advisor 0005): lookups de username usan eq sobre
--    la columna (cubierto por profiles_username_key); idx_diary_entries_user
--    es prefijo redundante de idx_diary_entries_finished (user_id, finished_on).
drop index public.idx_profiles_username;
drop index public.idx_diary_entries_user;

-- ──────────────────────────────────────────────────────────────────────────
-- 20260709230944 revoke_public_execute_on_definer_fns
-- ──────────────────────────────────────────────────────────────────────────

-- El EXECUTE de anon venía del grant implícito a PUBLIC (creado por defecto
-- con la función), no de un grant directo — revocar de PUBLIC. authenticated
-- y service_role conservan sus grants explícitos donde hacen falta (políticas
-- RLS de profiles/sagas/saga_items usan has_min_role/current_user_role).
revoke execute on function public.current_user_role() from public;
revoke execute on function public.has_min_role(public.user_role) from public;
revoke execute on function public.enforce_role_change_admin_only() from public;

-- ──────────────────────────────────────────────────────────────────────────
-- 20260710 series_episodes (Información y puntuación por episodio de series)
-- ──────────────────────────────────────────────────────────────────────────

-- Catálogo de episodios (cache-as-you-go desde TMDB). Mismo modelo de acceso
-- que el resto del catálogo: lectura pública, escritura de cualquier
-- autenticado (enriquecimiento perezoso).
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

alter table public.series_episodes enable row level security;

create policy "series_episodes readable by all" on public.series_episodes
  for select to anon, authenticated using (true);
create policy "series_episodes insertable" on public.series_episodes
  for insert to authenticated with check (true);
create policy "series_episodes updatable" on public.series_episodes
  for update to authenticated using (true) with check (true);

-- Visto por usuario + nota/reseña opcional. Contenido de perfil público, mismo
-- modelo que diary_entries.
create table public.episode_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null references public.series(id) on delete cascade,
  season_number integer not null,
  episode_number integer not null,
  rating integer check (rating between 1 and 10),
  review text,
  watched_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, series_id, season_number, episode_number)
);

create index idx_episode_watches_aggregate
  on public.episode_watches (series_id, season_number, episode_number);

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


-- ============================================================
-- 20260711_social_follows.sql (EPIC-05 Bloque A)
-- ============================================================
-- EPIC-05 (social), Bloque A — grafo de seguidores + visibilidad por seguidor.
--
-- Introduce el grafo social (follows) y generaliza la visibilidad de contenido
-- de perfil de "público u propio" a "público u propio O seguidor aceptado"
-- mediante el helper SECURITY DEFINER can_view_profile() (SD-2 del backlog
-- docs/requirements/social-epic.md). Mismo patrón anti-recursión que el RBAC
-- (has_min_role / current_user_role, §7.35).

-- ── Helper: visibilidad de un perfil sin recursión de RLS ────────────────────
-- profiles.is_public de un perfil AJENO Y PRIVADO no es legible por la RLS de
-- profiles ("public or own"). Las políticas de follows necesitan conocer ese
-- flag (para decidir accepted vs pending y blindar el hueco de privacidad), así
-- que se expone vía SECURITY DEFINER, que bypassa la RLS. Perfil inexistente ->
-- false (tratado como no-público).
create or replace function public.profile_is_public(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select is_public from public.profiles where user_id = target_user_id),
    false
  );
$$;

comment on function public.profile_is_public(uuid) is 'True si el perfil de target_user_id existe y es público. SECURITY DEFINER para poder leer el flag de perfiles privados ajenos desde las políticas RLS de follows (EPIC-05, SD-2).';

-- ── Grafo de seguidores ──────────────────────────────────────────────────────
create type public.follow_status as enum ('pending', 'accepted');

create table public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  status public.follow_status not null default 'accepted',
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- Para "¿quién me sigue?" y contar seguidores por usuario.
create index idx_follows_followee on public.follows (followee_id, status);

comment on table public.follows is 'Grafo social de EPIC-05 (SD-2). Seguir a un perfil público = accepted directo; a uno privado = pending hasta que el followee acepta. La visibilidad de contenido para seguidores aceptados la resuelve can_view_profile().';

alter table public.follows enable row level security;

-- SELECT: las dos partes ven la relación (incl. solicitudes pending). Además,
-- las relaciones ACEPTADAS de un perfil PÚBLICO son legibles por cualquiera
-- (listas de seguidores/seguidos públicas, estilo Letterboxd); las de perfiles
-- privados quedan solo entre las dos partes.
create policy "follows visible to parties or public accepted" on public.follows
  for select to anon, authenticated
  using (
    (select auth.uid()) = follower_id
    or (select auth.uid()) = followee_id
    or (status = 'accepted' and public.profile_is_public(followee_id))
  );

-- INSERT: solo puedes crear follows tuyos, y el status DEBE respetar la regla de
-- auto-accept — accepted solo si el followee es público; pending si es privado.
-- Esto blinda el hueco de privacidad: nadie puede auto-insertarse como seguidor
-- ACEPTADO de un perfil privado (lo que le daría visibilidad vía can_view_profile).
create policy "follows insert own with accept rule" on public.follows
  for insert to authenticated
  with check (
    (select auth.uid()) = follower_id
    and (
      (status = 'accepted' and public.profile_is_public(followee_id))
      or (status = 'pending' and not public.profile_is_public(followee_id))
    )
  );

-- UPDATE: solo el followee cambia el status (aceptar una solicitud pending).
create policy "follows update by followee" on public.follows
  for update to authenticated
  using ((select auth.uid()) = followee_id)
  with check ((select auth.uid()) = followee_id);

-- DELETE: el follower deja de seguir / retira la solicitud; el followee puede
-- rechazar una solicitud o quitar a un seguidor.
create policy "follows delete by parties" on public.follows
  for delete to authenticated
  using (
    (select auth.uid()) = follower_id
    or (select auth.uid()) = followee_id
  );

-- ── Visibilidad de contenido de perfil por seguidor (SD-2) ──────────────────
-- Generaliza "público u propio" a "público u propio O seguidor aceptado".
-- SECURITY DEFINER para bypass de RLS sin recursión, igual que has_min_role.
-- (Cuando llegue E5.J1 se añadirá aquí el corte por user_blocks.)
create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  -- coalesce del primer término: para anon (auth.uid() null) "null = uuid" es
  -- NULL; sin coalesce la función devolvería NULL en vez de false (en USING se
  -- trata como false igualmente, pero devolver un booleano limpio es más seguro).
  select
    coalesce((select auth.uid()) = target_user_id, false)
    or public.profile_is_public(target_user_id)
    or exists (
      select 1 from public.follows f
      where f.follower_id = (select auth.uid())
        and f.followee_id = target_user_id
        and f.status = 'accepted'
    );
$$;

comment on function public.can_view_profile(uuid) is 'True si el usuario actual puede ver el contenido de perfil de target_user_id: es el dueño, el perfil es público, o es seguidor aceptado (SD-2, EPIC-05).';

-- Recablear las 4 políticas SELECT de contenido de perfil para usar el helper.
drop policy "library entries select public or own" on public.library_entries;
create policy "library entries select visible" on public.library_entries
  for select to anon, authenticated
  using (public.can_view_profile(user_id));

drop policy "diary entries select public or own" on public.diary_entries;
create policy "diary entries select visible" on public.diary_entries
  for select to anon, authenticated
  using (public.can_view_profile(user_id));

drop policy "progress sessions select public or own" on public.progress_sessions;
create policy "progress sessions select visible" on public.progress_sessions
  for select to anon, authenticated
  using (public.can_view_profile(user_id));

drop policy "episode_watches select public or own" on public.episode_watches;
create policy "episode_watches select visible" on public.episode_watches
  for select to anon, authenticated
  using (public.can_view_profile(user_id));


-- ============================================================
-- 20260711_profile_identities.sql (EPIC-05 Bloque A)
-- ============================================================
-- EPIC-05 Bloque A — vista de identidad de perfil para el stub de "cuenta
-- privada" (modelo Instagram, decisión Q1 del backlog social-epic.md): permite
-- descubrir y solicitar seguir a un perfil privado mostrando SOLO su identidad
-- (nunca objetivos de lectura ni rol), con el contenido oculto.
--
-- Dos cambios:
--  1) Vista `profile_identities`: expone un subconjunto de IDENTIDAD de CUALQUIER
--     perfil (incl. privados). Al no marcarse security_invoker, corre con los
--     permisos del owner de la vista y bypassa la RLS de profiles a propósito —
--     por eso incluye SOLO columnas de identidad (nunca objetivos ni rol).
--  2) La política SELECT de la FILA COMPLETA de `profiles` pasa de "público u
--     propio" a `can_view_profile` (público | propio | seguidor aceptado), para
--     que un seguidor aceptado de un perfil privado lea su perfil. Los NO
--     seguidores de un perfil privado siguen sin ver la fila completa (objetivos
--     y rol) — solo su identidad vía la vista.
--
-- Nota advisors: el linter marcará esto como "security definer view"; es
-- intencional y aceptado (el objetivo es exponer identidad de perfiles privados
-- para el stub de solicitar-seguir).

create view public.profile_identities as
  select user_id, username, display_name, avatar_url, bio, is_public, created_at
  from public.profiles;

comment on view public.profile_identities is 'Identidad pública de CUALQUIER perfil (incl. privados) para el stub de solicitar-seguir de EPIC-05. Nunca expone objetivos ni rol. Bypassa la RLS de profiles al no ser security_invoker; por eso solo contiene columnas de identidad.';

grant select on public.profile_identities to anon, authenticated;

-- La fila COMPLETA de profiles pasa a ser legible por el mismo criterio que el
-- resto del contenido de perfil: público, propio, O seguidor aceptado
-- (can_view_profile, SD-2). Antes era "público u propio", lo que dejaba a un
-- seguidor aceptado de un perfil privado sin poder leer la fila del perfil (y
-- por tanto viendo el stub en vez del contenido, pese a poder ver el contenido).
-- Los NO seguidores de un perfil privado siguen sin ver la fila completa (objetivos
-- y rol incluidos) — solo su identidad vía profile_identities.
drop policy "profiles public or own readable" on public.profiles;
create policy "profiles visible to viewer" on public.profiles
  for select to anon, authenticated
  using (public.can_view_profile(user_id));


-- ============================================================
-- 20260711_notifications.sql (EPIC-05 Bloque D)
-- ============================================================
-- Infra mínima para notificar in-app: nuevo seguidor, solicitud de
-- seguimiento, solicitud aceptada. Deliberadamente SIN push/email/cron (§8-D):
-- se lee al cargar la app (campana con contador de no leídas). Push queda
-- como continuación futura sobre esta misma tabla cuando exista esa infra.
--
-- target_type/target_id son nullable y no se usan todavía (las 3 notificaciones
-- de follows apuntan al ACTOR, que ya lleva a su perfil) — quedan preparados
-- para cuando existan reacciones/comentarios/posts de club (Bloque B/F), que sí
-- necesitarán decir "sobre qué" ocurrió el evento.

create type public.notification_type as enum (
  'follow_request',
  'new_follower',
  'follow_accepted'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  type public.notification_type not null,
  target_type text,
  target_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (user_id <> actor_id)
);

-- Listado del destinatario ordenado por fecha.
create index idx_notifications_recipient on public.notifications (user_id, created_at desc);
-- Contador de no leídas: parcial, solo indexa las filas que importan para el badge.
create index idx_notifications_unread on public.notifications (user_id) where read_at is null;

comment on table public.notifications is 'Notificaciones in-app de EPIC-05 (SD-5): nuevo seguidor, solicitud de seguimiento, solicitud aceptada. Sin push/email — se lee al cargar (campana). Push futuro sobre esta misma tabla cuando exista esa infra (§8-D).';

alter table public.notifications enable row level security;

-- SELECT/UPDATE: solo el destinatario ve y marca como leídas las suyas.
create policy "notifications select own" on public.notifications
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "notifications update own" on public.notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- INSERT: cualquier autenticado puede crear una notificación de la que ES el
-- actor, dirigida a otro usuario (nunca a sí mismo — CHECK de la tabla). Mismo
-- espíritu que el gateo de colaborador en §8-H: la RLS es permisiva y confía en
-- que la capa de app (server actions de follow/reacción/comentario) solo llame
-- a notify() tras una acción real; falsificar una notificación sin la acción
-- real es un riesgo de baja severidad (ninguna fuga de datos ni escalada de
-- privilegios), aceptado a cambio de no acoplar esta tabla genérica a la lógica
-- de cada feature futura que la use.
create policy "notifications insert as actor" on public.notifications
  for insert to authenticated
  with check ((select auth.uid()) = actor_id);


-- ============================================================
-- 20260711_review_interactions.sql (EPIC-05 Bloque B)
-- ============================================================
-- Dos tablas polimórficas sobre las reseñas ya existentes (diary_entries.review,
-- episode_watches.review) — no se mueven ni se promueven a una tabla `reviews`
-- propia. target_kind solo declara los dos valores reales hoy; club_post/comment
-- (Bloque F/H1) se añadirán con su propia migración cuando existan.

create type public.target_kind as enum ('diary_entry', 'episode_watch');

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  target_type public.target_kind not null,
  target_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'like',
  created_at timestamptz not null default now(),
  unique (target_type, target_id, user_id, kind)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  target_type public.target_kind not null,
  target_id uuid not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_reactions_target on public.reactions (target_type, target_id);
create index idx_comments_target on public.comments (target_type, target_id, created_at);

comment on table public.reactions is 'Reacciones polimórficas de EPIC-05 (SD-3): "me gusta" sobre reseñas (diary_entry/episode_watch). kind abierto a más valores futuros, hoy solo "like".';
comment on table public.comments is 'Comentarios en hilo plano de EPIC-05 (SD-3) sobre reseñas (diary_entry/episode_watch). Sin anidación ni edición en este MVP: solo alta y borrado de lo propio.';

create or replace function public.can_view_target(p_target_type public.target_kind, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case p_target_type
    when 'diary_entry' then exists (
      select 1 from public.diary_entries d where d.id = p_target_id and public.can_view_profile(d.user_id)
    )
    when 'episode_watch' then exists (
      select 1 from public.episode_watches e where e.id = p_target_id and public.can_view_profile(e.user_id)
    )
  end;
$$;

comment on function public.can_view_target(public.target_kind, uuid) is 'True si el usuario actual puede ver el target polimórfico (reseña) indicado, delegando en can_view_profile del dueño (SD-2/SD-3, EPIC-05).';

alter table public.reactions enable row level security;
alter table public.comments enable row level security;

create policy "reactions select visible" on public.reactions
  for select to anon, authenticated
  using (public.can_view_target(target_type, target_id));

create policy "reactions insert own on visible target" on public.reactions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.can_view_target(target_type, target_id)
  );

create policy "reactions delete own" on public.reactions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "comments select visible" on public.comments
  for select to anon, authenticated
  using (public.can_view_target(target_type, target_id));

create policy "comments insert own on visible target" on public.comments
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and public.can_view_target(target_type, target_id)
  );

create policy "comments delete own" on public.comments
  for delete to authenticated
  using ((select auth.uid()) = author_id);

alter type public.notification_type add value 'review_liked';
alter type public.notification_type add value 'review_commented';


-- ============================================================
-- 20260712_push_subscriptions.sql (E5.D4)
-- ============================================================
-- Notificaciones push (Web Push). channel solo declara 'web' hoy; un canal
-- nativo futuro (ios_native, vía Capacitor/APNs) sería un ALTER TYPE ADD
-- VALUE + una forma distinta de `credentials`, sin rediseñar la tabla.

create type public.push_channel as enum ('web');

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel public.push_channel not null default 'web',
  credentials jsonb not null,
  created_at timestamptz not null default now()
);

create unique index idx_push_subscriptions_user_channel_endpoint
  on public.push_subscriptions (user_id, channel, (credentials->>'endpoint'));

comment on table public.push_subscriptions is 'Suscripciones de push por usuario (E5.D4). channel discrimina el canal de entrega; credentials es jsonb específico de canal (hoy solo "web": {endpoint, keys:{p256dh,auth}}).';

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions select own" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "push_subscriptions insert own" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "push_subscriptions delete own" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);


-- ============================================================
-- 20260712_notifications_delete_policy.sql
-- ============================================================
-- Política DELETE en notifications, requerida por la limpieza perezosa de
-- notificaciones leídas (listNotifications borra las que llevan >5 min
-- marcadas como leídas, sin cron).

create policy "notifications delete own" on public.notifications
  for delete to authenticated using ((select auth.uid()) = user_id);


-- ============================================================
-- 20260712_clubs.sql (EPIC-05 Bloque E)
-- ============================================================
-- EPIC-05 Bloque E — Clubes: creación, membresía y roles. Ver
-- docs/superpowers/specs/2026-07-12-epic05-bloque-e-clubs-design.md (SD-4 en
-- docs/requirements/social-epic.md fijó el patrón: helpers SECURITY DEFINER
-- replicando el RBAC de §7.35, contenido siempre solo-miembros
-- independientemente de `visibility`).

create type public.club_visibility as enum ('public', 'private');

-- Orden ASCENDENTE de autoridad (mismo patrón que user_role: user<collaborator
-- <admin) — Postgres compara enums por orden de declaración, así que 'member'
-- va primero para que has_min_club_role()/las comparaciones de rol funcionen.
create type public.club_role as enum ('member', 'moderator', 'owner');

-- invited: un moderator+ le invitó, espera que ÉL acepte o rechace. No hay
-- 'pending' (solicitud propia) -- unirse a un club privado es SOLO por
-- invitación; un club privado es invisible a no-miembros (SD-4), así que un
-- no-miembro no podría siquiera comprobar que el club existe para solicitar
-- unirse, y una solicitud a un club público no tiene sentido (se une directo).
create type public.club_member_status as enum ('invited', 'active');

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  cover_url text,
  visibility public.club_visibility not null default 'public',
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.club_role not null default 'member',
  status public.club_member_status not null default 'active',
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create index idx_club_members_club on public.club_members (club_id, status);
create index idx_club_members_user on public.club_members (user_id, status);

comment on table public.clubs is 'Clubes de EPIC-05 Bloque E. visibility gobierna descubrimiento/cómo unirse, nunca quién ve el contenido (SD-4) — eso lo decide is_club_member().';
comment on table public.club_members is 'Membresía y rol por club. status=invited (invitación de un moderator+, pendiente de aceptar) / active. Unirse a un club privado es solo por invitación -- no hay solicitud propia. role solo cambia vía create_club/set_club_member_role/transfer_club_ownership (funciones SECURITY DEFINER), nunca por UPDATE de cliente.';

-- ── Helpers SECURITY DEFINER (mismo patrón que has_min_role/current_user_role,
-- §7.35) — evitan RLS recursiva sobre club_members. Solo cuentan filas
-- status='active': una fila invited ya tiene un role (default 'member'),
-- pero no es membresía real todavía.
create or replace function public.is_club_member(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.club_role(p_club_id uuid)
returns public.club_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.club_members
  where club_id = p_club_id and user_id = auth.uid() and status = 'active';
$$;

create or replace function public.has_min_club_role(p_club_id uuid, min public.club_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.club_role(p_club_id) >= min, false);
$$;

comment on function public.is_club_member(uuid) is 'True si el usuario actual es miembro ACTIVO del club (EPIC-05 Bloque E).';
comment on function public.club_role(uuid) is 'Rol del usuario actual en el club, o null si no es miembro activo.';
comment on function public.has_min_club_role(uuid, public.club_role) is 'True si el rol del usuario actual en el club es >= min en la jerarquía member<moderator<owner.';

-- club_member_row_exists: a diferencia de is_club_member() (exige
-- status='active' a propósito), esto cuenta CUALQUIER fila (invited o
-- active) -- lo usa la política SELECT de clubs para que un invitado vea el
-- club antes de aceptar. Tiene que ser una función SECURITY DEFINER y no un
-- exists(...) inline dentro de la política: Postgres detecta como recursión
-- estructural (error 42P17) cualquier par de tablas cuyas políticas se
-- referencien directamente entre sí sin un límite de función por medio --
-- club_members ya referencia clubs directamente en su política INSERT
-- (visibilidad de 'public'), así que clubs no puede referenciar
-- club_members directamente también, aunque en runtime nunca recursionaría
-- de verdad. Este es exactamente el motivo de que is_club_member()/
-- club_role()/has_min_club_role() ya sean funciones en vez de subqueries
-- inline.
create or replace function public.club_member_row_exists(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = auth.uid()
  );
$$;

comment on function public.club_member_row_exists(uuid) is 'True si el usuario actual tiene cualquier fila en club_members para este club (invited o active). Rompe la referencia cruzada directa entre las políticas de clubs y club_members que Postgres rechaza como recursión estructural (42P17) -- ver comentario arriba.';

-- ── Invariante de propiedad: un club con miembros siempre tiene owner ───────
-- Se dispara al borrar CUALQUIER fila de club_members con role='owner', sea
-- por leaveClub (tras su propia guarda, ver Dominio) o por un futuro cascade
-- desde auth.users (borrado de cuenta — no existe todavía, pero este trigger
-- no depende de que un futuro feature recuerde gestionarlo).
--
-- AFTER DELETE, no BEFORE: la rama "sin miembros restantes" borra la fila de
-- clubs, que en cascada (club_members.club_id on delete cascade) intenta
-- volver a borrar filas de club_members del mismo club -- incluida la que
-- este trigger está procesando ahora mismo. Si el trigger fuera BEFORE
-- DELETE, esa fila SEGUIRÍA sin borrarse todavía en el momento en que el
-- cascade la alcanza, y Postgres lo rechaza ("tuple to be deleted was
-- already modified by an operation triggered by the current command").
-- Con AFTER DELETE, cuando el trigger corre la fila original YA ha sido
-- eliminada por la sentencia externa, así que el cascade no encuentra nada
-- que la vuelva a tocar. La otra rama (promocionar al siguiente owner) SÍ
-- se ve afectada por este cambio de forma indirecta: su UPDATE a
-- clubs.owner_id dispara enforce_club_owner_change_authorized(), que
-- comprobaría la autoridad del owner SALIENTE -- cuya fila en club_members
-- ya no existe en este punto (AFTER DELETE). Por eso esa función tiene su
-- propia excepción vía pg_trigger_depth() -- ver su comentario.
create or replace function public.reassign_club_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_user uuid;
begin
  if old.role <> 'owner' then
    return null;
  end if;

  select user_id into v_next_user
    from public.club_members
    where club_id = old.club_id and user_id <> old.user_id and status = 'active'
    order by (role = 'moderator') desc, joined_at asc
    limit 1;

  if v_next_user is null then
    delete from public.clubs where id = old.club_id;
  else
    update public.club_members set role = 'owner'
      where club_id = old.club_id and user_id = v_next_user;
    update public.clubs set owner_id = v_next_user where id = old.club_id;
  end if;

  return null;
end;
$$;

create trigger trg_reassign_club_ownership
  after delete on public.club_members
  for each row execute function public.reassign_club_ownership();

-- ── Guarda de cambio de owner_id: solo el owner actual, y solo hacia un
-- miembro activo. Se aplica pase lo que pase (RPC transfer_club_ownership o,
-- en teoría, un UPDATE directo si alguien se saltara la app) — el RPC
-- necesita esto igualmente para el caso "no toca club_members", así que no es
-- redundante con la política RLS de clubs (que no puede validar "es miembro
-- activo" sin este trigger).
--
-- Excepción: pg_trigger_depth() > 1 significa que este UPDATE se disparó
-- desde DENTRO de otro trigger -- en esta migración, solo puede ser
-- reassign_club_ownership() reasignando tras el DELETE de la fila del owner
-- saliente (transfer_club_ownership() es una función normal, no un trigger,
-- así que llamarla NO añade profundidad; un cliente que se salte la app
-- tampoco). En ese caso concreto, has_min_club_role(old.id,'owner') SIEMPRE
-- daría false -- la fila del owner saliente ya no existe, se acaba de
-- borrar -- aunque la reasignación sea perfectamente legítima; y
-- reassign_club_ownership() ya garantiza por su cuenta que v_next_user es
-- miembro activo (su propia query solo selecciona status='active'), así que
-- repetir ambas comprobaciones aquí no solo es redundante sino que rompe la
-- reasignación real.
create or replace function public.enforce_club_owner_change_authorized()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    if pg_trigger_depth() > 1 then
      return new;
    end if;
    if not public.has_min_club_role(old.id, 'owner') then
      raise exception 'Only the current owner can change club ownership';
    end if;
    if not exists (
      select 1 from public.club_members
      where club_id = old.id and user_id = new.owner_id and status = 'active'
    ) then
      raise exception 'New owner must be an active club member';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_club_owner_change
  before update on public.clubs
  for each row execute function public.enforce_club_owner_change_authorized();

-- ── RPCs SECURITY DEFINER para escritura coordinada/sensible ────────────────
-- create_club: inserta clubs + la fila de club_members del owner atómicamente.
-- No hay política INSERT en clubs (ver RLS) — este RPC es el ÚNICO camino.
create or replace function public.create_club(
  p_slug text,
  p_name text,
  p_description text,
  p_visibility public.club_visibility,
  p_cover_url text
) returns public.clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club public.clubs;
begin
  insert into public.clubs (slug, name, description, visibility, cover_url, owner_id)
  values (p_slug, p_name, p_description, p_visibility, p_cover_url, auth.uid())
  returning * into v_club;

  insert into public.club_members (club_id, user_id, role, status)
  values (v_club.id, auth.uid(), 'owner', 'active');

  return v_club;
end;
$$;

revoke execute on function public.create_club(text, text, text, public.club_visibility, text) from public, anon;
grant execute on function public.create_club(text, text, text, public.club_visibility, text) to authenticated;

-- set_club_member_role: owner-only, nunca hacia/desde 'owner' (eso es
-- transfer_club_ownership). No puedes cambiar tu propio rol.
create or replace function public.set_club_member_role(
  p_club_id uuid,
  p_user_id uuid,
  p_role public.club_role
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_min_club_role(p_club_id, 'owner') then
    raise exception 'forbidden';
  end if;
  if p_role = 'owner' then
    raise exception 'use transfer_club_ownership to change the owner';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot change your own role';
  end if;

  update public.club_members set role = p_role
    where club_id = p_club_id and user_id = p_user_id and status = 'active';
  if not found then
    raise exception 'member not found';
  end if;
end;
$$;

revoke execute on function public.set_club_member_role(uuid, uuid, public.club_role) from public, anon;
grant execute on function public.set_club_member_role(uuid, uuid, public.club_role) to authenticated;

-- transfer_club_ownership: owner-only, target debe ser miembro activo. El
-- owner saliente pasa a moderator (conserva posición de confianza), el
-- entrante pasa a owner, clubs.owner_id se actualiza. Atómico.
create or replace function public.transfer_club_ownership(
  p_club_id uuid,
  p_new_owner_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_owner uuid;
begin
  -- Un solo mensaje 'forbidden' para "no existe" y "no eres el owner" --
  -- distinguirlos daría un oráculo de existencia para probar UUIDs de club
  -- privados arbitrarios (SD-4 los quiere indescubribles). Mismo patrón que
  -- set_club_member_role() de arriba.
  select owner_id into v_current_owner from public.clubs where id = p_club_id;
  if v_current_owner is null or v_current_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;
  if p_new_owner_id = v_current_owner then
    raise exception 'already the owner';
  end if;
  if not exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = p_new_owner_id and status = 'active'
  ) then
    raise exception 'target is not an active member';
  end if;

  -- clubs.owner_id se actualiza PRIMERO, mientras el llamante (v_current_owner)
  -- todavía tiene role='owner' en club_members -- el trigger
  -- trg_enforce_club_owner_change vuelve a comprobar has_min_club_role(id,
  -- 'owner') justo en este UPDATE, así que si degradásemos a v_current_owner
  -- ANTES, el propio trigger rechazaría el cambio que su propio dueño
  -- legítimo está autorizando (encontrado por la batería de RLS del
  -- implementador de la Task 1: transfer_club_ownership() fallaba con "Only
  -- the current owner can change club ownership" al intentar transferir,
  -- porque el orden original degradaba el rol en club_members antes de tocar
  -- clubs.owner_id).
  update public.clubs set owner_id = p_new_owner_id where id = p_club_id;
  update public.club_members set role = 'moderator'
    where club_id = p_club_id and user_id = v_current_owner;
  update public.club_members set role = 'owner'
    where club_id = p_club_id and user_id = p_new_owner_id;
end;
$$;

revoke execute on function public.transfer_club_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_club_ownership(uuid, uuid) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.clubs enable row level security;

-- La fila ENTERA (incl. description) de un club privado es invisible a
-- no-miembros, no solo su contenido (SD-4). "member" aquí incluye status
-- 'invited', no solo 'active' -- is_club_member() exige 'active' a
-- propósito (ver su comentario), así que NO se usa aquí: alguien invitado a
-- un club privado necesita ver su nombre/descripción/portada para decidir
-- si acepta, antes de ser miembro real. Postgres además exige que una fila
-- sea visible por SELECT antes de que cualquier política UPDATE/DELETE
-- pueda tocarla -- ver la política de club_members más abajo, mismo motivo.
-- Usa club_member_row_exists() (función) en vez de un exists(...) inline a
-- club_members: club_members ya referencia clubs directamente en su
-- política INSERT, y con AMBAS direcciones como subquery inline Postgres
-- rechaza el plan como recursión estructural (42P17) -- ver el comentario
-- de club_member_row_exists() más arriba.
create policy "clubs select public or member" on public.clubs
  for select to anon, authenticated
  using (
    visibility = 'public'
    or public.club_member_row_exists(id)
  );

-- Sin política INSERT a propósito: create_club() es el único camino (bypassa
-- RLS vía SECURITY DEFINER). Esto evita tener que replicar en RLS la lógica
-- coordinada de "inserta clubs Y la fila de owner en club_members".
create policy "clubs update moderator+" on public.clubs
  for update to authenticated
  using (public.has_min_club_role(id, 'moderator'))
  with check (public.has_min_club_role(id, 'moderator'));

alter table public.club_members enable row level security;

-- Roster completo solo para miembros ACTIVOS (is_club_member). Además, CUALQUIERA
-- ve su PROPIA fila sin importar el status -- necesario para que un invitado
-- pueda ver (y por tanto aceptar) su propia invitación: Postgres exige que una
-- fila pase la política SELECT antes de que UPDATE/DELETE puedan tocarla,
-- incluso si su propia política USING ya lo permitiría. Sin esto, "club_members
-- accept invite" nunca afectaría ninguna fila (0 resultados siempre), porque
-- is_club_member() exige status='active' y un invitado todavía no lo es.
create policy "club_members select member" on public.club_members
  for select to authenticated
  using (
    public.is_club_member(club_id)
    or user_id = (select auth.uid())
  );

-- role='member' siempre en esta política — la fila de owner la crea
-- create_club() (bypass RLS), los ascensos van por set_club_member_role().
-- Sin esto, un self-insert o una invitación podrían intentar colarse como
-- role='owner' o cualquier otro valor.
--
-- Solo dos formas de entrar: auto-unirse a un club PÚBLICO (status=active
-- directo) o ser invitado por un moderator+ (status=invited, cualquier
-- visibilidad). No existe un self-insert 'pending' para clubes privados: la
-- fila de un club privado es invisible a no-miembros (SD-4), así que quien
-- quisiera solicitar unirse no podría ni comprobar que el club existe —
-- unirse a un privado es solo por invitación.
create policy "club_members insert self or invite" on public.club_members
  for insert to authenticated
  with check (
    role = 'member'
    and (
      (
        user_id = (select auth.uid())
        and status = 'active'
        and exists (
          select 1 from public.clubs c where c.id = club_id and c.visibility = 'public'
        )
      )
      or (
        user_id <> (select auth.uid())
        and status = 'invited'
        and public.has_min_club_role(club_id, 'moderator')
      )
    )
  );

-- Auto-servicio únicamente: aceptar tu propia invitación. No hay rama de
-- moderación aquí -- sin 'pending', no hay solicitudes que un moderator+
-- tenga que aprobar. with check exige status='active' Y role='member': sin
-- el "and role = 'member'", un invitado podría colar role='owner' en la
-- MISMA llamada que acepta su invitación (with check solo valida la fila
-- NUEVA propuesta, no compara contra la fila vieja) -- se convertiría en
-- owner sin pasar nunca por create_club()/transfer_club_ownership().
create policy "club_members accept invite" on public.club_members
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'invited')
  with check (status = 'active' and role = 'member');

-- Auto-servicio (salir/rechazar tu propia fila) o moderación: un moderator+
-- puede expulsar a alguien de rol estrictamente inferior al suyo — no a otro
-- moderator ni al owner.
create policy "club_members delete self or moderate" on public.club_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (public.has_min_club_role(club_id, 'moderator') and public.club_role(club_id) > role)
  );

-- ── Notificaciones de club (EPIC-05 Bloque E), mismo patrón simétrico que
-- follow_request/follow_accepted. Solo 2 tipos -- sin solicitud de unión
-- propia (ver arriba), no hace falta club_join_request/club_join_approved.
-- notifications.target_type es texto suelto (no el enum target_kind de
-- reactions/comments) — se usa el literal 'club'.
alter type public.notification_type add value 'club_invite';
alter type public.notification_type add value 'club_invite_accepted';


-- ============================================================
-- 20260712_club_posts.sql (EPIC-05 Bloque F)
-- ============================================================

-- EPIC-05 Bloque F — Feed del club. Ver
-- docs/superpowers/specs/2026-07-12-epic05-bloque-f-club-feed-design.md. Reutiliza
-- is_club_member/has_min_club_role (Bloque E) y el motor polimórfico
-- reactions/comments (Bloque B, SD-3) — los posts se vuelven un target_kind más.

create type public.club_post_kind as enum ('text', 'activity_share', 'poll');

create table public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  kind public.club_post_kind not null,
  body text not null,              -- texto / caption obligatorio de activity_share / pregunta de poll
  ref jsonb,                       -- solo activity_share: {sourceTable, rowId} -- mismo vocabulario
                                    -- que FeedEvent.id de Bloque C (src/lib/social/feed.ts), partido
                                    -- por ":" en vez de reinventar una nomenclatura paralela
  poll_ends_at timestamptz,        -- solo poll: cierre de votación
  created_at timestamptz not null default now()
);

create table public.club_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.club_posts(id) on delete cascade,
  label text not null,
  position smallint not null
);

create table public.club_poll_votes (
  post_id uuid not null references public.club_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_id uuid not null references public.club_poll_options(id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (post_id, user_id)   -- elección única: una fila por votante, UPSERT para cambiar voto
);

create index idx_club_posts_club on public.club_posts (club_id, created_at desc);
create index idx_club_poll_options_post on public.club_poll_options (post_id, position);
create index idx_club_poll_votes_post on public.club_poll_votes (post_id);

comment on table public.club_posts is 'Posts del feed de un club (EPIC-05 Bloque F). kind=text/activity_share/poll. Sin UPDATE -- no editables, mismo criterio "Reddit-lite" que comments (Bloque B).';
comment on table public.club_poll_options is 'Opciones de una encuesta de club. Sin política de escritura de cliente -- solo se crean vía create_club_poll() (SECURITY DEFINER), atómico con el post.';
comment on table public.club_poll_votes is 'Un voto por usuario por encuesta (PK compuesta = elección única). Sin política de escritura de cliente -- solo vía vote_club_poll() (SECURITY DEFINER), que revalida el cierre server-side.';

-- ── target_kind (Bloque B) gana dos valores: los posts se vuelven
-- reaccionables/comentables, y los comentarios se vuelven reaccionables (like
-- en comentarios, decisión de sesión: app-wide, no solo en posts de club, ya
-- que comparte el mismo target_kind que las reseñas).
alter type public.target_kind add value 'club_post';
alter type public.target_kind add value 'comment';

-- Postgres exige que un valor nuevo de enum esté COMMITted antes de poder
-- usarse (55P04 "unsafe use of new value of enum type") -- y el CHECK y
-- can_view_target() de abajo lo referencian como literal inmediatamente.
-- Cierra la transacción implícita de este script para que quede confirmado
-- antes de su primer uso; no hay BEGIN explícito que cerrar, así que
-- Postgres simplemente reabre una transacción implícita para el resto.
commit;

-- Sin esto, nada impediría insertar un comentario cuyo propio target_type
-- fuera 'comment' (anidación) -- el diseño no la contempla ("hilo plano, sin
-- anidación", Bloque B) y además rompería la terminación de la rama
-- recursiva de can_view_target() de abajo: un comentario cuyo target_id
-- apuntase a sí mismo produciría recursión infinita. El CHECK hace la
-- anidación irrepresentable en el esquema, no solo "no soportada por la UI".
alter table public.comments add constraint comments_no_nesting check (target_type <> 'comment');

-- can_view_target() (Bloque B) gana dos ramas. 'comment' es recursiva sobre
-- la misma función -- termina en una sola pasada porque comments_no_nesting
-- de arriba garantiza que el target de un comentario nunca es otro
-- comentario.
create or replace function public.can_view_target(p_target_type public.target_kind, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case p_target_type
    when 'diary_entry' then exists (
      select 1 from public.diary_entries d where d.id = p_target_id and public.can_view_profile(d.user_id)
    )
    when 'episode_watch' then exists (
      select 1 from public.episode_watches e where e.id = p_target_id and public.can_view_profile(e.user_id)
    )
    when 'club_post' then exists (
      select 1 from public.club_posts cp where cp.id = p_target_id and public.is_club_member(cp.club_id)
    )
    when 'comment' then exists (
      select 1 from public.comments c where c.id = p_target_id
        and public.can_view_target(c.target_type, c.target_id)
    )
  end;
$$;

-- ── Visibilidad de actividad compartida a un club: pieza genuinamente nueva
-- de este bloque. Un club_post de kind='activity_share' comparte una fila
-- de diary_entries/episode_watches -- si el que comparte tiene perfil
-- privado y un compañero de club no le sigue, ese compañero igualmente debe
-- poder ver el detalle (decisión de sesión: compartir a un club es una
-- elección explícita de audiencia que prevalece sobre la visibilidad de
-- seguidor/perfil normal, solo dentro de ese club). Se aísla en un helper
-- NUEVO y angosto en vez de tocar can_view_profile() (helper transversal
-- usado por todo el contenido de perfil desde Bloque A, ya verificado --
-- menor riesgo mantenerlo intacto). p_target_type solo puede ser
-- 'diary_entry'/'episode_watch' en la práctica (los únicos dos tipos de fila
-- que activity_share puede referenciar y que a su vez tienen RLS propia que
-- necesita este override); el CASE cubre exactamente esos dos.
create or replace function public.is_visible_via_club_share(p_target_type public.target_kind, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_posts cp
    where cp.kind = 'activity_share'
      and cp.ref->>'sourceTable' = case p_target_type
        when 'diary_entry' then 'diary_entries'
        when 'episode_watch' then 'episode_watches'
        else null
      end
      and cp.ref->>'rowId' = p_target_id::text
      and public.is_club_member(cp.club_id)
  );
$$;

comment on function public.is_visible_via_club_share(public.target_kind, uuid) is 'True si target_id fue compartido como activity_share en un club del que el usuario actual es miembro (EPIC-05 Bloque F). Extra OR en las políticas SELECT de diary_entries/episode_watches -- NO se integra en can_view_profile() a propósito, ver comentario de la función.';

-- ── Extiende la visibilidad de diary_entries/episode_watches (Bloque A) con
-- el OR de arriba. drop+create porque Postgres no permite ALTER POLICY para
-- cambiar el USING.
drop policy "diary entries select visible" on public.diary_entries;
create policy "diary entries select visible" on public.diary_entries
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('diary_entry', id)
  );

drop policy "episode_watches select visible" on public.episode_watches;
create policy "episode_watches select visible" on public.episode_watches
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('episode_watch', id)
  );

-- ── RPCs SECURITY DEFINER ────────────────────────────────────────────────
-- create_club_poll: inserta club_posts + club_poll_options atómicamente,
-- mismo patrón que create_club (Bloque E). Revalida "al menos 2 opciones" y
-- "cierre en el futuro" server-side, no solo confía en el chequeo cliente
-- de createPoll() (Dominio, Task 6) -- SECURITY DEFINER es alcanzable
-- directamente vía RPC, no solo desde la app.
create or replace function public.create_club_poll(
  p_club_id uuid,
  p_question text,
  p_options text[],
  p_ends_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
begin
  if not public.is_club_member(p_club_id) then
    raise exception 'forbidden';
  end if;
  if array_length(p_options, 1) is null or array_length(p_options, 1) < 2 then
    raise exception 'at least two options required';
  end if;
  if p_ends_at <= now() then
    raise exception 'poll end date must be in the future';
  end if;

  insert into public.club_posts (club_id, author_id, kind, body, poll_ends_at)
  values (p_club_id, auth.uid(), 'poll', p_question, p_ends_at)
  returning id into v_post_id;

  insert into public.club_poll_options (post_id, label, position)
  select v_post_id, opt, (ord - 1)::smallint
  from unnest(p_options) with ordinality as t(opt, ord);
end;
$$;

revoke execute on function public.create_club_poll(uuid, text, text[], timestamptz) from public, anon;
grant execute on function public.create_club_poll(uuid, text, text[], timestamptz) to authenticated;

-- vote_club_poll: UPSERT del voto propio (elección única, PK compuesta en
-- club_poll_votes fuerza esto). Revalida "es miembro", "es una encuesta
-- real", "sigue abierta" y "la opción pertenece a este post" -- votar tras
-- el cierre se rechaza aquí, no solo se oculta en la UI.
create or replace function public.vote_club_poll(p_post_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_kind public.club_post_kind;
  v_ends_at timestamptz;
begin
  select club_id, kind, poll_ends_at into v_club_id, v_kind, v_ends_at
    from public.club_posts where id = p_post_id;

  if v_club_id is null or v_kind <> 'poll' then
    raise exception 'not a poll';
  end if;
  if not public.is_club_member(v_club_id) then
    raise exception 'forbidden';
  end if;
  if v_ends_at <= now() then
    raise exception 'poll is closed';
  end if;
  if not exists (
    select 1 from public.club_poll_options where id = p_option_id and post_id = p_post_id
  ) then
    raise exception 'invalid option';
  end if;

  insert into public.club_poll_votes (post_id, user_id, option_id)
  values (p_post_id, auth.uid(), p_option_id)
  on conflict (post_id, user_id) do update set option_id = excluded.option_id, voted_at = now();
end;
$$;

revoke execute on function public.vote_club_poll(uuid, uuid) from public, anon;
grant execute on function public.vote_club_poll(uuid, uuid) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.club_posts enable row level security;

create policy "club_posts select member" on public.club_posts
  for select to authenticated
  using (public.is_club_member(club_id));

-- Cualquier miembro activo puede publicar (decisión de sesión: unirse a un
-- club es participar, no gateado a moderator+ como en Bloque E).
create policy "club_posts insert member" on public.club_posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_club_member(club_id));

-- Autor propio o moderator+ (mismo patrón que "club_members delete self or
-- moderate", Bloque E). Sin política UPDATE -- posts no editables.
create policy "club_posts delete self or moderate" on public.club_posts
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or public.has_min_club_role(club_id, 'moderator')
  );

alter table public.club_poll_options enable row level security;

-- Legible si el club_posts padre lo es. Sin INSERT/UPDATE/DELETE de cliente
-- a propósito -- create_club_poll() (SECURITY DEFINER) es el único camino,
-- mismo patrón que clubs no tener política INSERT (create_club() la
-- bypassa).
create policy "club_poll_options select via post" on public.club_poll_options
  for select to authenticated
  using (
    exists (
      select 1 from public.club_posts cp
      where cp.id = post_id and public.is_club_member(cp.club_id)
    )
  );

alter table public.club_poll_votes enable row level security;

-- has_voted_in_club_poll: la política SELECT de abajo necesita "¿tiene el
-- usuario actual una fila propia en club_poll_votes para esta encuesta?" --
-- pero un exists(...) inline contra la MISMA tabla que la política protege
-- es exactamente el patrón que Postgres rechaza como recursión estructural
-- (error 42P17), igual que el cruce clubs<->club_members de Bloque E
-- (ver comentario de club_member_row_exists() en 20260712_clubs.sql). Mismo
-- remedio: aislarlo en una función SECURITY DEFINER, que al ejecutar como el
-- owner de la función no reevalúa esta política sobre sí misma.
create or replace function public.has_voted_in_club_poll(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_poll_votes
    where post_id = p_post_id and user_id = auth.uid()
  );
$$;

comment on function public.has_voted_in_club_poll(uuid) is 'True si el usuario actual ya tiene un voto propio en esta encuesta de club (EPIC-05 Bloque F). Rompe la recursión estructural (42P17) de la política SELECT de club_poll_votes referenciándose a sí misma -- ver comentario de la función.';

-- Tu propio voto SIEMPRE visible. Los votos de los demás solo una vez que TÚ
-- ya has votado en esa encuesta, o la encuesta ya cerró -- esto es lo que de
-- verdad hace cumplir "resultados ocultos hasta que votas" (decisión de
-- sesión): si la política permitiera ver todos los votos a cualquier
-- miembro, un cliente podría consultar club_poll_votes directamente vía
-- PostgREST y saltarse el ocultamiento que hace listClubPosts() a nivel de
-- aplicación -- la RLS es la garantía real, no solo la capa de dominio.
-- Sin INSERT/UPDATE/DELETE de cliente -- vote_club_poll() (SECURITY
-- DEFINER) es el único camino.
create policy "club_poll_votes select own or revealed" on public.club_poll_votes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      exists (
        select 1 from public.club_posts cp
        where cp.id = post_id and public.is_club_member(cp.club_id)
      )
      and (
        public.has_voted_in_club_poll(post_id)
        or (select poll_ends_at from public.club_posts where id = post_id) <= now()
      )
    )
  );

-- ── Notificaciones de club post (EPIC-05 Bloque F), simétrico a
-- club_invite/club_invite_accepted (Bloque E). club_post enruta a
-- /club/[slug] reutilizando el targetType='club' ya existente en
-- notify()/listNotifications() (sin deep-link al post concreto, decisión de
-- sesión: mantenerlo simple). club_post_liked/club_post_commented/
-- comment_liked dan paridad completa con review_liked/review_commented
-- (decisión de sesión) -- ver Task 5 para su resolución de href.
alter type public.notification_type add value 'club_post';
alter type public.notification_type add value 'club_post_liked';
alter type public.notification_type add value 'club_post_commented';
alter type public.notification_type add value 'comment_liked';

-- ============================================================
-- 20260713_club_posts_share_visibility_fix.sql (EPIC-05 Bloque F, follow-up)
-- ============================================================
-- EPIC-05 Bloque F — fix: is_visible_via_club_share() solo cubría
-- diary_entries/episode_watches, pero activity_share puede compartir
-- CUALQUIER FeedEvent (Bloque C: también library_entries/progress_sessions,
-- "altas de biblioteca" per el spec de diseño). Sin este fix, compartir un
-- alta de biblioteca o una sesión de progreso desde un perfil privado fallaba
-- en silencio para compañeros de club que no siguen al que comparte (RLS
-- deniega, resolveSharedActivity devuelve null, el post muestra "ya no
-- disponible") -- fail-closed, no una fuga de datos, pero la mitad del
-- alcance prometido por la decisión de diseño quedaba sin implementar.
-- Encontrado en la revisión final de rama completa, no por la propia batería
-- de la Task 1 (que solo probó diary_entry/episode_watch).

-- Las políticas de diary_entries/episode_watches dependen de la firma vieja
-- de la función (postgres rechaza el DROP FUNCTION si algo la referencia
-- todavía, 2BP01) -- hay que soltarlas primero. Se recrean más abajo ya
-- apuntando a la firma nueva.
drop policy "diary entries select visible" on public.diary_entries;
drop policy "episode_watches select visible" on public.episode_watches;

-- La función original acoplaba p_target_type a target_kind (que no incluye
-- library_entries/progress_sessions -- esas tablas nunca son targets de
-- reacciones/comentarios). Se desacopla a un p_source_table de texto plano,
-- comparado directamente contra ref->>'sourceTable' (mismo valor que
-- FeedEvent.id ya usa) -- más simple y ahora reusable por las 4 tablas.
drop function if exists public.is_visible_via_club_share(public.target_kind, uuid);

create or replace function public.is_visible_via_club_share(p_source_table text, p_row_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_posts cp
    where cp.kind = 'activity_share'
      and cp.ref->>'sourceTable' = p_source_table
      and cp.ref->>'rowId' = p_row_id::text
      and public.is_club_member(cp.club_id)
  );
$$;

comment on function public.is_visible_via_club_share(text, uuid) is 'True si p_row_id de p_source_table fue compartido como activity_share en un club del que el usuario actual es miembro (EPIC-05 Bloque F). p_source_table es el literal de tabla (diary_entries/episode_watches/library_entries/progress_sessions), no target_kind -- desacoplado para cubrir también las dos fuentes de FeedEvent que nunca son target de reacciones/comentarios.';

-- Re-crea diary_entries/episode_watches apuntando a la nueva firma (mismo
-- OR, mismo comportamiento, solo cambia cómo se invoca la función). Ya
-- soltadas arriba.
create policy "diary entries select visible" on public.diary_entries
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('diary_entries', id)
  );

create policy "episode_watches select visible" on public.episode_watches
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('episode_watches', id)
  );

-- Extiende el mismo OR a library_entries/progress_sessions -- el gap real
-- que cierra este fix.
drop policy "library entries select visible" on public.library_entries;
create policy "library entries select visible" on public.library_entries
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('library_entries', id)
  );

drop policy "progress sessions select visible" on public.progress_sessions;
create policy "progress sessions select visible" on public.progress_sessions
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('progress_sessions', id)
  );


-- ============================================================
-- 20260713_club_activities.sql (EPIC-05 Bloque G)
-- ============================================================

-- EPIC-05 Bloque G — Motor genérico de actividades de club. Ver
-- docs/superpowers/specs/2026-07-13-epic05-bloque-g-club-activities-design.md (SD-8 en
-- docs/requirements/social-epic.md fijó el patrón: una tabla núcleo + sub-tablas
-- compartidas + extensión por tipo solo donde hace falta -- Bloque H añade esa extensión,
-- este bloque no la necesita).

create type public.activity_kind as enum ('buddy_read', 'tierlist', 'list_challenge', 'criteria_challenge');
-- Enum abierto -- futuros kinds se añaden como valores nuevos vía ALTER TYPE ADD VALUE,
-- nunca como tablas nuevas (SD-8). A diferencia de target_kind en Bloque F, estos valores
-- NO se referencian como literal en ningún otro sitio de este mismo script (solo se leen
-- desde la capa de app, en un deploy totalmente aparte) -- no hace falta el `commit;`
-- intermedio que sí hizo falta allí.
create type public.activity_status as enum ('proposed', 'active', 'finished', 'archived');

create table public.club_activities (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  kind public.activity_kind not null,
  title text not null,
  description text,
  status public.activity_status not null default 'proposed',
  config jsonb,              -- opaco a SQL/RLS -- interpretado en la capa de app por kind
                              -- (Bloque H). Este bloque no lo lee ni lo escribe en ningún
                              -- sitio de su propio código.
  created_by uuid not null references auth.users(id),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

create table public.club_activity_participants (
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create table public.club_activity_items (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  added_by uuid not null references auth.users(id),
  position smallint not null,
  created_at timestamptz not null default now()
);

create table public.club_activity_opinions (
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  rating smallint,
  comment text,
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id, item_type, item_id)
);

create index idx_club_activities_club on public.club_activities (club_id, created_at desc);
create index idx_club_activity_items_activity on public.club_activity_items (activity_id, position);
create index idx_club_activity_opinions_activity on public.club_activity_opinions (activity_id);

comment on table public.club_activities is 'Actividades de club (EPIC-05 Bloque G, SD-8). kind es enum abierto; config es opaco, interpretado por tipo en la capa de app (Bloque H). Ciclo de vida: proposed -> active -> finished, o proposed/active -> archived.';
comment on table public.club_activity_participants is 'Opt-in a una actividad. Gatea acceso a club_activity_items (escritura) y club_activity_opinions (lectura+escritura) vía is_activity_participant().';
comment on table public.club_activity_items is 'Pool de ítems de la actividad (la lista de un reto, los ítems a rankear de una tierlist, el único ítem de un buddy_read). Genérico -- la interpretación del pool (orden de ranking, checkpoints) es de Bloque H.';
comment on table public.club_activity_opinions is 'Opinión (rating/comment) de un participante sobre un ítem, en el contexto de la actividad -- distinta de diary_entries.review. Una fila por usuario+ítem+actividad (upsert para cambiarla).';

-- club_activity_participants no depende de esta función (usa auth.uid() directo en sus
-- propias políticas), así que no hay riesgo de recursión estructural (42P17) al llamarla
-- desde club_activity_items/club_activity_opinions -- mismo patrón anti-recursión que
-- is_club_member(), pero sin el riesgo bidireccional que sí tuvo clubs<->club_members en
-- Bloque E (allí ambas tablas se referenciaban entre sí).
create or replace function public.is_activity_participant(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_activity_participants
    where activity_id = p_activity_id and user_id = auth.uid()
  );
$$;

comment on function public.is_activity_participant(uuid) is 'True si el usuario actual se ha unido a esta actividad (EPIC-05 Bloque G). Gatea la escritura del pool de ítems y la lectura+escritura de opiniones.';

-- ── RPCs SECURITY DEFINER para transiciones de estado ───────────────────────
-- Mismo patrón que Bloques E/F: cambios con lógica de autorización no trivial van por RPC,
-- nunca por UPDATE de cliente gateado por RLS.
create or replace function public.activate_club_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_status public.activity_status;
begin
  select club_id, status into v_club_id, v_status from public.club_activities where id = p_activity_id;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_status <> 'proposed' then
    raise exception 'activity is not in proposed state';
  end if;
  update public.club_activities set status = 'active' where id = p_activity_id;
end;
$$;

revoke execute on function public.activate_club_activity(uuid) from public, anon;
grant execute on function public.activate_club_activity(uuid) to authenticated;

-- finish_club_activity: creador O moderator+ (a diferencia de activate/archive, que son
-- solo moderator+) -- menor fricción para que quien propuso la actividad pueda cerrarla.
create or replace function public.finish_club_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_status public.activity_status;
  v_created_by uuid;
begin
  select club_id, status, created_by into v_club_id, v_status, v_created_by
    from public.club_activities where id = p_activity_id;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if v_created_by <> auth.uid() and not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_status <> 'active' then
    raise exception 'activity is not active';
  end if;
  update public.club_activities set status = 'finished' where id = p_activity_id;
end;
$$;

revoke execute on function public.finish_club_activity(uuid) from public, anon;
grant execute on function public.finish_club_activity(uuid) to authenticated;

-- archive_club_activity: generaliza "rechazar una propuesta" y "cancelar una activa" en una
-- sola acción, moderator+, alcanzable desde 'proposed' o 'active' (decisión de sesión).
create or replace function public.archive_club_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_status public.activity_status;
begin
  select club_id, status into v_club_id, v_status from public.club_activities where id = p_activity_id;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_status not in ('proposed', 'active') then
    raise exception 'activity cannot be archived from its current state';
  end if;
  update public.club_activities set status = 'archived' where id = p_activity_id;
end;
$$;

revoke execute on function public.archive_club_activity(uuid) from public, anon;
grant execute on function public.archive_club_activity(uuid) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.club_activities enable row level security;

create policy "club_activities select member" on public.club_activities
  for select to authenticated
  using (public.is_club_member(club_id));

-- Cualquier miembro activo puede proponer (sin gateo de rol, mismo criterio que publicar
-- en el feed de club, Bloque F). with check fija status='proposed' -- no se puede insertar
-- directamente como 'active'.
create policy "club_activities insert member" on public.club_activities
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_club_member(club_id)
    and status = 'proposed'
  );

-- Sin política UPDATE a propósito -- las transiciones de estado son RPC-only.

alter table public.club_activity_participants enable row level security;

-- Cualquier miembro del club ve quién se ha unido, sin necesidad de unirse él mismo
-- primero -- referencia de un solo sentido a club_activities (que a su vez nunca
-- referencia esta tabla), sin riesgo de recursión estructural.
create policy "club_activity_participants select member" on public.club_activity_participants
  for select to authenticated
  using (
    exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and public.is_club_member(ca.club_id)
    )
  );

-- Auto-servicio, solo si la actividad está activa -- no puedes unirte a una propuesta
-- todavía no activada ni a una ya finalizada/archivada.
create policy "club_activity_participants insert self" on public.club_activity_participants
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and ca.status = 'active' and public.is_club_member(ca.club_id)
    )
  );

-- Solo tu propia fila (salir) -- sin expulsión por moderador, es una decisión de
-- participación mucho más ligera que la membresía del club en sí (Bloque E).
create policy "club_activity_participants delete self" on public.club_activity_participants
  for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.club_activity_items enable row level security;

create policy "club_activity_items select member" on public.club_activity_items
  for select to authenticated
  using (
    exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and public.is_club_member(ca.club_id)
    )
  );

create policy "club_activity_items insert participant" on public.club_activity_items
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and public.is_activity_participant(activity_id)
  );

-- Quien lo añadió, o moderator+ del club -- deliberadamente SIN exigir
-- is_activity_participant() en ninguna rama (ni para borrar lo tuyo si ya saliste de la
-- actividad, ni para el moderator+ que no se ha unido él mismo) -- mismo criterio que
-- "club_posts delete self or moderate" (Bloque F).
create policy "club_activity_items delete own or moderate" on public.club_activity_items
  for delete to authenticated
  using (
    added_by = (select auth.uid())
    or exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and public.has_min_club_role(ca.club_id, 'moderator')
    )
  );

alter table public.club_activity_opinions enable row level security;

-- Solo participantes -- confirma la lectura de SD-8: ver las opiniones de otros exige
-- haberte unido tú también, no basta con ser miembro del club.
create policy "club_activity_opinions select participant" on public.club_activity_opinions
  for select to authenticated
  using (public.is_activity_participant(activity_id));

create policy "club_activity_opinions insert own" on public.club_activity_opinions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_activity_participant(activity_id)
  );

create policy "club_activity_opinions update own" on public.club_activity_opinions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "club_activity_opinions delete own" on public.club_activity_opinions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── Notificaciones de actividad de club (EPIC-05 Bloque G), mismo patrón de fan-out que
-- club_post (Bloque F). A diferencia de club_post (que enruta al club sin deep-link),
-- estas SÍ enlazan a la página propia de la actividad -- ver Task 3 para su resolución de
-- href.
alter type public.notification_type add value 'club_activity_proposed';
alter type public.notification_type add value 'club_activity_activated';


-- ============================================================
-- 20260713_activity_checkpoints.sql (EPIC-05 Bloque H1)
-- ============================================================

-- EPIC-05 Bloque H1 — Checkpoints y lectura conjunta (buddy_read). Ver
-- docs/requirements/social-epic.md. Reutiliza el motor de actividades de club (Bloque G):
-- club_activities/club_activity_items/is_club_member/has_min_club_role/is_activity_participant
-- ya existen y no se recrean aquí. Este bloque añade la extensión específica de buddy_read
-- que SD-8 (Bloque G) dejó pendiente: checkpoints ordenados sobre el único ítem del pool, y
-- un tablero de progreso grupal (quién ha llegado a qué checkpoint) reusando comments/reactions
-- polimórficos (target_kind) para el chat de cada checkpoint.

-- ── Tablas ───────────────────────────────────────────────────────────────
create table public.club_activity_checkpoints (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  label text not null,
  position jsonb not null,        -- mismo vocabulario que library_entries.position (Bloque
                                   -- H1 lo interpreta solo para book/series, ver
                                   -- src/lib/library/position.ts): {"page": n} o
                                   -- {"season": n, "episode": n}
  "order" smallint not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Sin FK de columna hacia club_activity_checkpoints en cuanto a "una lectura por
-- checkpoint" -- la unicidad real es la PK compuesta de abajo, no una restricción de
-- pertenencia a actividad (checkpoint_id ya implica la actividad vía su propia FK).
create table public.club_activity_checkpoint_reads (
  checkpoint_id uuid not null references public.club_activity_checkpoints(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reached_at timestamptz not null default now(),
  primary key (checkpoint_id, user_id)
);

create index idx_club_activity_checkpoints_activity on public.club_activity_checkpoints (activity_id, "order");
create index idx_club_activity_checkpoint_reads_checkpoint on public.club_activity_checkpoint_reads (checkpoint_id);

comment on table public.club_activity_checkpoints is 'Checkpoints ordenados de una actividad buddy_read (EPIC-05 Bloque H1). position es el mismo shape polimórfico que library_entries.position, interpretado solo para book/series. Visibles a todo el club (no solo a participantes) para que puedan decidir si unirse; solo moderator+ los crea/edita/borra, y solo mientras la actividad está active.';
comment on table public.club_activity_checkpoint_reads is 'Quién ha confirmado haber llegado a qué checkpoint (tablero de progreso grupal). Sin política de escritura de cliente -- solo vía confirm_checkpoint() (SECURITY DEFINER), que revalida server-side contra library_entries.position antes de insertar.';

-- ── Helper SECURITY DEFINER ──────────────────────────────────────────────
-- Necesario ANTES de recrear can_view_target() más abajo (lo referencia). Mismo patrón que
-- is_activity_participant()/has_voted_in_club_poll(): evita recursión estructural al usarse
-- desde la política SELECT de reactions/comments sobre target_type='activity_checkpoint'.
create or replace function public.has_reached_checkpoint(p_checkpoint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_activity_checkpoint_reads
    where checkpoint_id = p_checkpoint_id and user_id = auth.uid()
  );
$$;

comment on function public.has_reached_checkpoint(uuid) is 'True si el usuario actual ha confirmado (vía confirm_checkpoint) haber llegado a este checkpoint (EPIC-05 Bloque H1).';

-- ── target_kind (Bloque B/F) gana un valor: los checkpoints se vuelven comentables
-- (chat del checkpoint) -- pero SOLO visibles/comentables para quien ya lo alcanzó (spoiler
-- guard: el chat de un checkpoint puede destripar la trama más allá de ese punto).
alter type public.target_kind add value 'activity_checkpoint';

-- Postgres exige que un valor nuevo de enum esté COMMITted antes de poder usarse (55P04) --
-- can_view_target() de abajo lo referencia como literal inmediatamente. Mismo idiom que
-- 20260712_club_posts.sql (club_post/comment): sin BEGIN explícito que cerrar, Postgres
-- reabre una transacción implícita para el resto del script.
commit;

-- can_view_target() (Bloque B/F) gana una rama. Las 4 ramas existentes se preservan
-- verbatim (misma definición que 20260712_club_posts.sql) -- solo se añade 'activity_checkpoint'.
-- Requiere is_activity_participant() (haberte unido a la actividad) Y has_reached_checkpoint()
-- (haber confirmado ese checkpoint concreto) -- no basta ser miembro del club ni participante:
-- el spoiler guard es por checkpoint individual, no por actividad.
create or replace function public.can_view_target(p_target_type public.target_kind, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case p_target_type
    when 'diary_entry' then exists (
      select 1 from public.diary_entries d where d.id = p_target_id and public.can_view_profile(d.user_id)
    )
    when 'episode_watch' then exists (
      select 1 from public.episode_watches e where e.id = p_target_id and public.can_view_profile(e.user_id)
    )
    when 'club_post' then exists (
      select 1 from public.club_posts cp where cp.id = p_target_id and public.is_club_member(cp.club_id)
    )
    when 'comment' then exists (
      select 1 from public.comments c where c.id = p_target_id
        and public.can_view_target(c.target_type, c.target_id)
    )
    when 'activity_checkpoint' then exists (
      select 1 from public.club_activity_checkpoints cc
      where cc.id = p_target_id
        and public.is_activity_participant(cc.activity_id)
        and public.has_reached_checkpoint(cc.id)
    )
  end;
$$;

-- ── RPCs SECURITY DEFINER ────────────────────────────────────────────────
-- confirm_checkpoint: revalida server-side contra library_entries.position -- nunca confía
-- en que el cliente solo llame esto cuando de verdad ha llegado. Confirmar el checkpoint N
-- auto-confirma 1..N-1 (idempotente vía on conflict do nothing) -- evita que alguien que
-- saltó directo a un checkpoint tardío se quede sin fila en los anteriores.
create or replace function public.confirm_checkpoint(p_checkpoint_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_order smallint;
  v_target_position jsonb;
  v_item_type public.item_type;
  v_item_id uuid;
  v_item_count int;
  v_user_position jsonb;
begin
  select activity_id, "order", position into v_activity_id, v_order, v_target_position
    from public.club_activity_checkpoints
    where id = p_checkpoint_id;

  if v_activity_id is null then
    raise exception 'not found';
  end if;
  if not public.is_activity_participant(v_activity_id) then
    raise exception 'forbidden';
  end if;

  select count(*) into v_item_count
    from public.club_activity_items
    where activity_id = v_activity_id;
  if v_item_count = 0 then
    raise exception 'no item in activity';
  end if;

  -- buddy_read = exactamente un ítem en el pool (enforce_buddy_read_item_rules lo garantiza
  -- más abajo) -- limit 1 es solo defensivo, no una elección arbitraria entre varios.
  select item_type, item_id into v_item_type, v_item_id
    from public.club_activity_items
    where activity_id = v_activity_id
    limit 1;

  select le.position into v_user_position
    from public.library_entries le
    where le.user_id = auth.uid() and le.item_type = v_item_type and le.item_id = v_item_id;

  if v_user_position is null then
    raise exception 'checkpoint_not_reached';
  end if;

  if v_item_type = 'book' then
    if coalesce((v_user_position->>'page')::numeric, 0) < coalesce((v_target_position->>'page')::numeric, 0) then
      raise exception 'checkpoint_not_reached';
    end if;
  elsif v_item_type = 'series' then
    if row(
      coalesce((v_user_position->>'season')::int, 0),
      coalesce((v_user_position->>'episode')::int, 0)
    ) < row(
      coalesce((v_target_position->>'season')::int, 0),
      coalesce((v_target_position->>'episode')::int, 0)
    ) then
      raise exception 'checkpoint_not_reached';
    end if;
  else
    raise exception 'unsupported item type for buddy_read';
  end if;

  insert into public.club_activity_checkpoint_reads (checkpoint_id, user_id)
  select id, auth.uid()
    from public.club_activity_checkpoints
    where activity_id = v_activity_id and "order" <= v_order
  on conflict (checkpoint_id, user_id) do nothing;
end;
$$;

revoke execute on function public.confirm_checkpoint(uuid) from public, anon;
grant execute on function public.confirm_checkpoint(uuid) to authenticated;

-- reorder_activity_checkpoints: mismo idiom que reorder_queue (20260710_reorder_queue_rpc.sql)
-- -- SECURITY INVOKER, un solo UPDATE con unnest ... with ordinality, sin lógica de
-- autorización propia: la política UPDATE de club_activity_checkpoints (moderator+ en
-- actividad active) ya gatea esto, no hay que duplicarla aquí.
create or replace function public.reorder_activity_checkpoints(p_activity_id uuid, p_checkpoint_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.club_activity_checkpoints cc
  set "order" = t.ord - 1
  from unnest(p_checkpoint_ids) with ordinality as t(id, ord)
  where cc.id = t.id
    and cc.activity_id = p_activity_id;
end;
$$;

revoke execute on function public.reorder_activity_checkpoints(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_activity_checkpoints(uuid, uuid[]) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.club_activity_checkpoints enable row level security;

-- Cualquier miembro del club ve los checkpoints (labels/posiciones, no el chat -- eso lo
-- gatea can_view_target arriba) -- a diferencia de club_activity_opinions (Bloque G, solo
-- participantes), aquí un no-participante necesita verlos para decidir si unirse.
create policy "club_activity_checkpoints select member" on public.club_activity_checkpoints
  for select to authenticated
  using (
    exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and public.is_club_member(ca.club_id)
    )
  );

-- Solo moderator+ del club, y solo mientras la actividad está active -- no se pueden
-- proponer checkpoints antes de activar ni tras finalizar/archivar.
create policy "club_activity_checkpoints insert moderator on active" on public.club_activity_checkpoints
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and ca.status = 'active' and public.has_min_club_role(ca.club_id, 'moderator')
    )
  );

create policy "club_activity_checkpoints update moderator on active" on public.club_activity_checkpoints
  for update to authenticated
  using (
    exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and ca.status = 'active' and public.has_min_club_role(ca.club_id, 'moderator')
    )
  )
  with check (
    exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and ca.status = 'active' and public.has_min_club_role(ca.club_id, 'moderator')
    )
  );

create policy "club_activity_checkpoints delete moderator on active" on public.club_activity_checkpoints
  for delete to authenticated
  using (
    exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id and ca.status = 'active' and public.has_min_club_role(ca.club_id, 'moderator')
    )
  );

alter table public.club_activity_checkpoint_reads enable row level security;

-- Solo SELECT -- sin INSERT/UPDATE/DELETE de cliente a propósito, confirm_checkpoint()
-- (SECURITY DEFINER) es el único camino de escritura (bypassa RLS). Tablero de progreso
-- grupal: cualquier PARTICIPANTE ve las lecturas de TODOS los participantes, no solo la
-- propia -- ver quién va por dónde es el punto de esta tabla.
create policy "club_activity_checkpoint_reads select participant" on public.club_activity_checkpoint_reads
  for select to authenticated
  using (
    exists (
      select 1 from public.club_activity_checkpoints cc
      where cc.id = checkpoint_id and public.is_activity_participant(cc.activity_id)
    )
  );

-- ── Trigger: reglas de buddy_read sobre el pool de ítems compartido ─────────
-- club_activity_items (Bloque G) es genérico entre kinds -- este trigger solo actúa cuando
-- kind='buddy_read' (no-op para tierlist/list_challenge/criteria_challenge, que tendrán sus
-- propias reglas en bloques futuros). buddy_read exige exactamente UN ítem, y solo book o
-- series (un checkpoint de página/temporada-episodio no tiene sentido para una película).
create or replace function public.enforce_buddy_read_item_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.activity_kind;
  v_existing_count int;
begin
  select kind into v_kind from public.club_activities where id = new.activity_id;

  if v_kind is distinct from 'buddy_read' then
    return new;
  end if;

  if new.item_type not in ('book', 'series') then
    raise exception 'buddy_read activities only accept book or series items';
  end if;

  if tg_op = 'INSERT' then
    select count(*) into v_existing_count
      from public.club_activity_items
      where activity_id = new.activity_id;
    if v_existing_count >= 1 then
      raise exception 'buddy_read activities can only have one item';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_buddy_read_item_rules() is 'BEFORE INSERT/UPDATE en club_activity_items (EPIC-05 Bloque H1): para kind=buddy_read exige item_type book/series y como máximo un ítem en el pool. No-op para el resto de kinds -- ver comentario de la función.';

create trigger trg_enforce_buddy_read_item_rules
  before insert or update on public.club_activity_items
  for each row execute function public.enforce_buddy_read_item_rules();


-- ============================================================
-- 20260713_list_challenge.sql (EPIC-05 Bloque H3)
-- ============================================================
-- EPIC-05 Bloque H3 — Reto por lista de ítems (list_challenge). Ver
-- docs/requirements/social-epic.md. Segundo tipo real del motor de actividades de club
-- (Bloque G) sobre el registro por kind (Bloque H1). **Cero tablas nuevas**: la lista vive
-- en club_activity_items (pool genérico de G), las opiniones por ítem en
-- club_activity_opinions (ya completas desde G), y el progreso es 100% DERIVADO de
-- diary_entries -- no se persiste en ningún sitio.
--
-- Este bloque aporta tres cosas a nivel de BD:
--   1. Q8 (auto-añadir a la biblioteca) -- decidido en el backlog hace tiempo, nunca escrito.
--   2. El gate de curación de la lista (creador + moderator+), acotado a list_challenge.
--   3. La lectura del progreso, que NO puede hacerse con el cliente normal (ver más abajo).


-- ── 1. Q8: auto-añadir los ítems del pool a la biblioteca ────────────────────
--
-- Va en TRIGGERS, no en la capa de app (src/lib/clubs/activities/core.ts), por tres razones:
--
--   (a) El backfill inserta filas de library_entries **para OTROS usuarios** (un moderador
--       añade un ítem -> hay que crear la fila de cada participante). El INSERT de
--       library_entries es self-only por RLS ("library entries insert own"), así que
--       cualquier camino desde el cliente sería rechazado -- un objeto SECURITY DEFINER es
--       obligatorio de todas formas. La única pregunta era quién lo llama.
--   (b) Un trigger es ATÓMICO con el insert que lo dispara. Una RPC llamada después desde
--       core.ts puede dejar medio estado si la petición muere entre las dos escrituras.
--   (c) Cubre TODOS los caminos de escritura (kinds futuros, seeds, consola SQL, tests), no
--       solo las dos funciones de core.ts que existen hoy. Consecuencia: core.ts no cambia.
--
-- El invariante que pidió el usuario -- "NUNCA tocar una fila existente" -- no se implementa
-- con lógica de app (read-then-write, con su carrera) sino con el UNIQUE que library_entries
-- ya tiene sobre (user_id, item_type, item_id): `on conflict do nothing`. Si ya tienes el
-- ítem en CUALQUIER estado (incluido 'completed'), la fila queda intacta -- ni el status ni
-- el rating ni updated_at se tocan, y el trigger de updated_at ni siquiera llega a dispararse.
--
-- `tierlist` queda EXCLUIDA (decisión del usuario): una tierlist va de ORDENAR cosas que ya
-- conoces, no es una lista de pendientes -- no debe ensuciar tu biblioteca con 15 películas
-- que solo ibas a puntuar. El resto de kinds sí (buddy_read, list_challenge, y por defecto
-- los futuros).

create or replace function public.autoadd_library_on_activity_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.activity_kind;
begin
  select kind into v_kind from public.club_activities where id = new.activity_id;
  if v_kind = 'tierlist' then
    return new;
  end if;

  insert into public.library_entries (user_id, item_type, item_id, status)
  select new.user_id, i.item_type, i.item_id, 'planned'
    from public.club_activity_items i
   where i.activity_id = new.activity_id
  on conflict (user_id, item_type, item_id) do nothing;  -- Q8: nunca pisa una fila existente

  return new;
end;
$$;

comment on function public.autoadd_library_on_activity_join() is 'AFTER INSERT en club_activity_participants (EPIC-05 Bloque H3, Q8): al unirte a una actividad, los ítems de su pool que no tengas ya en tu biblioteca se añaden como planned. Nunca modifica una fila existente (on conflict do nothing). No actúa en tierlist.';

-- Fan-out: el pool crece DESPUÉS de que la gente se uniera (caso propio de list_challenge,
-- donde un moderador puede seguir curando la lista con el reto ya en marcha) -> backfill a
-- todos los participantes actuales. Este es el caso cross-user que obliga a SECURITY DEFINER.
create or replace function public.autoadd_library_on_activity_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.activity_kind;
begin
  select kind into v_kind from public.club_activities where id = new.activity_id;
  if v_kind = 'tierlist' then
    return new;
  end if;

  insert into public.library_entries (user_id, item_type, item_id, status)
  select p.user_id, new.item_type, new.item_id, 'planned'
    from public.club_activity_participants p
   where p.activity_id = new.activity_id
  on conflict (user_id, item_type, item_id) do nothing;

  return new;
end;
$$;

comment on function public.autoadd_library_on_activity_item() is 'AFTER INSERT en club_activity_items (EPIC-05 Bloque H3, Q8): al añadir un ítem al pool, se crea la fila planned de cada participante que no lo tenga. Cross-user -> de ahí SECURITY DEFINER. No actúa en tierlist.';

-- AFTER INSERT y nunca fallan (`do nothing`) -> jamás hacen fallar un join ni un alta de
-- ítem. enforce_buddy_read_item_rules (Bloque H1) es BEFORE, así que no hay interacción de
-- orden entre ambos. Sin contrapartida en el DELETE de participantes: salir de una actividad
-- NO borra nada de tu biblioteca (no destructivo -- puede que ya hayas empezado el ítem).
create trigger trg_autoadd_library_on_activity_join
  after insert on public.club_activity_participants
  for each row execute function public.autoadd_library_on_activity_join();

create trigger trg_autoadd_library_on_activity_item
  after insert on public.club_activity_items
  for each row execute function public.autoadd_library_on_activity_item();


-- ── 2. Gate de curación de la lista (solo list_challenge) ────────────────────
--
-- La lista ES el enunciado del reto: si cualquier participante la hace crecer a mitad de
-- camino, la meta se mueve bajo los pies de quien ya iba por la mitad. Solo el creador de la
-- actividad y moderator+ del club la curan.
--
-- OJO -- se implementa REESCRIBIENDO la política RLS, no con un trigger (deliberadamente
-- distinto del idiom de enforce_buddy_read_item_rules en Bloque H1): un trigger solo puede
-- RECHAZAR lo que la RLS ya dejó pasar, nunca RELAJAR. Y aquí hace falta relajar, porque la
-- política de G exige is_activity_participant() y solo puedes unirte a una actividad ya
-- 'active' ("club_activity_participants insert self") -- es decir, HOY quien propone una
-- actividad NO PUEDE curar su propia lista hasta que un moderador se la active y él se una.
-- Para list_challenge la condición de participación se SUSTITUYE (no se añade) por
-- creador-o-moderador, lo que además arregla ese agujero: se cura en 'proposed', antes de que
-- exista ningún participante.
--
-- Todos los demás kinds conservan la semántica exacta de G (rama `else`).

drop policy "club_activity_items insert participant" on public.club_activity_items;

create policy "club_activity_items insert participant or curator" on public.club_activity_items
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and case
          when ca.kind = 'list_challenge' then
            ca.created_by = (select auth.uid())
            or public.has_min_club_role(ca.club_id, 'moderator')
          else public.is_activity_participant(ca.id)
        end
    )
  );

-- El DELETE reescrito añade una rama: el creador de un list_challenge puede quitar de SU
-- lista un ítem que metió un moderador. El resto (quien lo añadió, o moderator+) es idéntico
-- a G.
drop policy "club_activity_items delete own or moderate" on public.club_activity_items;

create policy "club_activity_items delete own or moderate or curator" on public.club_activity_items
  for delete to authenticated
  using (
    added_by = (select auth.uid())
    or exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and (
          public.has_min_club_role(ca.club_id, 'moderator')
          or (ca.kind = 'list_challenge' and ca.created_by = (select auth.uid()))
        )
    )
  );


-- ── 3. Ventana del reto ──────────────────────────────────────────────────────
--
-- club_activities.starts_on/ends_on son NULLABLE, a diferencia de challenges.start_date/
-- end_date (§7.10), que son not null -- por eso get-challenge-progress.ts puede hacer gte/lte
-- directo y aquí hace falta una regla de coalesce explícita:
--
--   inicio = coalesce(starts_on, created_at::date)
--            Un pase anterior a la EXISTENCIA del reto no puede contar -- es justo el punto
--            de la decisión de diseño (ver abajo).
--   fin    = coalesce(ends_on, current_date)
--            Reto abierto = sigue contando.
--
-- SECURITY INVOKER a propósito: la política SELECT de club_activities (solo miembros del
-- club, Bloque G) es exactamente el gate que queremos. La RPC de progreso la reutiliza, así
-- que la regla del coalesce existe UNA SOLA VEZ (sin deriva entre SQL y TS).
create or replace function public.list_challenge_window(p_activity_id uuid)
returns table (window_start date, window_end date)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(starts_on, created_at::date), coalesce(ends_on, current_date)
    from public.club_activities
   where id = p_activity_id;
$$;

comment on function public.list_challenge_window(uuid) is 'Ventana temporal efectiva de una actividad (EPIC-05 Bloque H3): coalesce(starts_on, created_at) .. coalesce(ends_on, hoy). Fuente única de la regla -- get_list_challenge_progress la reutiliza.';

revoke execute on function public.list_challenge_window(uuid) from public, anon;
grant execute on function public.list_challenge_window(uuid) to authenticated;


-- ── 4. Progreso del reto ─────────────────────────────────────────────────────
--
-- DECISIÓN DE DISEÑO (supersede el texto original del backlog en E5.H3a, que decía
-- "derivado de library_entries status completed"): un ítem cuenta como hecho para un
-- participante si existe un PASE DE DIARIO suyo (diary_entries) sobre ese ítem con
-- finished_on DENTRO de la ventana del reto -- no basta con tener el ítem en 'completed'.
-- Consecuencia querida: quien ya se leyó el libro el año pasado NO obtiene un tick gratis;
-- registra una relectura (un pase nuevo) durante el reto. Su biblioteca NUNCA se muta: el
-- status sigue 'completed' y solo suma un pase más a su contador de relecturas. Es el mismo
-- mecanismo que el motor de challenges (§7.10, src/lib/challenges/get-challenge-progress.ts),
-- expresado aquí en SQL porque debe correr cross-user (ver abajo).
--
-- SECURITY DEFINER a propósito, y esto es lo importante: diary_entries y library_entries solo
-- son legibles vía can_view_profile(), así que un participante con PERFIL PRIVADO sería
-- INVISIBLE para el resto y su fila del tablero saldría vacía -- un falso negativo silencioso
-- (parecería que no ha completado nada). Esta función ES la política de lectura del tablero:
-- reimplementa la autorización explícitamente (is_activity_participant), materializando en BD
-- la promesa de Q5 -- "unirte a una actividad = consentir compartir tu progreso DENTRO de
-- ella, aunque tu perfil sea privado fuera".
--
-- Devuelve solo las celdas COMPLETADAS (sparse): en una rejilla de 20x8 la mayoría son
-- 'pendiente', y el cliente materializa la matriz completa cruzando el pool con el roster.
create or replace function public.get_list_challenge_progress(p_activity_id uuid)
returns table (user_id uuid, item_type public.item_type, item_id uuid, completed_on date)
language sql
stable
security definer
set search_path = public
as $$
  with act as (
    select ca.id, w.window_start, w.window_end
      from public.club_activities ca
      cross join lateral public.list_challenge_window(ca.id) w
     where ca.id = p_activity_id
       and ca.kind = 'list_challenge'
       and public.is_activity_participant(ca.id)
  )
  select p.user_id, i.item_type, i.item_id, min(d.finished_on) as completed_on
    from act a
    join public.club_activity_participants p on p.activity_id = a.id
    join public.club_activity_items i on i.activity_id = a.id
    join public.library_entries le
      on le.user_id = p.user_id
     and le.item_type = i.item_type
     and le.item_id = i.item_id
    join public.diary_entries d
      on d.library_entry_id = le.id
     and d.user_id = p.user_id
     and d.finished_on between a.window_start and a.window_end
   group by p.user_id, i.item_type, i.item_id;
$$;

comment on function public.get_list_challenge_progress(uuid) is 'Tablero de progreso de un list_challenge (EPIC-05 Bloque H3): por participante y por ítem del pool, la fecha del primer pase de diario terminado dentro de la ventana del reto. SECURITY DEFINER a propósito -- ES la política de lectura del tablero (participantes de perfil privado deben ser visibles a sus compañeros de actividad, Q5). Solo devuelve celdas completadas (sparse).';

revoke execute on function public.get_list_challenge_progress(uuid) from public, anon;
grant execute on function public.get_list_challenge_progress(uuid) to authenticated;


-- ============================================================
-- 20260714_criteria_challenge.sql (EPIC-05 Bloque H4)
-- ============================================================

-- EPIC-05 Bloque H4 — Reto por criterio (criteria_challenge). Ver
-- docs/superpowers/specs/2026-07-13-epic05-bloque-h4-criteria-challenge-design.md
--
-- Cuarto tipo del motor de actividades de club, y **primer consumidor real de
-- club_activities.config** -- el campo jsonb que SD-8 reservó y que ni H1 (buddy_read) ni H3
-- (list_challenge) llegaron a tocar. Cero tablas nuevas: el progreso es 100% derivado de
-- diary_entries, igual que en H3.


-- ── 1. La ventana deja de ser específica de un kind ──────────────────────────
--
-- list_challenge_window() (Bloque H3) calcula coalesce(starts_on, created_at) ..
-- coalesce(ends_on, hoy). H4 necesita exactamente la misma regla, así que se renombra a
-- activity_window() y la regla del coalesce sigue existiendo UNA SOLA VEZ (sin deriva).
-- H3 pasa a llamar al nombre nuevo (src/lib/clubs/activities/list-challenge.ts).
create or replace function public.activity_window(p_activity_id uuid)
returns table (window_start date, window_end date)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(starts_on, created_at::date), coalesce(ends_on, current_date)
    from public.club_activities
   where id = p_activity_id;
$$;

comment on function public.activity_window(uuid) is 'Ventana temporal efectiva de una actividad de club: coalesce(starts_on, created_at) .. coalesce(ends_on, hoy). Fuente única de la regla -- la usan get_list_challenge_progress (H3) y get_activity_diary_passes (H4).';

revoke execute on function public.activity_window(uuid) from public, anon;
grant execute on function public.activity_window(uuid) to authenticated;

-- get_list_challenge_progress (H3) referenciaba list_challenge_window por nombre: se recrea
-- apuntando al nombre nuevo. Cuerpo idéntico por lo demás.
create or replace function public.get_list_challenge_progress(p_activity_id uuid)
returns table (user_id uuid, item_type public.item_type, item_id uuid, completed_on date)
language sql
stable
security definer
set search_path = public
as $$
  with act as (
    select ca.id, w.window_start, w.window_end
      from public.club_activities ca
      cross join lateral public.activity_window(ca.id) w
     where ca.id = p_activity_id
       and ca.kind = 'list_challenge'
       and public.is_activity_participant(ca.id)
  )
  select p.user_id, i.item_type, i.item_id, min(d.finished_on) as completed_on
    from act a
    join public.club_activity_participants p on p.activity_id = a.id
    join public.club_activity_items i on i.activity_id = a.id
    join public.library_entries le
      on le.user_id = p.user_id
     and le.item_type = i.item_type
     and le.item_id = i.item_id
    join public.diary_entries d
      on d.library_entry_id = le.id
     and d.user_id = p.user_id
     and d.finished_on between a.window_start and a.window_end
   group by p.user_id, i.item_type, i.item_id;
$$;

drop function if exists public.list_challenge_window(uuid);


-- ── 2. La RPC lectora del tablero ────────────────────────────────────────────
--
-- SECURITY DEFINER a propósito, por la misma razón que en H3: la RLS de diary_entries/
-- library_entries pasa por can_view_profile(), así que un participante con PERFIL PRIVADO
-- sería invisible para sus compañeros y su fila del leaderboard saldría en 0 -- un falso
-- negativo silencioso. Esta función ES la política de lectura del tablero, y materializa Q5
-- ("unirte a una actividad = consentir compartir tu progreso DENTRO de ella").
--
-- DELIBERADAMENTE TONTA: solo LEE, no cuenta. El filtrado por tipo/género/saga y el conteo
-- se quedan en countForChallenge (src/lib/challenges/match.ts), el mismo motor ya testeado
-- que usa el reto personal (§7.10) -- sin duplicar el matcher en SQL, donde acabaría
-- separándose de la versión TS con el tiempo.
--
-- Escala: devuelve TODOS los pases de los participantes en la ventana, no solo los que casan
-- el criterio. A escala de club (decenas de participantes x decenas de pases) es trivial. Si
-- algún día se volviera caro, el camino de escalada es mover el filtro por item_type (el
-- único que no necesita joins de catálogo) al SQL -- no reescribir el matcher entero.
create or replace function public.get_activity_diary_passes(p_activity_id uuid)
returns table (user_id uuid, item_type public.item_type, item_id uuid, finished_on date)
language sql
stable
security definer
set search_path = public
as $$
  with act as (
    select ca.id, w.window_start, w.window_end
      from public.club_activities ca
      cross join lateral public.activity_window(ca.id) w
     where ca.id = p_activity_id
       and ca.kind = 'criteria_challenge'
       and public.is_activity_participant(ca.id)
  )
  select p.user_id, le.item_type, le.item_id, d.finished_on
    from act a
    join public.club_activity_participants p on p.activity_id = a.id
    join public.library_entries le on le.user_id = p.user_id
    join public.diary_entries d
      on d.library_entry_id = le.id
     and d.user_id = p.user_id
     and d.finished_on between a.window_start and a.window_end;
$$;

comment on function public.get_activity_diary_passes(uuid) is 'Pases de diario crudos de todos los participantes de un criteria_challenge, dentro de la ventana del reto (EPIC-05 Bloque H4). SECURITY DEFINER a propósito -- ES la política de lectura del tablero (los perfiles privados deben ser visibles a sus compañeros de actividad, Q5). Solo lee: el conteo por criterio vive en TS (countForChallenge).';

revoke execute on function public.get_activity_diary_passes(uuid) from public, anon;
grant execute on function public.get_activity_diary_passes(uuid) to authenticated;


-- ── 3. Escribir el criterio (config) ─────────────────────────────────────────
--
-- Bloque G NO dejó ninguna política UPDATE de cliente sobre club_activities ("las
-- transiciones de estado son RPC-only"), así que editar config tiene que ir por RPC, no por
-- un UPDATE gateado por RLS.
--
-- Dos condiciones, revalidadas en servidor:
--   (a) llamante = creador de la actividad O moderator+ del club;
--   (b) status = 'proposed'  -- el criterio se CONGELA al activar: si la meta cambiara a
--       mitad de reto, el progreso de todo el mundo se movería bajo sus pies.
create or replace function public.update_activity_config(p_activity_id uuid, p_config jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_created_by uuid;
  v_status public.activity_status;
begin
  select club_id, created_by, status
    into v_club_id, v_created_by, v_status
    from public.club_activities
   where id = p_activity_id;

  if v_club_id is null then
    raise exception 'not found';
  end if;

  if v_created_by <> auth.uid() and not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;

  if v_status <> 'proposed' then
    raise exception 'config_frozen';
  end if;

  update public.club_activities set config = p_config where id = p_activity_id;
end;
$$;

comment on function public.update_activity_config(uuid, jsonb) is 'Edita club_activities.config (EPIC-05 Bloque H4). Solo creador o moderator+, y solo mientras la actividad esté en proposed -- el criterio se congela al activar. RPC porque Bloque G no dejó política UPDATE de cliente sobre club_activities.';

revoke execute on function public.update_activity_config(uuid, jsonb) from public, anon;
grant execute on function public.update_activity_config(uuid, jsonb) to authenticated;


-- ============================================================
-- 20260714_tierlist.sql (EPIC-05 Bloque H2)
-- ============================================================

-- EPIC-05 Bloque H2 — Tierlist de club. Ver
-- docs/superpowers/specs/2026-07-13-epic05-bloque-h2-tierlist-design.md
--
-- Cuarto y último tipo de actividad de club: cierra el Bloque H.
--
-- Es el ÚNICO tipo del bloque con tabla nueva -- y precisamente por eso es el único que NO
-- necesita ninguna función SECURITY DEFINER. H3 y H4 la necesitaron porque leían
-- diary_entries/library_entries, cuya RLS pasa por can_view_profile(): un participante con
-- perfil privado habría salido vacío para sus compañeros (falso negativo silencioso). Aquí la
-- colocación vive en tabla propia, así que basta acotar su RLS con is_activity_participant()
-- -- el patrón exacto de club_activity_opinions (Bloque G).
--
-- Los tiers viven en club_activities.config (segundo consumidor de ese campo, tras H4) y se
-- congelan al activar reutilizando la RPC update_activity_config, sin cambios.


-- ── 1. Las colocaciones ──────────────────────────────────────────────────────
create table public.club_activity_placements (
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  tier text not null,          -- la ETIQUETA del tier ("S"), no un índice: config es opaco a
                                -- SQL, así que la BD no puede validar contra la lista de tiers.
                                -- Lo valida la app al escribir, y al leer una colocación con un
                                -- tier desconocido se trata como "sin colocar" -- ningún dato
                                -- raro puede romper el tablero.
  position smallint not null,  -- orden dentro de la fila del tier
  created_at timestamptz not null default now(),
  -- La PK compuesta ES la unicidad que pedía el backlog: una colocación por ítem y persona.
  primary key (activity_id, user_id, item_type, item_id)
);

create index idx_club_activity_placements_activity on public.club_activity_placements (activity_id);

comment on table public.club_activity_placements is 'Colocación de cada participante en la tierlist de una actividad (EPIC-05 Bloque H2). Una fila por (actividad, persona, ítem). Visible entre participantes; cada cual solo escribe las suyas. Sin SECURITY DEFINER: al ser tabla propia no hay que saltarse la RLS de perfil, a diferencia de H3/H4.';

alter table public.club_activity_placements enable row level security;

-- Todos los participantes ven las tierlists de todos -- la gracia del bloque es comparar y
-- discutir (mismo criterio que club_activity_opinions, Bloque G).
create policy "club_activity_placements select participant" on public.club_activity_placements
  for select to authenticated
  using (public.is_activity_participant(activity_id));

-- Pero cada cual solo escribe LA SUYA. El caso de riesgo de este bloque es colar el user_id
-- de otro: el `with check` lo corta.
create policy "club_activity_placements insert own" on public.club_activity_placements
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_activity_participant(activity_id)
  );

create policy "club_activity_placements update own" on public.club_activity_placements
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "club_activity_placements delete own" on public.club_activity_placements
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- ── 2. El gate de curación del pool se extiende a tierlist ───────────────────
--
-- El pool ES el enunciado de la tierlist: si cualquier participante lo hace crecer a mitad,
-- las tierlists ya hechas quedan incompletas y hay que volver a colocar. Mismo razonamiento
-- que el reto por lista (H3).
--
-- La política que escribió H3 es kind-scoped ("when ca.kind = 'list_challenge' then ... else
-- is_activity_participant"), así que hay que REESCRIBIRLA para meter tierlist en la rama de
-- curadores. El resto de kinds (buddy_read, criteria_challenge) conserva la semántica de G.
--
-- Recordatorio de por qué es RLS y no un trigger (ver H3): un trigger solo puede RECHAZAR lo
-- que la RLS ya dejó pasar, nunca RELAJAR -- y aquí hace falta relajar, porque la condición de
-- G exige is_activity_participant() y solo puedes unirte a una actividad ya 'active'; sin esta
-- rama, quien propone no podría curar su propio pool en 'proposed'.

drop policy "club_activity_items insert participant or curator" on public.club_activity_items;

create policy "club_activity_items insert participant or curator" on public.club_activity_items
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and case
          when ca.kind in ('list_challenge', 'tierlist') then
            ca.created_by = (select auth.uid())
            or public.has_min_club_role(ca.club_id, 'moderator')
          else public.is_activity_participant(ca.id)
        end
    )
  );

drop policy "club_activity_items delete own or moderate or curator" on public.club_activity_items;

create policy "club_activity_items delete own or moderate or curator" on public.club_activity_items
  for delete to authenticated
  using (
    added_by = (select auth.uid())
    or exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and (
          public.has_min_club_role(ca.club_id, 'moderator')
          or (ca.kind in ('list_challenge', 'tierlist') and ca.created_by = (select auth.uid()))
        )
    )
  );


-- ============================================================
-- 20260710064504 pending_import_rows
-- ============================================================

-- Filas de import sin match automático, guardadas para revisión manual por un
-- colaborador (§7.7/§7.35). El dueño de la fila conserva la propiedad: al
-- resolverse, la entrada de biblioteca se crea para él, no para el revisor.
create type public.pending_import_status as enum ('pending', 'resolved', 'dismissed');

create table public.pending_import_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type public.item_type not null,
  payload jsonb not null,           -- ImportRow serializado
  status public.pending_import_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index pending_import_rows_user_idx on public.pending_import_rows (user_id);
create index pending_import_rows_pending_idx on public.pending_import_rows (status) where status = 'pending';

alter table public.pending_import_rows enable row level security;

-- El dueño ve, crea y descarta sus propias filas.
create policy "pending import select own or collaborator" on public.pending_import_rows
  for select to authenticated
  using ((select auth.uid()) = user_id or public.has_min_role('collaborator'));

create policy "pending import insert own" on public.pending_import_rows
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "pending import delete own" on public.pending_import_rows
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Los colaboradores pueden marcar resueltas/descartadas (cola de revisión).
create policy "pending import update by collaborators" on public.pending_import_rows
  for update to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));

-- Resuelve una fila pendiente creando la entrada de biblioteca (y los pases de
-- diario) PARA EL DUEÑO de la fila, no para el revisor. SECURITY DEFINER porque
-- inserta con un user_id distinto del de auth.uid() (lo que la RLS "insert own"
-- de library_entries no permitiría). El colaborador crea antes el ítem de
-- catálogo y pasa su id aquí.
create or replace function public.resolve_pending_import(
  p_pending_id uuid,
  p_catalog_item_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pending_import_rows;
  v_entry_id uuid;
  v_position jsonb;
  v_date jsonb;
begin
  if not public.has_min_role('collaborator') then
    raise exception 'forbidden';
  end if;

  select * into v_row from public.pending_import_rows
    where id = p_pending_id and status = 'pending';
  if not found then
    raise exception 'pending row not found';
  end if;

  v_position := case
    when v_row.payload->>'bookFormat' is not null
      then jsonb_build_object('format', v_row.payload->>'bookFormat')
    else '{}'::jsonb
  end;

  insert into public.library_entries (user_id, item_type, item_id, status, rating, position)
  values (
    v_row.user_id,
    v_row.item_type,
    p_catalog_item_id,
    coalesce(nullif(v_row.payload->>'status','')::media_status, 'planned'),
    nullif(v_row.payload->>'rating','')::smallint,
    v_position
  )
  on conflict (user_id, item_type, item_id) do update set item_id = excluded.item_id
  returning id into v_entry_id;

  for v_date in
    select * from jsonb_array_elements(coalesce(v_row.payload->'diaryDates', '[]'::jsonb))
  loop
    insert into public.diary_entries (library_entry_id, user_id, started_on, finished_on, rating)
    values (
      v_entry_id,
      v_row.user_id,
      nullif(v_date->>'startedOn','')::date,
      (v_date->>'finishedOn')::date,
      nullif(v_row.payload->>'rating','')::smallint
    );
  end loop;

  update public.pending_import_rows
    set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
    where id = p_pending_id;
end;
$$;

revoke execute on function public.resolve_pending_import(uuid, uuid) from public, anon;
grant execute on function public.resolve_pending_import(uuid, uuid) to authenticated;

-- ============================================================
-- 20260710080927+084009 avatars_storage (el fichero del repo ya refleja el estado final, sin política LIST amplia)
-- ============================================================

-- Avatares alojados en Supabase Storage (§7.9): elimina las URLs externas
-- (mixed content / tracking-pixel) del render de perfil. Bucket público de
-- lectura; cada usuario solo puede escribir en su propia carpeta {uid}/.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Nota: un bucket público sirve sus objetos por URL pública SIN necesidad de
-- una política SELECT sobre storage.objects. No se añade una política SELECT
-- amplia a propósito: permitiría LISTAR el bucket (enumerar {user_id}/…), una
-- fuga menor de información. Solo se conceden escrituras a la carpeta propia.

create policy "avatars insert own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars update own folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars delete own folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ============================================================
-- 20260710083225 reorder_queue_rpc
-- ============================================================

-- Reordenación atómica de la cola (§7.22): un solo UPDATE con unnest ... with
-- ordinality en vez de N updates en paralelo sin transacción (que podían dejar
-- la cola a medias). SECURITY INVOKER: corre con los permisos del usuario, así
-- que la RLS "library entries update own" aplica; además se filtra por
-- user_id = auth.uid() y status = 'planned' para ignorar ids obsoletos.
create or replace function public.reorder_queue(entry_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.library_entries le
  set queue_order = t.ord - 1
  from unnest(entry_ids) with ordinality as t(id, ord)
  where le.id = t.id
    and le.user_id = auth.uid()
    and le.status = 'planned';
end;
$$;

revoke execute on function public.reorder_queue(uuid[]) from public, anon;
grant execute on function public.reorder_queue(uuid[]) to authenticated;

-- ============================================================
-- 20260710165351 typed_annual_goals_and_series_runtime
-- ============================================================

-- Objetivos anuales por tipo de ítem + duración de episodio en el catálogo.
--
-- Contexto (§7.14 revisado): el objetivo anual era un único escalar global
-- (`annual_goal_items`), que mezclaba libros, películas y series. Se segrega en
-- tres, uno por tipo. Se mantienen como columnas de `profiles` —y no como una
-- tabla `user_goals` aparte— por coherencia con la decisión ya documentada en
-- §8-G: los objetivos son escalares del perfil, cubiertos por la RLS de
-- "editar tu perfil".
--
-- El objetivo DIARIO (`daily_goal_minutes`) no se segrega: pasa a significar
-- explícitamente minutos de LECTURA. Las películas no registran sesiones y las
-- series dejan de registrar minutos (ver más abajo), así que un objetivo de
-- minutos solo es medible sobre libros.

alter table public.profiles
  add column annual_goal_books integer,
  add column annual_goal_movies integer,
  add column annual_goal_series integer;

-- El valor global existente contaba ítems de cualquier tipo. No hay forma de
-- repartirlo entre los tres tipos, así que se conserva sobre libros (el caso de
-- uso dominante de la app) y los otros dos quedan sin objetivo. Es una
-- migración con pérdida de intención, no de datos: el usuario reajusta desde
-- /  (formulario de objetivos) si su meta era otra.
update public.profiles
  set annual_goal_books = annual_goal_items
  where annual_goal_items is not null;

alter table public.profiles drop column annual_goal_items;

comment on column public.profiles.daily_goal_minutes is 'Objetivo diario en minutos de LECTURA (solo sesiones de libro; §7.14). NULL = sin objetivo.';
comment on column public.profiles.annual_goal_books is 'Objetivo anual de libros completados (§7.14). NULL = sin objetivo.';
comment on column public.profiles.annual_goal_movies is 'Objetivo anual de películas completadas (§7.14). NULL = sin objetivo.';
comment on column public.profiles.annual_goal_series is 'Objetivo anual de series completadas (§7.14). NULL = sin objetivo.';

-- Duración media de episodio, de TMDB (`episode_run_time`). Sustituye a la
-- estimación de ritmo por sesiones para series (§7.22): las sesiones de serie
-- dejan de registrar minutos, así que la estimación de la cola pasa a ser
-- determinista —episodios × duración de episodio— igual que ya lo era la de
-- películas con `duration_minutes`. Se rellena con el mismo backfill perezoso
-- que `total_episodes` (src/lib/queue/backfill-queue-sizes.ts).
alter table public.series add column episode_runtime_minutes integer;

comment on column public.series.episode_runtime_minutes is 'Duración media de un episodio en minutos, de TMDB (episode_run_time). NULL = desconocida; se rellena con backfill perezoso al entrar en una cola.';

-- ============================================================
-- 20260710165412 multiple_queues
-- ============================================================

-- Colas múltiples nombradas (§7.22 ampliado).
--
-- Contexto: la cola era implícita —"todo lo planificado", ordenado por
-- library_entries.queue_order—. Ahora el usuario puede tener varias colas
-- nombradas y decidir en cuál guarda cada ítem. Modelo elegido: una cola por
-- ítem (columna FK), no una tabla M:N. Un ítem planificado con queue_id NULL es
-- legítimo: "planificado, sin cola asignada" (bucket "Sin cola" en la UI).

create table public.queues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index idx_queues_user on public.queues (user_id, position);

comment on table public.queues is 'Colas de prioridad nombradas por usuario (§7.22). Un library_entry planificado apunta a una vía queue_id (o a ninguna).';

-- Organización personal: solo el dueño ve/gestiona sus colas. No forma parte
-- de la vitrina pública del perfil, misma lógica que el dashboard de
-- estadísticas privado (§8-G). Por eso NO se replica el patrón de tablas
-- "públicas si is_public": una cola nunca es pública.
alter table public.queues enable row level security;

create policy "own queues select" on public.queues
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own queues insert" on public.queues
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own queues update" on public.queues
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "own queues delete" on public.queues
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Pertenencia. on delete set null: borrar una cola no borra los ítems, solo los
-- devuelve al bucket "Sin cola".
alter table public.library_entries
  add column queue_id uuid references public.queues(id) on delete set null;

comment on column public.library_entries.queue_id is 'Cola a la que pertenece este ítem planificado (§7.22). NULL = planificado sin cola. Solo tiene sentido con status=planned; se limpia junto a queue_order al salir de planned.';

-- El orden ahora es denso 0..N-1 DENTRO de cada cola, no global. El índice
-- parcial pasa a incluir queue_id.
drop index if exists idx_library_entries_queue_order;
create index idx_library_entries_queue_order
  on public.library_entries (user_id, queue_id, queue_order)
  where status = 'planned';

-- Backfill: cada usuario con ítems planificados conserva su cola actual como
-- una cola llamada "Mi cola". Los ítems planificados apuntan a ella.
insert into public.queues (user_id, name, position)
select distinct user_id, 'Mi cola', 0
from public.library_entries
where status = 'planned';

update public.library_entries le
set queue_id = q.id
from public.queues q
where q.user_id = le.user_id
  and q.name = 'Mi cola'
  and le.status = 'planned'
  and le.queue_id is null;

-- ============================================================
-- 20260710165432 reorder_queue_into
-- ============================================================

-- Reordenación atómica AMPLIADA a colas múltiples (§7.22).
--
-- La versión previa (reorder_queue(uuid[])) renumeraba una única cola
-- implícita. Con varias colas, arrastrar un ítem de una cola a otra debe (a)
-- fijar su queue_id y (b) renumerar la cola destino, en la MISMA escritura
-- atómica — si no, un fallo entre ambos pasos dejaría el ítem en una cola con
-- un orden de la otra. Nueva firma con la cola destino como primer argumento.
--
-- Cambia la aridad, así que se elimina la sobrecarga anterior para no dejar una
-- resolución ambigua.
drop function if exists public.reorder_queue(uuid[]);

-- target_queue puede ser NULL: reordenar el bucket "Sin cola" (planificados sin
-- cola asignada). Cuando no es NULL, se valida que la cola pertenezca al
-- usuario — una cola ajena no debe poder recibir ítems, ni siquiera con ids
-- propios en el array. SECURITY INVOKER: la RLS "own queues"/"library entries
-- update own" sigue aplicando; el filtro explícito por auth.uid() e ids
-- obsoletos se mantiene.
create or replace function public.reorder_queue(target_queue uuid, entry_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if target_queue is not null
     and not exists (
       select 1 from public.queues q
       where q.id = target_queue and q.user_id = auth.uid()
     ) then
    raise exception 'Queue % does not belong to the current user', target_queue;
  end if;

  update public.library_entries le
  set queue_order = t.ord - 1,
      queue_id = target_queue
  from unnest(entry_ids) with ordinality as t(id, ord)
  where le.id = t.id
    and le.user_id = auth.uid()
    and le.status = 'planned';
end;
$$;

revoke execute on function public.reorder_queue(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_queue(uuid, uuid[]) to authenticated;

-- ============================================================
-- 20260710165449 challenges
-- ============================================================

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

-- ============================================================
-- 20260713212049 checkpoint_due_on
-- ============================================================

-- Fecha objetivo del hito (rediseño de clubes · Paper).
--
-- El feed del club muestra un calendario de "próximos hitos" con fecha ("18 jul
-- · Hito 4 · pág 420"), y hasta ahora un hito solo tenía etiqueta y posición.
-- La posición dice DÓNDE está el hito en la obra; la fecha dice CUÁNDO se
-- espera llegar. Son cosas distintas y el club necesita las dos para
-- calendarizar una lectura conjunta.
--
-- Nullable a propósito: los hitos que ya existen no tienen fecha, y una lectura
-- sin calendario (a ritmo libre) sigue siendo válida.
alter table public.club_activity_checkpoints
  add column due_on date;

comment on column public.club_activity_checkpoints.due_on is
  'Fecha en la que se espera alcanzar el hito. Nullable: una lectura conjunta puede ir a ritmo libre, sin calendario. Alimenta el bloque "próximos hitos" del feed del club.';

-- El feed pide los hitos con fecha más próximos de las actividades activas de
-- un club: se filtra por due_on y se ordena por due_on.
create index idx_checkpoints_due_on
  on public.club_activity_checkpoints (activity_id, due_on)
  where due_on is not null;

-- ============================================================
-- 20260713212115+212247 club_stats (incl. revoke_writes)
-- ============================================================

-- Recuento de miembros por club (rediseño de clubes · Paper).
--
-- El problema: la política "club_members select member" solo deja leer filas de
-- club_members si YA eres miembro de ese club. Perfectamente correcto — la
-- lista de miembros de un club es de sus miembros — pero significa que la
-- pantalla "Descubrir" no puede decir "310 miembros" de un club al que no
-- perteneces, que es justo donde ese dato ayuda a decidir si te unes.
--
-- La solución es la misma que ya usa el proyecto para los perfiles privados
-- (profile_identities): una vista que NO es security_invoker, así que salta la
-- RLS de la tabla base, y que por eso expone SOLO un agregado — un número. De
-- la vista no se puede sacar QUIÉN está en el club, únicamente CUÁNTOS.
create view public.club_stats as
  select
    c.id as club_id,
    (
      select count(*)
      from public.club_members m
      where m.club_id = c.id
        and m.status = 'active'
    )::int as member_count
  from public.clubs c;

comment on view public.club_stats is
  'Recuento de miembros activos por club. Bypassa la RLS de club_members al no ser security_invoker; por eso SOLO expone el agregado (cuántos), nunca la identidad de los miembros (quiénes). Lo necesita "Descubrir": un no-miembro no puede leer club_members, pero sí debe ver cuánta gente hay en un club público.';

-- ── IMPRESCINDIBLE: revoke ANTES del grant. ────────────────────────────────
--
-- Los default privileges del esquema public de Supabase conceden ALL a
-- anon/authenticated sobre cualquier relación nueva. Un `grant select` a secas
-- NO quita nada: se suma. Sin este revoke, anon se queda además con
-- INSERT/UPDATE/DELETE/TRUNCATE sobre la vista.
--
-- Y eso no es cosmético: club_stats es una vista AUTO-ACTUALIZABLE sobre
-- `clubs` (information_schema.views → is_updatable = YES). Como no es
-- security_invoker, una escritura a través de ella correría con los privilegios
-- de su dueño (postgres), y `clubs` tiene RLS activada pero NO forzada — el
-- dueño de una tabla se salta su propia RLS. Es decir: anon podría escribir en
-- `clubs` a través de la vista.
--
-- La vista existe para leer un número. No se le da nada más.
revoke all on public.club_stats from anon, authenticated;
grant select on public.club_stats to anon, authenticated;

-- Cinturón y tirantes: la deja explícitamente de solo lectura, para que un
-- grant accidental futuro no vuelva a abrir la puerta.
alter view public.club_stats set (security_barrier = true);

-- ============================================================
-- 20260713212653 profile_identities_revoke_writes
-- ============================================================

-- SEGURIDAD: profile_identities era escribible por anon.
--
-- Encontrado el 2026-07-13 al aplicar club_stats, que reproducía sin querer el
-- mismo patrón. La vista lleva en producción desde el 11 de julio.
--
-- La cadena completa:
--
--   1. Los default privileges del esquema `public` de Supabase conceden ALL a
--      anon/authenticated sobre CUALQUIER relación nueva. El `grant select` de
--      la migración original (20260711_profile_identities.sql) no quita nada:
--      se SUMA. anon acabó con INSERT/UPDATE/DELETE/TRUNCATE sobre la vista.
--
--   2. profile_identities es una vista AUTO-ACTUALIZABLE sobre `profiles`
--      (information_schema.views → is_updatable = YES, is_insertable_into =
--      YES). No hace falta trigger INSTEAD OF: Postgres reescribe la escritura
--      contra la tabla base.
--
--   3. La vista NO es security_invoker — y eso es deliberado, es lo que le
--      permite leer la identidad de perfiles privados saltándose la RLS de
--      `profiles`. Pero el mismo mecanismo aplica a las ESCRITURAS: se ejecutan
--      con los privilegios del DUEÑO de la vista, que es `postgres`.
--
--   4. `profiles` tiene RLS activada pero NO forzada (relforcerowsecurity =
--      false). El dueño de una tabla se salta su propia RLS salvo que se fuerce.
--
-- Resultado: un cliente ANÓNIMO podía UPDATE / DELETE / TRUNCATE filas de
-- `profiles` a través de la vista, saltándose la RLS por completo.
--
-- El arreglo es el mismo que en club_stats: la vista existe para LEER identidad
-- pública, así que se le quita todo lo demás. `revoke` antes del `grant`, que es
-- lo que faltaba.
revoke all on public.profile_identities from anon, authenticated;
grant select on public.profile_identities to anon, authenticated;

-- Cinturón y tirantes: la deja explícitamente de solo lectura, para que un
-- grant accidental futuro no vuelva a abrir la puerta.
alter view public.profile_identities set (security_barrier = true);

-- ============================================================
-- 20260713220944 propose_with_setup
-- ============================================================

-- Proponer una actividad YA MONTADA (asistente de "Proponer actividad", Paper).
--
-- El diseño quiere que al proponer una actividad elijas su ítem y definas sus
-- hitos en el mismo formulario. Con la RLS actual eso es IMPOSIBLE:
--
--   · club_activity_items: exige is_activity_participant(). Quien propone una
--     actividad recién creada NO es participante de ella todavía. (Salvo en
--     list_challenge, donde el Bloque H3 ya abrió la rama del creador.)
--
--   · club_activity_checkpoints: exige status = 'active' Y moderator+. Una
--     actividad recién propuesta está en 'proposed', así que el insert se
--     deniega SIEMPRE, sin excepción.
--
-- Falta una regla que el modelo no tenía: mientras una actividad está
-- 'proposed', es el BORRADOR de quien la propone. Nadie se ha unido, nadie tiene
-- progreso, nadie la está usando — está esperando a que un moderador la apruebe.
-- Que su autor la monte antes de mandarla no le quita nada a nadie.
--
-- Lo que esta migración NO toca, y es lo importante: la garantía de que a una
-- actividad YA ACTIVA no se le muevan los hitos bajo los pies de quien va por la
-- mitad. Esa sigue igual — 'active' sigue siendo territorio exclusivo de
-- moderator+.

-- ── 1. Ítems: el creador puede sembrar el pool de su propia propuesta ────────
drop policy "club_activity_items insert participant or curator" on public.club_activity_items;

create policy "club_activity_items insert participant or curator" on public.club_activity_items
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and (
          -- NUEVO: tu propia propuesta, mientras siga siendo un borrador.
          (ca.created_by = (select auth.uid()) and ca.status = 'proposed')
          or case
            when ca.kind = 'list_challenge' then
              ca.created_by = (select auth.uid())
              or public.has_min_club_role(ca.club_id, 'moderator')
            else public.is_activity_participant(ca.id)
          end
        )
    )
  );

-- ── 2. Hitos: el creador puede definirlos al proponer ───────────────────────
drop policy "club_activity_checkpoints insert moderator on active" on public.club_activity_checkpoints;

create policy "club_activity_checkpoints insert creator on proposed or moderator on active"
  on public.club_activity_checkpoints
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and (
          -- NUEVO: tu propia propuesta, mientras siga siendo un borrador.
          (ca.created_by = (select auth.uid()) and ca.status = 'proposed')
          -- Lo de antes, intacto: una actividad EN MARCHA solo la tocan los mods.
          or (ca.status = 'active' and public.has_min_club_role(ca.club_id, 'moderator'))
        )
    )
  );

comment on table public.club_activity_checkpoints is
  'Hitos de una lectura conjunta. Se pueden crear en dos momentos: por su autor mientras la actividad está en ''proposed'' (es su borrador, nadie la usa aún), o por un moderator+ una vez ''active''. Un participante normal nunca los crea, y a una actividad activa no se le mueven los hitos salvo por moderación — el progreso de quien va por la mitad depende de ellos.';

-- ============================================================
-- 20260713230111 club_requested_enum
-- ============================================================

-- Estado 'requested' en la membresía de club (solicitudes de entrada, Paper p3).
--
-- Va SOLO en esta migración, sin usarlo: Postgres no deja usar un valor de enum
-- en la misma transacción en la que se añade. La migración que lo consume
-- (20260714_club_join_requests.sql) va después.
--
-- El modelo original decía explícitamente "unirse a un club privado es solo por
-- invitación -- no hay solicitud propia". Esto lo cambia: un club privado pasa a
-- ser VISIBLE pero no LEGIBLE (identidad sí, contenido no), igual que un perfil
-- privado, y desde ahí se puede solicitar entrada.
alter type public.club_member_status add value 'requested';

-- ============================================================
-- 20260713230208 club_join_requests
-- ============================================================

-- Solicitudes de entrada a clubes privados + novedades por club (Paper p3).
--
-- ═════════════════════════════════════════════════════════════════════════════
-- 1 · IDENTIDAD DE CLUB: visible pero no legible
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Hoy `clubs select public or member` niega la fila entera de un club privado a
-- quien no es miembro. Consecuencia: alguien con el enlace de un club privado
-- recibe un 404 — no puede ni comprobar que existe, y mucho menos pedir entrar.
--
-- Se resuelve como ya se resolvió para los perfiles privados: una vista de
-- IDENTIDAD. El club privado pasa a ser visible (nombre, descripción, portada)
-- pero su contenido — posts, actividades, miembros — sigue siendo de sus
-- miembros. Mismo modelo mental que Instagram, y el mismo que ya usa la app.
--
-- Ojo con los grants: los default privileges del esquema public conceden ALL
-- sobre cualquier relación nueva, y `grant select` NO resta. Sin el `revoke`
-- previo, esta vista quedaría escribible por anon — es exactamente el agujero
-- que tuvimos con profile_identities y club_stats. Revoke ANTES del grant.
create view public.club_identities as
  select
    c.id,
    c.slug,
    c.name,
    c.description,
    c.cover_url,
    c.visibility
  from public.clubs c;

comment on view public.club_identities is
  'Identidad pública de CUALQUIER club, incluidos los privados, para la pantalla de "solicitar entrada". Bypassa la RLS de clubs al no ser security_invoker; por eso SOLO contiene columnas de identidad — nunca owner_id ni nada que revele el interior del club. El contenido (posts, actividades, miembros) sigue gateado por is_club_member().';

revoke all on public.club_identities from anon, authenticated;
grant select on public.club_identities to anon, authenticated;
alter view public.club_identities set (security_barrier = true);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2 · SOLICITAR ENTRADA
-- ═════════════════════════════════════════════════════════════════════════════
--
-- La política INSERT actual tiene dos ramas: auto-alta en club PÚBLICO
-- (status='active'), o invitación de un moderator+ (status='invited'). Se añade
-- una tercera: auto-solicitud en club PRIVADO (status='requested').
--
-- 'requested' NO es membresía: is_club_member() solo cuenta 'active', así que
-- una solicitud pendiente no da acceso a nada. Es una fila en la sala de espera.
drop policy "club_members insert self or invite" on public.club_members;

create policy "club_members insert self, request or invite" on public.club_members
  for insert to authenticated
  with check (
    role = 'member'
    and (
      -- Auto-alta en club público: inmediata.
      (
        user_id = (select auth.uid())
        and status = 'active'
        and exists (
          select 1 from public.clubs c
          where c.id = club_id and c.visibility = 'public'
        )
      )
      -- NUEVO. Auto-solicitud en club privado: queda pendiente de moderación.
      -- La condición de visibility='private' es deliberada: en un club público
      -- no hay nada que solicitar, te unes y ya.
      or (
        user_id = (select auth.uid())
        and status = 'requested'
        and exists (
          select 1 from public.clubs c
          where c.id = club_id and c.visibility = 'private'
        )
      )
      -- Invitación de un moderator+.
      or (
        user_id <> (select auth.uid())
        and status = 'invited'
        and public.has_min_club_role(club_id, 'moderator')
      )
    )
  );

-- La política UPDATE de auto-servicio sigue exigiendo status='invited' en su
-- USING, así que quien tiene una solicitud pendiente NO puede auto-aprobarse.
-- No hace falta tocarla — pero conviene dejarlo dicho, porque es la garantía.

-- Aprobar es un cambio de estado que hace OTRA persona sobre TU fila, y no hay
-- (ni queremos) una política UPDATE para moderadores sobre club_members: abriría
-- la puerta a que un moderator+ reescribiera roles a mano. Va por RPC.
create or replace function public.approve_club_join_request(
  p_club_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_min_club_role(p_club_id, 'moderator') then
    raise exception 'not_authorized';
  end if;

  -- Solo promueve filas que estén REALMENTE esperando. Sin este filtro, un
  -- moderador podría "aprobar" a un invitado que aún no aceptó, saltándose su
  -- consentimiento, o reactivar a alguien a quien se expulsó.
  update public.club_members
     set status = 'active'
   where club_id = p_club_id
     and user_id = p_user_id
     and status = 'requested'
     and role = 'member';

  if not found then
    raise exception 'no_pending_request';
  end if;
end;
$$;

revoke all on function public.approve_club_join_request(uuid, uuid) from public, anon;
grant execute on function public.approve_club_join_request(uuid, uuid) to authenticated;

comment on function public.approve_club_join_request is
  'Aprueba una solicitud de entrada: requested -> active. SECURITY DEFINER porque no existe política UPDATE de moderador sobre club_members (a propósito: permitiría reescribir roles). Solo promueve filas en estado requested con role=member, así que no puede usarse para saltarse el consentimiento de un invitado ni para readmitir a un expulsado.';

-- Rechazar una solicitud = borrar la fila. Ya lo cubre la política existente
-- "club_members delete self or moderate": un moderator+ puede borrar filas de
-- rol estrictamente inferior, y una solicitud siempre tiene role='member'.
-- Y quien solicitó puede retirar su propia solicitud (rama user_id = auth.uid()).

-- ═════════════════════════════════════════════════════════════════════════════
-- 3 · NOVEDADES POR CLUB
-- ═════════════════════════════════════════════════════════════════════════════
--
-- "3 novedades" en la tarjeta del club. Hace falta saber hasta dónde has leído.
create table public.club_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, club_id)
);

comment on table public.club_reads is
  'Hasta cuándo ha leído cada persona cada club. Alimenta el contador de novedades. Sin fila = no lo ha abierto nunca desde que se unió, y se cuenta desde joined_at.';

alter table public.club_reads enable row level security;

-- Es tuya y solo tuya: nadie más necesita saber cuándo abriste un club.
create policy "club_reads select own" on public.club_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "club_reads upsert own" on public.club_reads
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "club_reads update own" on public.club_reads
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Recuento de novedades de TODOS tus clubes de una vez.
--
-- security invoker: corre con TUS permisos, así que la RLS de club_posts y
-- club_activities (ambas gateadas por is_club_member) sigue aplicando. No hace
-- falta bypass: solo cuenta clubes de los que YA eres miembro.
--
-- Novedad = post o actividad creada DESPUÉS de tu última lectura y por OTRA
-- persona. Lo tuyo propio no es novedad para ti.
--
-- Sin fila en club_reads se cuenta desde joined_at, no desde el principio de los
-- tiempos: al entrar en un club de 3 años no quieres ver "412 novedades".
create or replace function public.club_unread_counts()
returns table (club_id uuid, unread integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.club_id,
    (
      (
        select count(*)
        from public.club_posts p
        where p.club_id = m.club_id
          and p.author_id <> (select auth.uid())
          and p.created_at > coalesce(r.last_read_at, m.joined_at)
      )
      +
      (
        select count(*)
        from public.club_activities a
        where a.club_id = m.club_id
          and a.created_by <> (select auth.uid())
          and a.created_at > coalesce(r.last_read_at, m.joined_at)
      )
    )::integer as unread
  from public.club_members m
  left join public.club_reads r
    on r.club_id = m.club_id
   and r.user_id = m.user_id
  where m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

revoke all on function public.club_unread_counts() from public, anon;
grant execute on function public.club_unread_counts() to authenticated;

comment on function public.club_unread_counts is
  'Novedades (posts + actividades ajenas y posteriores a tu última lectura) de cada club del que eres miembro activo. security invoker: la RLS de club_posts/club_activities sigue aplicando. Sin fila en club_reads se cuenta desde joined_at, para que entrar en un club antiguo no muestre cientos de novedades.';

-- ============================================================
-- 20260713230254 club_is_private_helper
-- ============================================================

-- Arregla la política de solicitud de entrada, que no podía funcionar.
--
-- La política "club_members insert self, request or invite" comprueba que el
-- club sea privado con un `exists (select 1 from clubs ...)`. Pero las subqueries
-- de una política RLS corren con los permisos de QUIEN LLAMA, y la RLS de `clubs`
-- ("clubs select public or member") NO deja a un no-miembro ver un club privado.
--
-- Resultado: el exists devolvía siempre falso y el insert se denegaba SIEMPRE.
-- La solicitud de entrada era imposible — precisamente para el único caso en el
-- que existe.
--
-- Es la misma trampa por la que el modelo original creó club_member_row_exists():
-- cuando una política necesita mirar una tabla que el llamante no puede leer,
-- hace falta un helper SECURITY DEFINER. Este expone lo mínimo: un booleano de
-- visibilidad, nada más.
create or replace function public.club_is_private(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.visibility = 'private'
  );
$$;

revoke all on function public.club_is_private(uuid) from public, anon;
grant execute on function public.club_is_private(uuid) to authenticated;

comment on function public.club_is_private is
  '¿Es privado este club? SECURITY DEFINER porque la RLS de clubs niega la fila de un club privado a quien no es miembro, y la política de solicitud de entrada necesita justo eso. Expone un booleano y nada más.';

drop policy "club_members insert self, request or invite" on public.club_members;

create policy "club_members insert self, request or invite" on public.club_members
  for insert to authenticated
  with check (
    role = 'member'
    and (
      -- Auto-alta en club público: inmediata.
      (
        user_id = (select auth.uid())
        and status = 'active'
        and exists (
          select 1 from public.clubs c
          where c.id = club_id and c.visibility = 'public'
        )
      )
      -- Auto-solicitud en club privado: queda pendiente de moderación.
      -- Vía helper, porque el llamante NO puede leer la fila del club privado.
      or (
        user_id = (select auth.uid())
        and status = 'requested'
        and public.club_is_private(club_id)
      )
      -- Invitación de un moderator+.
      or (
        user_id <> (select auth.uid())
        and status = 'invited'
        and public.has_min_club_role(club_id, 'moderator')
      )
    )
  );

-- ── Avisar a quien puede resolver la solicitud ───────────────────────────────
--
-- Mismo problema, otra cara: para notificar a los moderadores hay que SABER
-- quiénes son, y "club_members select member" solo deja leer el roster si ya
-- eres miembro. Quien solicita, por definición, no lo es — así que el fan-out
-- desde el cliente leería 0 filas y la notificación se perdería en SILENCIO.
--
-- SECURITY DEFINER, y solo hace una cosa: insertar la notificación a los
-- moderadores del club de la solicitud que ACABAS de hacer tú. No devuelve el
-- roster ni nada que el llamante no debiera ver.
create or replace function public.notify_club_join_request(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo puedes disparar el aviso de TU propia solicitud, y solo si existe.
  if not exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id
      and m.user_id = (select auth.uid())
      and m.status = 'requested'
  ) then
    raise exception 'no_pending_request';
  end if;

  insert into public.notifications (user_id, actor_id, type)
  select m.user_id, (select auth.uid()), 'club_join_request'
  from public.club_members m
  where m.club_id = p_club_id
    and m.status = 'active'
    and m.role in ('moderator', 'owner');
end;
$$;

revoke all on function public.notify_club_join_request(uuid) from public, anon;
grant execute on function public.notify_club_join_request(uuid) to authenticated;

comment on function public.notify_club_join_request is
  'Avisa a los moderadores de un club de que has solicitado entrar. SECURITY DEFINER porque quien solicita no puede leer el roster (no es miembro) y el fan-out desde cliente se perdería en silencio. Exige que la solicitud exista y sea tuya.';

-- ============================================================
-- 20260714 consolidate_activity_items_policies
-- ============================================================

-- Consolida las políticas de club_activity_items (fix de drift, revisión 2026-07-14).
--
-- Historia del problema: la política INSERT se reescribió por drop+recreate en
-- CUATRO migraciones (Bloque G -> H3 -> propose_with_setup -> H2 tierlist), y el
-- orden de APLICACIÓN en producción no coincidió con el orden de los ficheros:
-- tierlist (20260713180350) se aplicó ANTES que propose_with_setup
-- (20260713220944), así que propose_with_setup — que partía del texto de H3 —
-- machacó la rama de curador de tierlist. Estado resultante en prod: el pool de
-- una tierlist ACTIVA lo podía ampliar cualquier participante (rama else),
-- justo lo que H2 quería impedir. Y en el repo, 20260714_tierlist.sql no
-- incluye la rama de borrador de propose_with_setup, así que un replay en orden
-- de fichero rompería el asistente de proponer.
--
-- Esta migración deja la versión FINAL única con las tres ramas:
--   1. Borrador: el creador siembra su propia propuesta mientras está en
--      'proposed' (propose_with_setup).
--   2. Curador: en list_challenge y tierlist, la lista/el pool es el enunciado
--      — solo creador o moderator+ lo curan (H3 + H2).
--   3. Participante: el resto de kinds conserva la semántica de G.
--
-- Lección de proceso: cuando dos ramas tocan la MISMA política, la última en
-- aplicarse debe partir del texto vigente en prod, no del de su rama.

drop policy if exists "club_activity_items insert participant or curator" on public.club_activity_items;

create policy "club_activity_items insert participant or curator" on public.club_activity_items
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and (
          -- Rama 1: tu propia propuesta, mientras siga siendo un borrador.
          (ca.created_by = (select auth.uid()) and ca.status = 'proposed')
          or case
            -- Rama 2: la lista/el pool es el enunciado -> solo curadores.
            when ca.kind in ('list_challenge', 'tierlist') then
              ca.created_by = (select auth.uid())
              or public.has_min_club_role(ca.club_id, 'moderator')
            -- Rama 3: el resto de kinds, semántica original de Bloque G.
            else public.is_activity_participant(ca.id)
          end
        )
    )
  );

-- DELETE: la versión de H2 (tierlist incluida en la rama de curador) ya es la
-- vigente en prod, pero se recrea aquí para que la versión canónica viva en UNA
-- migración y cualquier entorno rezagado converja.
drop policy if exists "club_activity_items delete own or moderate or curator" on public.club_activity_items;

create policy "club_activity_items delete own or moderate or curator" on public.club_activity_items
  for delete to authenticated
  using (
    added_by = (select auth.uid())
    or exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and (
          public.has_min_club_role(ca.club_id, 'moderator')
          or (ca.kind in ('list_challenge', 'tierlist') and ca.created_by = (select auth.uid()))
        )
    )
  );

-- ============================================================
-- 20260714 club_share_ownership
-- ============================================================

-- SEGURIDAD: compartir a un club solo concede visibilidad sobre filas PROPIAS
-- (revisión 2026-07-14).
--
-- El agujero: is_visible_via_club_share() añade un OR a las políticas SELECT de
-- diary_entries / episode_watches / library_entries / progress_sessions que
-- concede lectura a cualquier miembro del club cuyo post activity_share
-- referencie la fila — y el `ref` {sourceTable, rowId} lo escribía el CLIENTE
-- sin validación alguna (createShareActivityPost inserta lo que llegue). Un
-- usuario podía crear un club propio, insertar un post con el rowId de una fila
-- privada AJENA, y leerla. La única mitigación era que los UUIDs no se adivinan
-- — pero los ids circulan (FeedEvent.id lleva `sourceTable:rowId`).
--
-- El arreglo tiene dos capas:
--
--   1. La política es la garantía: is_visible_via_club_share() gana un tercer
--      parámetro p_owner_id y exige cp.author_id = p_owner_id — un post solo
--      puede dar visibilidad de club a filas DE SU PROPIO AUTOR. Es exactamente
--      la semántica de diseño ("compartir a un club es una elección explícita
--      de audiencia" — del dueño del contenido; el picker de la UI,
--      loadOwnRecentActivity, solo ofrece actividad propia).
--
--   2. El trigger da el error claro: valida en el INSERT que el ref tenga la
--      forma canónica y apunte a una fila del propio autor, en vez de aceptar
--      basura que luego fallaría en silencio al renderizar.
--
-- En prod hay 0 posts activity_share, así que no hay datos que migrar.

-- ── 1. Nueva firma de la función (owner-aware) ──────────────────────────────
create or replace function public.is_visible_via_club_share(
  p_source_table text,
  p_row_id uuid,
  p_owner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_posts cp
    where cp.kind = 'activity_share'
      and cp.ref->>'sourceTable' = p_source_table
      and cp.ref->>'rowId' = p_row_id::text
      and cp.author_id = p_owner_id
      and public.is_club_member(cp.club_id)
  );
$$;

comment on function public.is_visible_via_club_share(text, uuid, uuid) is 'True si p_row_id de p_source_table fue compartido como activity_share en un club del que el usuario actual es miembro, Y el autor del post es el dueño de la fila (p_owner_id). El check de autor cierra el agujero de autoconcederse visibilidad sobre filas ajenas insertando un ref manipulado (revisión 2026-07-14).';

revoke all on function public.is_visible_via_club_share(text, uuid, uuid) from public;
grant execute on function public.is_visible_via_club_share(text, uuid, uuid) to anon, authenticated;

-- ── 2. Recablear las 4 políticas a la firma nueva ───────────────────────────
drop policy "diary entries select visible" on public.diary_entries;
create policy "diary entries select visible" on public.diary_entries
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('diary_entries', id, user_id)
  );

drop policy "episode_watches select visible" on public.episode_watches;
create policy "episode_watches select visible" on public.episode_watches
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('episode_watches', id, user_id)
  );

drop policy "library entries select visible" on public.library_entries;
create policy "library entries select visible" on public.library_entries
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('library_entries', id, user_id)
  );

drop policy "progress sessions select visible" on public.progress_sessions;
create policy "progress sessions select visible" on public.progress_sessions
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('progress_sessions', id, user_id)
  );

-- Sin dependientes ya: fuera la firma antigua (sin owner check).
drop function public.is_visible_via_club_share(text, uuid);

-- ── 3. Validación del ref en el INSERT ──────────────────────────────────────
-- SECURITY INVOKER a propósito: el trigger lee la fila origen bajo la RLS del
-- llamante, y una fila PROPIA siempre es visible para su dueño — si el exists
-- falla es que la fila no existe o no es tuya, que es exactamente lo que hay
-- que rechazar. La política INSERT de club_posts ya fuerza author_id = auth.uid().
create or replace function public.validate_club_post_ref()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source text;
  v_row uuid;
  v_owned boolean;
begin
  if new.kind <> 'activity_share' then
    -- ref es exclusivo de activity_share; en el resto de kinds no significa
    -- nada y dejarlo pasar solo invita a datos basura.
    if new.ref is not null then
      raise exception 'ref_only_for_activity_share';
    end if;
    return new;
  end if;

  if new.ref is null then
    raise exception 'ref_required';
  end if;

  v_source := new.ref->>'sourceTable';
  begin
    v_row := (new.ref->>'rowId')::uuid;
  exception when others then
    raise exception 'invalid_ref';
  end;

  v_owned := case v_source
    when 'diary_entries' then exists (
      select 1 from public.diary_entries where id = v_row and user_id = new.author_id
    )
    when 'episode_watches' then exists (
      select 1 from public.episode_watches where id = v_row and user_id = new.author_id
    )
    when 'library_entries' then exists (
      select 1 from public.library_entries where id = v_row and user_id = new.author_id
    )
    when 'progress_sessions' then exists (
      select 1 from public.progress_sessions where id = v_row and user_id = new.author_id
    )
    else null
  end;

  if v_owned is distinct from true then
    raise exception 'invalid_ref';
  end if;

  -- Normaliza a la forma canónica: exactamente las dos claves, sin extras.
  new.ref := jsonb_build_object('sourceTable', v_source, 'rowId', v_row::text);
  return new;
end;
$$;

comment on function public.validate_club_post_ref() is 'BEFORE INSERT en club_posts: para kind=activity_share exige que ref sea {sourceTable, rowId} válido y que la fila referenciada pertenezca al AUTOR del post; para el resto de kinds exige ref null. La garantía de lectura es is_visible_via_club_share (que revalida el autor); esto da el error claro en el alta (revisión 2026-07-14).';

create trigger trg_validate_club_post_ref
  before insert on public.club_posts
  for each row execute function public.validate_club_post_ref();

-- ── 4. El índice que sostiene el OR de las políticas ────────────────────────
-- is_visible_via_club_share se evalúa POR FILA candidata en las 4 tablas más
-- consultadas de la app, y club_posts no tenía ningún índice sobre ref -> seq
-- scan por fila. Índice de expresión, parcial a los posts que importan.
create index idx_club_posts_share_ref
  on public.club_posts ((ref->>'sourceTable'), (ref->>'rowId'))
  where kind = 'activity_share';

-- ============================================================
-- 20260714 text_length_limits
-- ============================================================

-- Límites de longitud en texto de usuario + formato de clubs.slug
-- (revisión 2026-07-14).
--
-- Ningún campo de texto libre tenía tope: cualquier autenticado podía insertar
-- megabytes por fila (y el feed / getInteractionSummary traen los cuerpos
-- completos). Los CHECKs son la garantía; las server actions añaden su propia
-- validación para dar errores legibles antes de llegar aquí.
--
-- Límites holgados a propósito (ninguna fila de prod se acerca; verificado con
-- max(char_length()) antes de escribir esto): el objetivo es cortar el abuso,
-- no acotar la escritura legítima.

alter table public.comments
  add constraint comments_body_len check (char_length(body) <= 2000);

alter table public.club_posts
  add constraint club_posts_body_len check (char_length(body) <= 5000);

alter table public.diary_entries
  add constraint diary_entries_review_len check (review is null or char_length(review) <= 10000);

alter table public.episode_watches
  add constraint episode_watches_review_len check (review is null or char_length(review) <= 10000);

alter table public.profiles
  add constraint profiles_bio_len check (bio is null or char_length(bio) <= 500),
  add constraint profiles_display_name_len check (display_name is null or char_length(display_name) <= 80);

alter table public.library_entries
  add constraint library_entries_notes_len check (notes is null or char_length(notes) <= 2000);

alter table public.progress_sessions
  add constraint progress_sessions_note_len check (note is null or char_length(note) <= 2000);

-- clubs.slug se usa como segmento de ruta /club/[slug] y solo se saneaba en el
-- onChange del formulario (cliente). Mismo trato que profiles.username_format.
alter table public.clubs
  add constraint clubs_slug_format check (slug ~ '^[a-z0-9-]{3,40}$'),
  add constraint clubs_name_len check (char_length(name) between 1 and 80),
  add constraint clubs_description_len check (description is null or char_length(description) <= 2000);

alter table public.club_activities
  add constraint club_activities_title_len check (char_length(title) between 1 and 120),
  add constraint club_activities_description_len check (description is null or char_length(description) <= 2000);

alter table public.club_activity_checkpoints
  add constraint club_activity_checkpoints_label_len check (char_length(label) between 1 and 120);

alter table public.club_activity_opinions
  add constraint club_activity_opinions_comment_len check (comment is null or char_length(comment) <= 2000);

alter table public.club_poll_options
  add constraint club_poll_options_label_len check (char_length(label) between 1 and 120);

alter table public.challenges
  add constraint challenges_name_len check (char_length(name) between 1 and 120);

alter table public.queues
  add constraint queues_name_len check (char_length(name) between 1 and 80);

-- ============================================================
-- 20260714 enrich_only_and_hardening
-- ============================================================

-- Endurecimiento del catálogo enriquecible + higiene de funciones e índices
-- (revisión 2026-07-14).

-- ── 1. series_episodes: fuera el UPDATE abierto ──────────────────────────────
-- La política "series_episodes updatable" era using(true)/check(true) para
-- cualquier autenticado — vandalismo trivial de títulos/sinopsis de episodios.
-- La app NUNCA actualiza esta tabla (ensure-series-episodes solo INSERTa, el
-- backfill de tamaños toca `series`, no `series_episodes`), así que el UPDATE
-- sobra entero.
drop policy "series_episodes updatable" on public.series_episodes;
revoke update on public.series_episodes from anon, authenticated;

-- ── 2. people: enriquecer es RELLENAR, no sobrescribir ───────────────────────
-- El grant de columna (bio, photo_url, birth_date, death_date, place_of_birth)
-- + la política using(true) dejaban a cualquier autenticado REESCRIBIR la bio
-- de cualquier persona. El único UPDATE legítimo de la app (enrichTmdbBio en
-- get-person.ts) solo corre cuando bio IS NULL — es decir, solo rellena campos
-- vacíos. Este trigger convierte esa convención en regla: un valor no-NULL solo
-- lo cambia un collaborator+.
--
-- auth.uid() IS NULL => contexto sin usuario (service_role / SQL del owner, que
-- ya bypassan RLS) — se deja pasar, mismo idiom que enforce_role_change_admin_only.
create or replace function public.enforce_people_enrich_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.has_min_role('collaborator') then
    return new;
  end if;

  if (old.bio is not null and new.bio is distinct from old.bio)
     or (old.photo_url is not null and new.photo_url is distinct from old.photo_url)
     or (old.birth_date is not null and new.birth_date is distinct from old.birth_date)
     or (old.death_date is not null and new.death_date is distinct from old.death_date)
     or (old.place_of_birth is not null and new.place_of_birth is distinct from old.place_of_birth)
  then
    raise exception 'people fields can only be filled in, not overwritten';
  end if;

  return new;
end;
$$;

comment on function public.enforce_people_enrich_only() is 'BEFORE UPDATE en people: el cache-as-you-go solo puede RELLENAR campos NULL (bio/foto/fechas); cambiar un valor existente exige collaborator+. Cierra el vector de vandalismo del grant de columna abierto (revisión 2026-07-14).';

create trigger trg_enforce_people_enrich_only
  before update on public.people
  for each row execute function public.enforce_people_enrich_only();

-- ── 3. Higiene: las funciones de trigger no son RPCs ─────────────────────────
-- El grant implícito a PUBLIC las dejaba invocables vía /rest/v1/rpc/ (advisor
-- anon_security_definer_function_executable). Ninguna es llamable fuera de su
-- trigger (PostgREST fallaría con "trigger functions can only be called as
-- triggers"), pero no hay razón para exponerlas.
revoke execute on function public.autoadd_library_on_activity_join() from public, anon, authenticated;
revoke execute on function public.autoadd_library_on_activity_item() from public, anon, authenticated;
revoke execute on function public.enforce_buddy_read_item_rules() from public, anon, authenticated;
revoke execute on function public.enforce_club_owner_change_authorized() from public, anon, authenticated;
revoke execute on function public.reassign_club_ownership() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.enforce_people_enrich_only() from public, anon, authenticated;
revoke execute on function public.validate_club_post_ref() from public, anon, authenticated;

-- ── 4. Índices para FKs calientes (advisor 0001) ─────────────────────────────
-- Solo los dos con camino de borrado/consulta real: borrar una opción de
-- encuesta (cascade desde club_poll_options) y borrar una cola (on delete set
-- null sobre library_entries.queue_id — el índice parcial de la cola ordena por
-- (user_id, queue_id, queue_order), que no cubre el lookup puro por queue_id).
create index idx_club_poll_votes_option on public.club_poll_votes (option_id);
create index idx_library_entries_queue on public.library_entries (queue_id) where queue_id is not null;

-- ============================================================
-- 20260714_editions.sql
-- ============================================================

-- Ediciones de libro y versiones de película.
--
-- La obra sigue siendo books/movies (título, autoría, sinopsis, géneros); la
-- edición aporta lo que varía entre tiradas: editorial, ISBN, idioma, páginas
-- (o duración y corte, en película). Un pase apunta a una edición, así que
-- "voy por la página 240 de 662" solo es cierto contra la edición que estás
-- leyendo: la de bolsillo tiene 880. Las series no tienen ediciones — su
-- unidad de progreso son los episodios.

create table public.book_editions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  publisher text check (char_length(publisher) <= 120),
  published_year integer check (published_year between 1400 and 2200),
  language text check (char_length(language) <= 10),
  total_pages integer check (total_pages between 1 and 20000),
  isbn text check (char_length(isbn) <= 20),
  cover_url text,
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.movie_versions (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  release_year integer check (release_year between 1870 and 2200),
  duration_minutes integer check (duration_minutes between 1 and 1200),
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Una sola edición primaria por obra.
create unique index book_editions_one_primary
  on public.book_editions (book_id) where is_primary;
create unique index movie_versions_one_primary
  on public.movie_versions (movie_id) where is_primary;

create index book_editions_book_id_idx on public.book_editions (book_id);
create index movie_versions_movie_id_idx on public.movie_versions (movie_id);

-- Backfill: cada obra existente engendra su edición primaria con los datos que
-- hoy lleva sueltos en la ficha. Las columnas viejas de books/movies siguen ahí
-- como espejo hasta una limpieza posterior, para poder revertir sin pérdida.
--
-- SANEANDO al copiar, que esto no es paranoia: `books` no valida nada y estas
-- tablas sí, y en producción hay 19 libros con total_pages = 0 (Google Books
-- devuelve `pageCount: 0` a manta). Sin el saneo, el CHECK reventaría este
-- INSERT y la migración entera se caería a medias. Cero páginas no es "cero
-- páginas": es "no lo sé", o sea NULL.
insert into public.book_editions (book_id, label, publisher, published_year, total_pages, isbn, cover_url, is_primary)
select id, 'Edición principal', publisher,
       case when published_year between 1400 and 2200 then published_year end,
       case when total_pages between 1 and 20000 then total_pages end,
       case when char_length(isbn) <= 20 then isbn end,
       cover_url, true
from public.books;

insert into public.movie_versions (movie_id, label, release_year, duration_minutes, is_primary)
select id, 'Versión principal',
       case when release_year between 1870 and 2200 then release_year end,
       case when duration_minutes between 1 and 1200 then duration_minutes end,
       true
from public.movies;

alter table public.book_editions enable row level security;
alter table public.movie_versions enable row level security;

-- Catálogo compartido: lectura pública; crear y editar es curación → colaborador+,
-- igual que asignar sagas (§7.35).
create policy "book_editions readable by all"
  on public.book_editions for select using (true);
create policy "book_editions insertable by collaborators"
  on public.book_editions for insert to authenticated
  with check (public.current_user_role() in ('collaborator', 'admin'));
create policy "book_editions updatable by collaborators"
  on public.book_editions for update to authenticated
  using (public.current_user_role() in ('collaborator', 'admin'))
  with check (public.current_user_role() in ('collaborator', 'admin'));

create policy "movie_versions readable by all"
  on public.movie_versions for select using (true);
create policy "movie_versions insertable by collaborators"
  on public.movie_versions for insert to authenticated
  with check (public.current_user_role() in ('collaborator', 'admin'));
create policy "movie_versions updatable by collaborators"
  on public.movie_versions for update to authenticated
  using (public.current_user_role() in ('collaborator', 'admin'))
  with check (public.current_user_role() in ('collaborator', 'admin'));

-- Grants por columna: nadie escribe is_primary ni created_at desde el cliente
-- (la primaria la fija el backfill / una migración, no un usuario).
grant select on public.book_editions to anon, authenticated;
grant select on public.movie_versions to anon, authenticated;
grant insert (book_id, label, publisher, published_year, language, total_pages, isbn, cover_url, created_by)
  on public.book_editions to authenticated;
grant update (label, publisher, published_year, language, total_pages, isbn, cover_url)
  on public.book_editions to authenticated;
grant insert (movie_id, label, release_year, duration_minutes, created_by)
  on public.movie_versions to authenticated;
grant update (label, release_year, duration_minutes)
  on public.movie_versions to authenticated;

-- ============================================================
-- 20260714_editions_b_primary.sql
-- ============================================================

-- La edición primaria la fija la base de datos, no la app.
--
-- El backfill de 20260714_editions.sql solo cubrió las obras que YA existían.
-- Una obra que entra nueva al catálogo (desde la búsqueda) se quedaría sin
-- edición primaria, y una película nueva sin ninguna versión. La app no puede
-- arreglarlo por su cuenta: `is_primary` está fuera de los grants por columna,
-- precisamente para que un usuario no decida cuál es la edición canónica.
--
-- Ojo con el orden de estos ficheros: las migraciones se aplican en orden
-- alfabético, así que el sufijo `_b_` no es decorativo — este fichero DEBE ir
-- después de 20260714_editions.sql y antes de 20260714_editions_c_register.sql.

-- Los datos vienen de APIs externas y llegan sucios: Google Books devuelve
-- `pageCount: 0` a menudo, y 0 páginas no es "cero páginas", es "no lo sé".
-- `books` no valida nada, pero `book_editions` sí, así que hay que sanear al
-- copiar o el CHECK reventaría el alta de la obra.
create or replace function public.sane_int(v integer, lo integer, hi integer)
returns integer language sql immutable as $$
  select case when v between lo and hi then v end;
$$;

create or replace function public.create_primary_book_edition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.book_editions
    (book_id, label, publisher, published_year, total_pages, isbn, cover_url, is_primary)
  values
    (new.id, 'Edición principal', new.publisher,
     public.sane_int(new.published_year, 1400, 2200),
     public.sane_int(new.total_pages, 1, 20000),
     case when char_length(coalesce(new.isbn, '')) <= 20 then new.isbn end,
     new.cover_url, true)
  on conflict do nothing;
  return new;
exception when others then
  -- La obra manda: si su edición primaria no se puede crear, que nazca igual.
  -- Sin esto, un libro con 0 páginas era imposible de añadir al catálogo: el
  -- check_violation abortaba la transacción entera del INSERT en books.
  raise warning 'edicion primaria omitida para el libro %: %', new.id, sqlerrm;
  return new;
end;
$$;

create or replace function public.create_primary_movie_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.movie_versions
    (movie_id, label, release_year, duration_minutes, is_primary)
  values
    (new.id, 'Versión principal',
     public.sane_int(new.release_year, 1870, 2200),
     public.sane_int(new.duration_minutes, 1, 1200),
     true)
  on conflict do nothing;
  return new;
exception when others then
  raise warning 'version primaria omitida para la pelicula %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- Red de seguridad: si la obra todavía no tiene primaria, la edición que entre
-- pasa a serlo. Va en un BEFORE INSERT porque escribe sobre la propia fila
-- (NEW), y así esquiva limpiamente el grant por columna: el usuario no menciona
-- `is_primary` en su INSERT, lo pone el trigger.
create or replace function public.ensure_primary_book_edition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.book_editions where book_id = new.book_id and is_primary
  ) then
    new.is_primary := true;
  end if;
  return new;
end;
$$;

create or replace function public.ensure_primary_movie_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.movie_versions where movie_id = new.movie_id and is_primary
  ) then
    new.is_primary := true;
  end if;
  return new;
end;
$$;

drop trigger if exists books_create_primary_edition on public.books;
drop trigger if exists movies_create_primary_version on public.movies;
drop trigger if exists book_editions_ensure_primary on public.book_editions;
drop trigger if exists movie_versions_ensure_primary on public.movie_versions;

create trigger books_create_primary_edition
  after insert on public.books
  for each row execute function public.create_primary_book_edition();

create trigger movies_create_primary_version
  after insert on public.movies
  for each row execute function public.create_primary_movie_version();

create trigger book_editions_ensure_primary
  before insert on public.book_editions
  for each row execute function public.ensure_primary_book_edition();

create trigger movie_versions_ensure_primary
  before insert on public.movie_versions
  for each row execute function public.ensure_primary_movie_version();

-- ============================================================
-- 20260714_editions_c_register.sql
-- ============================================================

-- Alta de edición desde la búsqueda.
--
-- Crear una edición A MANO es curación y exige colaborador+ (20260714_editions.sql).
-- Pero cuando alguien añade un libro desde la búsqueda ya ha elegido un ISBN
-- concreto en Google Books: ese dato viene de una fuente de catálogo. Sin una
-- vía para registrarlo, la edición que de verdad tiene el usuario en la mano
-- nunca entraría en la ficha.
--
-- La vía NO es abrir el INSERT a cualquiera (se probó: dejaba escribir
-- editorial, portada y páginas inventadas en cualquier libro con solo poner
-- diez caracteres en `isbn`). Es esta función: valida el ISBN de verdad, sanea
-- lo que venga fuera de rango, y firma quién la llamó. El INSERT directo sigue
-- reservado a colaborador+.
--
-- Riesgo residual asumido: un usuario autenticado puede llamar a la RPC a mano
-- con un ISBN de checksum válido y adjuntar una edición inventada a un libro
-- ajeno. No es escalada de privilegios y queda firmado en `created_by`, así que
-- es reversible; si algún día hay spam, se sube el listón (rate limit o cola de
-- revisión). No merece más maquinaria hoy.

-- Dos usuarios añadiendo el mismo ISBN a la vez no deben crear dos filas.
create unique index book_editions_isbn_unique
  on public.book_editions (book_id, isbn) where isbn is not null;

create or replace function public.register_book_edition(
  p_book_id uuid,
  p_isbn text,
  p_label text default 'Edición',
  p_publisher text default null,
  p_year integer default null,
  p_pages integer default null,
  p_cover_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text;
  v_id uuid;
  v_sum integer := 0;
  v_i integer;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  v_digits := regexp_replace(coalesce(p_isbn, ''), '[^0-9Xx]', '', 'g');

  -- Dígito de control: un ISBN mal formado no entra en el catálogo compartido.
  if char_length(v_digits) = 13 then
    for v_i in 1..12 loop
      v_sum := v_sum + (substr(v_digits, v_i, 1))::integer
                       * case when v_i % 2 = 0 then 3 else 1 end;
    end loop;
    if ((10 - (v_sum % 10)) % 10)::text <> substr(v_digits, 13, 1) then
      raise exception 'invalid isbn13';
    end if;
  elsif char_length(v_digits) = 10 then
    for v_i in 1..9 loop
      v_sum := v_sum + (substr(v_digits, v_i, 1))::integer * (11 - v_i);
    end loop;
    v_sum := v_sum + case when upper(substr(v_digits, 10, 1)) = 'X' then 10
                          else (substr(v_digits, 10, 1))::integer end;
    if v_sum % 11 <> 0 then
      raise exception 'invalid isbn10';
    end if;
  else
    raise exception 'invalid isbn length';
  end if;

  insert into public.book_editions
    (book_id, label, publisher, published_year, total_pages, isbn, cover_url, created_by)
  values
    (p_book_id, coalesce(nullif(trim(p_label), ''), 'Edición'), p_publisher,
     public.sane_int(p_year, 1400, 2200), public.sane_int(p_pages, 1, 20000),
     v_digits, p_cover_url, auth.uid())
  on conflict do nothing
  returning id into v_id;

  return v_id;  -- null si ya existía: el alta es idempotente
end;
$$;

revoke all on function public.register_book_edition(uuid, text, text, text, integer, integer, text) from public;
grant execute on function public.register_book_edition(uuid, text, text, text, integer, integer, text) to authenticated;

-- ============================================================
-- 20260714_editions_d_sync.sql
-- ============================================================

-- La work key de OpenLibrary, que es lo que hace falta para pedir las ediciones
-- de una obra (/works/OL...W/editions.json).
--
-- Hoy se guarda —a medias— en `books.google_books_id`, una columna cuyo nombre
-- miente: el proyecto migró de Google Books a OpenLibrary y la columna se quedó
-- con el nombre viejo. En producción hay 80 libros con una work key ahí dentro,
-- 146 con IDs antiguos de Google Books y 10 sin nada. Así que se separa en una
-- columna honesta y se hace backfill de los que ya la tienen; para el resto, la
-- work key se resolverá por ISBN la primera vez que alguien abra su ficha.
--
-- `editions_synced_at` es la marca del cache-as-you-go: si está puesta, ya se
-- preguntó por las ediciones de este libro y no se vuelve a preguntar — ni
-- siquiera si la respuesta fue "no hay ninguna". Sin esa marca, una obra sin
-- ediciones en OpenLibrary pagaría una llamada en cada visita a su ficha.
alter table public.books
  add column openlibrary_work_key text,
  add column editions_synced_at timestamptz;

update public.books
   set openlibrary_work_key = google_books_id
 where google_books_id like '/works/%';

create index books_openlibrary_work_key_idx
  on public.books (openlibrary_work_key) where openlibrary_work_key is not null;

-- La app escribe ambas columnas al sincronizar (cache-as-you-go con la sesión
-- del usuario que navega, como el resto del enriquecimiento de catálogo).
grant update (openlibrary_work_key, editions_synced_at)
  on public.books to authenticated;

-- ============================================================
-- 20260714_editions_e_sync_rls.sql
-- ============================================================

-- Falta una policy de UPDATE en `books` para que el cache-as-you-go de
-- ediciones (Tarea 6, src/lib/editions/sync-editions.ts) pueda persistir.
--
-- 20260714_editions_d_sync.sql ya concedió el GRANT de columna
-- (`openlibrary_work_key`, `editions_synced_at`) a `authenticated`, pero un
-- GRANT no basta con RLS activado: sin una POLICY de UPDATE, Postgres filtra
-- la fila a actualizar a cero silenciosamente (no lanza error). Verificado en
-- dev: la RPC register_book_edition (security definer) SÍ inserta ediciones
-- reales con normalidad, pero el UPDATE directo a `books` desde el cliente
-- nunca toca ninguna fila — `editions_synced_at` se queda en null para
-- siempre y cada visita a la ficha repite la llamada a OpenLibrary, que es
-- justo lo que la Tarea 6 quería evitar.
--
-- De paso se cierra un grant más amplio de lo previsto: `books` tenía UPDATE
-- concedido en TODAS sus columnas a `anon` y `authenticated` (nunca se le
-- aplicó el revoke+grant acotado por columnas que sí recibieron movies/
-- series/people en 20260709230750_fix_catalog_rls_policies — books no
-- existía aún en esa migración). Sin una policy quedaba inerte igualmente,
-- pero conviene cerrarlo ahora: mismo patrón que las otras tres tablas.
revoke update on public.books from anon, authenticated;
grant update (openlibrary_work_key, editions_synced_at)
  on public.books to authenticated;

create policy "books editions sync updatable" on public.books
  for update to authenticated using (true) with check (true);

-- ============================================================
-- 20260714_editions_f_delete_guard.sql
-- ============================================================

-- No se puede borrar una edición que alguien está leyendo.
--
-- `diary_entries.edition_id` es polimórfico (apunta a book_editions O a
-- movie_versions según el tipo del ítem), así que NO admite una clave ajena. La
-- protección va en un trigger, que además vale para cualquier vía de borrado: la
-- de hoy y las que vengan.
--
-- Y se IMPIDE, no se reasigna en silencio a la edición primaria: reasignar
-- falsearía el progreso de alguien que no ha pedido nada ("voy por la página 240
-- de 662" se convertiría en "de 880" sin que su dueño se entere). Que el editor
-- lo explique y que el colaborador decida.
create or replace function public.block_edition_delete_if_used()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pases integer;
begin
  select count(*) into v_pases
  from public.diary_entries d
  where d.edition_id = old.id;

  if v_pases > 0 then
    raise exception 'edition_in_use'
      using hint = format('%s pases usan esta edicion', v_pases);
  end if;

  return old;
end;
$$;

drop trigger if exists book_editions_block_delete on public.book_editions;
create trigger book_editions_block_delete
  before delete on public.book_editions
  for each row execute function public.block_edition_delete_if_used();

drop trigger if exists movie_versions_block_delete on public.movie_versions;
create trigger movie_versions_block_delete
  before delete on public.movie_versions
  for each row execute function public.block_edition_delete_if_used();

-- El trigger lo dispara Postgres, no lo invoca nadie a mano: conceder EXECUTE
-- solo sería superficie de ataque y ruido en los advisors.
revoke execute on function public.block_edition_delete_if_used() from public, anon, authenticated;

-- Borrar una edición del catálogo es curación: colaborador+, igual que crearla.
grant delete on public.book_editions to authenticated;
grant delete on public.movie_versions to authenticated;

create policy "book_editions deletable by collaborators"
  on public.book_editions for delete to authenticated
  using (public.current_user_role() in ('collaborator', 'admin'));

create policy "movie_versions deletable by collaborators"
  on public.movie_versions for delete to authenticated
  using (public.current_user_role() in ('collaborator', 'admin'));

-- Hallazgo 2 (revisión final 2026-07-14): borrar la primaria no debe dejar la
-- obra sin denominador. El trigger de arriba (block_edition_delete_if_used)
-- solo bloquea el borrado si algún PASE referencia la edición por id — pero
-- los pases que contestaron "No lo sé" tienen edition_id = NULL y miden su
-- progreso contra la PRIMARIA (ver openPassEdition en
-- src/components/detail/log-panel.tsx / primaryEdition en
-- src/lib/editions/edition-label.ts). Nada se opone entonces a borrar la
-- primaria, y esos lectores pierden de golpe el "de 662 páginas" y se quedan
-- con "voy por la página 240" a secas.
--
-- Por eso, tras borrar una edición que ERA la primaria, se promueve otra
-- automáticamente: la más reciente que quede (año de publicación/estreno
-- desc nulls last, created_at desc como desempate — mismo criterio que
-- "más reciente" en el resto del editor). Si no queda ninguna edición, no se
-- hace nada: el progreso cae al espejo de books.total_pages /
-- movies.duration_minutes, que es el comportamiento de hoy y está bien (no
-- hay denominador mejor que rescatar si la obra se queda sin ediciones).
create or replace function public.promote_primary_edition_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo hay algo que arreglar si lo que se borró ERA la primaria: si no lo
  -- era, la primaria de siempre sigue intacta y no hay nada que promover.
  if not old.is_primary then
    return old;
  end if;

  if TG_TABLE_NAME = 'book_editions' then
    update public.book_editions
       set is_primary = true
     where id = (
       select id
         from public.book_editions
        where book_id = old.book_id
        order by published_year desc nulls last, created_at desc
        limit 1
     );
  elsif TG_TABLE_NAME = 'movie_versions' then
    update public.movie_versions
       set is_primary = true
     where id = (
       select id
         from public.movie_versions
        where movie_id = old.movie_id
        order by release_year desc nulls last, created_at desc
        limit 1
     );
  end if;

  return old;
end;
$$;

drop trigger if exists book_editions_promote_primary_after_delete on public.book_editions;
create trigger book_editions_promote_primary_after_delete
  after delete on public.book_editions
  for each row execute function public.promote_primary_edition_after_delete();

drop trigger if exists movie_versions_promote_primary_after_delete on public.movie_versions;
create trigger movie_versions_promote_primary_after_delete
  after delete on public.movie_versions
  for each row execute function public.promote_primary_edition_after_delete();

-- Mismo idioma de higiene que block_edition_delete_if_used: lo dispara
-- Postgres, no es una RPC.
revoke execute on function public.promote_primary_edition_after_delete() from public, anon, authenticated;

-- ============================================================
-- 20260714_editions_g_covers_bucket.sql
-- ============================================================

-- Portadas alojadas en Supabase Storage, para que un colaborador pueda corregir
-- la portada de una ficha (los datos de OpenLibrary llegan sucios y a veces sin
-- portada, o con una que no es).
--
-- Mismo patrón que el bucket de avatares (20260710_avatars_storage.sql), con UNA
-- diferencia que importa: en avatares la puerta es la CARPETA (cada usuario
-- escribe en la suya, {uid}/). Aquí la portada es del CATÁLOGO COMPARTIDO: no es
-- de nadie, así que la puerta es el ROL. Mismo criterio que crear ediciones o
-- asignar sagas (§7.35): colaborador o superior.
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

-- Como en avatares, NO se añade una política SELECT amplia: el bucket es público
-- y sirve sus objetos por URL, y una SELECT abierta permitiría LISTAR el bucket.

create policy "covers insert by collaborators" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'covers'
    and public.current_user_role() in ('collaborator', 'admin')
  );

create policy "covers update by collaborators" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'covers'
    and public.current_user_role() in ('collaborator', 'admin')
  )
  with check (
    bucket_id = 'covers'
    and public.current_user_role() in ('collaborator', 'admin')
  );

create policy "covers delete by collaborators" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'covers'
    and public.current_user_role() in ('collaborator', 'admin')
  );

-- ============================================================
-- 20260714_editions_h_catalog_edit_grants.sql
-- ============================================================

-- Editor de ficha oficial (Tarea 9): colaborador+ puede corregir título,
-- autoría/dirección/creación, sinopsis, géneros, año y portada de books/
-- movies/series. Hoy `authenticated` NO puede escribir ninguno de esos
-- campos:
--
--   - books: solo tiene concedido `openlibrary_work_key` / `editions_synced_at`
--     (20260714_editions_e_sync_rls.sql, que además cerró un grant heredado
--     mucho más amplio que nunca debió existir — ver su cabecera). Esta
--     migración debe aplicarse DESPUÉS de esa: aquí solo se AÑADEN columnas al
--     grant ya acotado, nunca se reabre desde cero.
--   - movies / series: solo tienen concedido el backfill de tamaño
--     (duration_minutes / total_seasons+total_episodes — verificado en vivo
--     con information_schema.role_column_grants), que sigue intacto:
--     cualquier autenticado necesita seguir pudiendo rellenarlo
--     (backfillQueueSizes, src/lib/queue/backfill-queue-sizes.ts, corre para
--     cualquier visitante de la cola, no solo colaboradores).
--
-- OJO — por qué esto NO es "grant ampliado + policy de colaborador" sin más:
-- una policy RLS filtra FILAS, no columnas. Los tres UPDATE ya tienen una
-- policy permisiva `using(true)` (para que cualquier autenticado pueda seguir
-- escribiendo sus columnas de sincronización/backfill de siempre); si el
-- grant de columna se ampliara con título/sinopsis/géneros/etc bajo ESA misma
-- policy, cualquier autenticado (no solo colaborador+) podría reescribirlos
-- vía REST directo, porque policies permisivas se combinan con OR y ninguna
-- sabe qué columnas trae el UPDATE. Por eso la restricción de rol para estos
-- campos va en un TRIGGER (que sí ve OLD y NEW por columna), exactamente el
-- mismo patrón que enforce_people_enrich_only en
-- 20260715_enrich_only_and_hardening.sql.

-- ── 1. Grant ampliado (aditivo: no quita nada de lo que ya había) ───────────
grant update (title, author, synopsis, genres, published_year, cover_url)
  on public.books to authenticated;

grant update (title, director, synopsis, genres, release_year, cover_url)
  on public.movies to authenticated;

grant update (title, creator, synopsis, genres, release_year, cover_url)
  on public.series to authenticated;

-- ── 2. Trigger: estos campos concretos solo los cambia colaborador+ ─────────
-- auth.uid() IS NULL => contexto sin usuario (service_role / SQL del owner,
-- que ya bypasan RLS) — se deja pasar, mismo idioma que
-- enforce_people_enrich_only.
create or replace function public.enforce_catalog_edit_collaborator_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.has_min_role('collaborator') then
    return new;
  end if;

  if TG_TABLE_NAME = 'books' then
    if new.title is distinct from old.title
      or new.author is distinct from old.author
      or new.synopsis is distinct from old.synopsis
      or new.genres is distinct from old.genres
      or new.published_year is distinct from old.published_year
      or new.cover_url is distinct from old.cover_url
    then
      raise exception 'catalog ficha fields can only be edited by collaborators';
    end if;
  elsif TG_TABLE_NAME = 'movies' then
    if new.title is distinct from old.title
      or new.director is distinct from old.director
      or new.synopsis is distinct from old.synopsis
      or new.genres is distinct from old.genres
      or new.release_year is distinct from old.release_year
      or new.cover_url is distinct from old.cover_url
    then
      raise exception 'catalog ficha fields can only be edited by collaborators';
    end if;
  elsif TG_TABLE_NAME = 'series' then
    if new.title is distinct from old.title
      or new.creator is distinct from old.creator
      or new.synopsis is distinct from old.synopsis
      or new.genres is distinct from old.genres
      or new.release_year is distinct from old.release_year
      or new.cover_url is distinct from old.cover_url
    then
      raise exception 'catalog ficha fields can only be edited by collaborators';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_catalog_edit_collaborator_only() is
  'BEFORE UPDATE en books/movies/series: título/autoría/sinopsis/géneros/año/portada solo los cambia collaborator+. Las columnas de sincronización (openlibrary_work_key, editions_synced_at, duration_minutes, total_seasons, total_episodes, episode_runtime_minutes) no se tocan aquí y siguen abiertas a cualquier authenticated (Tarea 6 / backfillQueueSizes). Ver cabecera de 20260714_editions_h_catalog_edit_grants.sql.';

drop trigger if exists trg_enforce_books_edit_collaborator_only on public.books;
create trigger trg_enforce_books_edit_collaborator_only
  before update on public.books
  for each row execute function public.enforce_catalog_edit_collaborator_only();

drop trigger if exists trg_enforce_movies_edit_collaborator_only on public.movies;
create trigger trg_enforce_movies_edit_collaborator_only
  before update on public.movies
  for each row execute function public.enforce_catalog_edit_collaborator_only();

drop trigger if exists trg_enforce_series_edit_collaborator_only on public.series;
create trigger trg_enforce_series_edit_collaborator_only
  before update on public.series
  for each row execute function public.enforce_catalog_edit_collaborator_only();

-- El trigger lo dispara Postgres, no es una RPC: mismo revoke de higiene que
-- el resto de funciones de trigger del proyecto.
revoke execute on function public.enforce_catalog_edit_collaborator_only() from public, anon, authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- ANEXO 2026-07-17 — cola que faltaba (pase-hub #42 + plan 05)
-- ──────────────────────────────────────────────────────────────────────────
-- El baseline se había quedado en editions_h (14 jul). Faltaban 14
-- migraciones YA APLICADAS EN PROD, que se anexan aquí EN EL ORDEN DE
-- APLICACION REAL de prod (supabase_migrations.schema_migrations), que NO
-- coincide con el orden alfabetico de los ficheros (los pass_hub b2..c se
-- redataron a 20260717 pero prod los registra en 20260716). La gorda es
-- pass_hub_c_rename: RENOMBRA diary_entries -> passes, asi que todo lo de
-- arriba que dice diary_entries queda como passes tras este bloque.
-- OJO: el fichero 20260716_list_challenge_completion_mode.sql NO esta en
-- las migraciones de prod (no aplicado o aplicado sin registrar) — se deja
-- FUERA a proposito; este baseline replica lo que hay en prod.


-- ──────────────────────────────────────────────────────────────────────────
-- 20260714225237 book_hydration  (fichero: 20260715_book_hydration.sql)
-- ──────────────────────────────────────────────────────────────────────────

-- PELDAÑO 2 de la escalera de hidratación (spec 2026-07-14): la obra se hidrata
-- al ABRIR su ficha, no al buscarla. `hydrated_at` es el guard de ese
-- cache-as-you-go, hermano de `editions_synced_at` (20260714_editions_d_sync):
-- si está puesta, no se vuelve a preguntar a OpenLibrary por esta obra.
--
-- Las filas que ya existen quedan con null a propósito: se rehidratan solas la
-- primera vez que alguien abra su ficha, y así se curan las que se cachearon
-- sucias con el flujo antiguo (sinopsis vacía, géneros de basura, páginas que
-- eran la mediana de todas las ediciones).
alter table public.books
  add column hydrated_at timestamptz;

-- Mismo grant que `editions_synced_at`: la hidratación la dispara la ficha con
-- la sesión del visitante, que no tiene por qué ser colaborador.
grant update (hydrated_at) on public.books to authenticated;

-- La hidratación escribe synopsis/genres/cover_url, que son columnas CURADAS:
-- el trigger de 20260714_editions_h_catalog_edit_grants solo deja cambiarlas a
-- collaborator+. Pero rellenar un hueco no es curar. Esta función es la vía:
-- security definer, y escribe SOLO donde la fila no tenía nada. Así un
-- authenticated cualquiera completa una obra vacía con solo abrir su ficha, sin
-- poder pisar jamás lo que un colaborador escribió a mano.
create or replace function public.hydrate_book(
  p_book_id uuid,
  p_synopsis text default null,
  p_genres text[] default null,
  p_cover_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  update public.books
     set synopsis    = case
                         when (synopsis is null or synopsis = '') and p_synopsis is not null
                           then left(p_synopsis, 5000)
                         else synopsis
                       end,
         genres      = case
                         when (genres is null or cardinality(genres) = 0) and p_genres is not null
                           then p_genres
                         else genres
                       end,
         cover_url   = case
                         when (cover_url is null or cover_url = '') and p_cover_url is not null
                           then p_cover_url
                         else cover_url
                       end,
         hydrated_at = now()
   where id = p_book_id;
end;
$$;

revoke all on function public.hydrate_book(uuid, text, text[], text) from public;
grant execute on function public.hydrate_book(uuid, text, text[], text) to authenticated;

comment on function public.hydrate_book is
  'Cache-as-you-go de la obra al abrir su ficha (spec 2026-07-14): rellena synopsis/genres/cover_url SOLO si estaban vacíos y marca hydrated_at. No pisa nunca lo que un colaborador haya escrito; para eso está el editor de ficha.';

-- La columna legacy: guardaba la work key de OpenLibrary bajo un nombre que
-- mentía (el código de Google Books lleva muerto desde que la búsqueda pasó a
-- OpenLibrary). 20260714_editions_d_sync.sql ya copió su contenido a
-- `openlibrary_work_key`, que es la columna por la que ahora busca
-- find-or-create.ts.
alter table public.books
  drop column google_books_id;


-- ──────────────────────────────────────────────────────────────────────────
-- 20260714225439 book_hydration_revoke_anon  (fichero: 20260715_book_hydration_revoke_anon.sql)
-- ──────────────────────────────────────────────────────────────────────────

-- hydrate_book nació con EXECUTE para anon: los default privileges de Supabase
-- conceden ejecución a anon+authenticated en funciones nuevas, y el
-- `revoke all ... from public` de 20260715_book_hydration no quita ese grant
-- explícito a anon. Funcionalmente anon no puede hacer nada (la función lanza
-- 'authentication required' si auth.uid() es null), pero se revoca igual para
-- igualar el patrón de register_book_edition y limpiar el advisor
-- `anon_security_definer_function_executable`. Aplicada en dev y prod.
revoke execute on function public.hydrate_book(uuid, text, text[], text) from anon;


-- ──────────────────────────────────────────────────────────────────────────
-- 20260715102234 book_editions_no_blank_primary  (fichero: 20260715_book_editions_no_blank_primary.sql)
-- ──────────────────────────────────────────────────────────────────────────

-- Una obra nacida ligera desde la búsqueda por texto (findOrCreateCatalogItem
-- solo pone work_key/título/autor/portada/año) hacía que el trigger
-- create_primary_book_edition creara una "Edición principal" en blanco, sin
-- editorial/ISBN/páginas. Esa edición vacía es la que se ve en la primera
-- visita a la ficha, antes de que ensureBookEditions sincronice las reales.
--
-- Arreglo: no crear la primaria cuando NO hay ningún dato de tirada. Cuando sí
-- lo hay (escáner por ISBN, importador), se sigue creando como hasta ahora. La
-- primera edición real que sincronice pasará a primaria via
-- ensure_primary_book_edition (BEFORE INSERT), que ya existe.

create or replace function public.create_primary_book_edition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin ningún dato de tirada: no se crea primaria en blanco.
  if new.publisher is null
     and (new.isbn is null or char_length(trim(new.isbn)) = 0)
     and new.total_pages is null then
    return new;
  end if;

  insert into public.book_editions
    (book_id, label, publisher, published_year, total_pages, isbn, cover_url, is_primary)
  values
    (new.id, 'Edición principal', new.publisher,
     public.sane_int(new.published_year, 1400, 2200),
     public.sane_int(new.total_pages, 1, 20000),
     case when char_length(coalesce(new.isbn, '')) <= 20 then new.isbn end,
     new.cover_url, true)
  on conflict do nothing;
  return new;
exception when others then
  -- La obra manda: si su edición primaria no se puede crear, que nazca igual.
  raise warning 'edicion primaria omitida para el libro %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- Limpieza de las primarias en blanco ya creadas por el bug (dev y prod), en DOS
-- fases para no chocar con el índice único parcial (book_id) where is_primary:
--
-- 1) Borrar TODAS las blancas de un tirón (solo DELETE: no puede violar el
--    índice, sea cual sea el orden).
-- 2) Por cada libro que quedó SIN primaria, promover su mejor edición CON DATOS.
--    Como el libro no tiene ninguna primaria, poner una no puede colisionar.
--
-- Un único bucle "borra-y-promueve" fila a fila NO servía: un libro con la blanca
-- MÁS ediciones reales generaba una primaria transitoria que violaba el índice
-- (pasó en prod con un libro de 21 ediciones). Si un libro no tiene ninguna
-- edición con datos, se queda sin primaria (getEditions ordena por año y tira
-- igual); no se re-crea una blanca.
delete from public.book_editions
where is_primary and publisher is null and isbn is null and total_pages is null;

do $$
declare r record;
begin
  for r in
    select book_id
    from public.book_editions
    group by book_id
    having count(*) filter (where is_primary) = 0
  loop
    update public.book_editions
       set is_primary = true
     where id = (
       select id
       from public.book_editions
       where book_id = r.book_id
         and (publisher is not null or isbn is not null or total_pages is not null)
       order by published_year desc nulls last, id
       limit 1
     );
  end loop;
end $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 20260716061754 pass_hub_a_columns  (fichero: 20260716_pass_hub_a_columns.sql)
-- ──────────────────────────────────────────────────────────────────────────

-- El pase pasa a ser el hub: absorbe estado, cursor, cola y fijados de
-- library_entries. library_entries NO se toca aún (queda como red de revert;
-- se congela en la migración C). Ver docs/superpowers/specs/2026-07-15-pase-hub-design.md.

-- 1) Columnas nuevas.
alter table public.diary_entries
  add column if not exists item_type public.item_type,
  add column if not exists item_id uuid,
  add column if not exists status public.media_status not null default 'planned',
  add column if not exists is_active boolean not null default false,
  add column if not exists position jsonb not null default '{}'::jsonb,
  add column if not exists queue_id uuid references public.queues(id) on delete set null,
  add column if not exists queue_order integer,
  add column if not exists pinned_order integer;

-- 2) Toda entrada sin ningún pase engendra uno, para que "en mi biblioteca"
--    pueda pasar a significar "existe pase activo". Idempotente.
insert into public.diary_entries (library_entry_id, user_id, started_on, finished_on, is_public)
select
  le.id,
  le.user_id,
  case when le.status <> 'planned'
       then coalesce(le.started_at::date, le.updated_at::date) end,
  case when le.status in ('completed', 'dropped') then le.updated_at::date end,
  true
from public.library_entries le
where not exists (
  select 1 from public.diary_entries d where d.library_entry_id = le.id
);

-- 3) La obra, en todos los pases (aún vía library_entry_id; la columna se
--    volverá not null al final de este fichero).
update public.diary_entries d
set item_type = le.item_type, item_id = le.item_id
from public.library_entries le
where d.library_entry_id = le.id
  and (d.item_type is null or d.item_id is null);

-- 4) Estado provisional derivado de finished_on. El histórico no distinguía
--    completado de abandonado: los cerrados no-activos quedan como
--    'completed' (es lo que la media de comunidad asumía de facto).
update public.diary_entries set status = 'completed'
where finished_on is not null and status = 'planned';
update public.diary_entries set status = 'in_progress'
where finished_on is null and status = 'planned' and started_on is not null;

-- 5) El pase activo de cada entrada (el abierto si lo hay; si no, el último
--    cerrado) hereda el estado REAL y el contexto de biblioteca.
with actives as (
  select distinct on (d.library_entry_id) d.id, d.library_entry_id
  from public.diary_entries d
  order by d.library_entry_id,
           (d.finished_on is null) desc,
           d.finished_on desc,
           d.created_at desc
)
update public.diary_entries d
set is_active   = true,
    status      = le.status,
    position    = le.position,
    queue_id    = le.queue_id,
    queue_order = le.queue_order,
    pinned_order = le.pinned_order
from actives a
join public.library_entries le on le.id = a.library_entry_id
where d.id = a.id;

-- 6) Coherencia estado ↔ fechas en los activos (deriva histórica posible):
--    cerrado sin fecha gana la fecha; abierto con fecha la pierde. El índice
--    diary_entries_one_open_pass no puede chocar: si hubiera habido un pase
--    abierto, ESE habría sido elegido activo en el paso 5.
update public.diary_entries
set finished_on = coalesce(finished_on, updated_at::date)
where is_active and status in ('completed', 'dropped') and finished_on is null;
update public.diary_entries
set finished_on = null
where is_active and status in ('planned', 'in_progress') and finished_on is not null;

-- 7) Cierres e índices.
alter table public.diary_entries
  alter column item_type set not null,
  alter column item_id set not null;

create unique index if not exists passes_one_active
  on public.diary_entries (user_id, item_type, item_id)
  where is_active;
create index if not exists passes_active_by_user
  on public.diary_entries (user_id)
  where is_active;
create index if not exists passes_by_item
  on public.diary_entries (item_type, item_id);

-- 8) Grants por columna: el SELECT de tabla se quitó en
--    20260714_passes_review_privacy.sql; cada columna nueva necesita el suyo.
grant select (item_type, item_id, status, is_active, position,
              queue_id, queue_order, pinned_order)
  on public.diary_entries to anon, authenticated;

-- 9) La vista de reseñas gana las columnas nuevas (mismo WHERE de privacidad).
--    El literal 'diary_entries' de is_visible_via_club_share es la etiqueta
--    almacenada en las comparticiones de club: NO cambia aunque la tabla se
--    renombre después (dato, no nombre de tabla).
drop view if exists public.pass_reviews;
create view public.pass_reviews as
select
  d.id, d.library_entry_id, d.user_id, d.item_type, d.item_id,
  d.status, d.is_active, d.position,
  d.started_on, d.finished_on, d.rating, d.review, d.is_public,
  d.edition_id, d.created_at
from public.diary_entries d
where
  d.user_id = (select auth.uid())
  or (
    d.is_public
    and (
      public.can_view_profile(d.user_id)
      or public.is_visible_via_club_share('diary_entries', d.id, d.user_id)
    )
  );

grant select on public.pass_reviews to anon, authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- 20260716061828 pass_hub_a_view_pinned  (fichero: 20260716_pass_hub_a_view_pinned.sql)
-- ──────────────────────────────────────────────────────────────────────────

-- La vista pass_reviews debe exponer pinned_order: el ejecutor de
-- transiciones hereda el fijado al archivar un pase, y la capa de lectura de
-- pases (getPasses) lee por la vista — es la única lectura que incluye
-- review, así que el pase entero sale de ahí. La tanda A la creó sin esta
-- columna; misma técnica drop+create (no se pueden insertar columnas en
-- medio con create or replace).
drop view if exists public.pass_reviews;
create view public.pass_reviews as
select
  d.id, d.library_entry_id, d.user_id, d.item_type, d.item_id,
  d.status, d.is_active, d.position, d.pinned_order,
  d.started_on, d.finished_on, d.rating, d.review, d.is_public,
  d.edition_id, d.created_at
from public.diary_entries d
where
  d.user_id = (select auth.uid())
  or (
    d.is_public
    and (
      public.can_view_profile(d.user_id)
      or public.is_visible_via_club_share('diary_entries', d.id, d.user_id)
    )
  );

grant select on public.pass_reviews to anon, authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- 20260716061843 pass_hub_b_satellites  (fichero: 20260716_pass_hub_b_satellites.sql)
-- ──────────────────────────────────────────────────────────────────────────

-- Las sesiones pasan a colgar SOLO del pase; los episodios vistos ganan
-- pass_id para que el cursor de serie sea por pase (revisionados con cursor
-- propio). pass_id null en episode_watches = visto en la era pre-pases o de
-- una serie ya quitada de la biblioteca: cuenta para "visto alguna vez",
-- no para el cursor de ningún pase.

-- 1) Sesiones huérfanas de pase → al pase activo de su entrada.
update public.progress_sessions s
set pass_id = d.id
from public.diary_entries d
where s.pass_id is null
  and d.library_entry_id = s.library_entry_id
  and d.is_active;

alter table public.progress_sessions alter column pass_id set not null;

-- 2) Episodios vistos → al pase activo de esa serie para ese usuario.
alter table public.episode_watches
  add column if not exists pass_id uuid references public.diary_entries(id) on delete cascade;

update public.episode_watches w
set pass_id = d.id
from public.diary_entries d
where w.pass_id is null
  and d.user_id = w.user_id
  and d.item_type = 'series'
  and d.item_id = w.series_id
  and d.is_active;

create index if not exists episode_watches_by_pass
  on public.episode_watches (pass_id);


-- ──────────────────────────────────────────────────────────────────────────
-- 20260716061921 pass_hub_b2_episode_unique  (fichero: 20260717_pass_hub_b2_episode_unique.sql)
-- ──────────────────────────────────────────────────────────────────────────

-- Tarea 8 (hub): el cursor de episodios pasa a ser POR PASE, no por
-- usuario+serie. Un episodio puede estar visto en varios pases distintos
-- (revisionado): la unicidad vieja (user_id, series_id, season, episode)
-- lo impedía. Se sustituye por dos índices únicos parciales:
--   - uno por pase (pass_id, season, episode) para el visionado activo,
--   - uno "legacy" (user_id, series_id, season, episode) WHERE pass_id IS
--     NULL para no duplicar historia anterior a la migración del hub (esos
--     vistos no pertenecen a ningún pase y siguen contando para "visto
--     alguna vez").
alter table public.episode_watches
  drop constraint if exists episode_watches_user_id_series_id_season_number_episode_num_key;

create unique index if not exists episode_watches_once_per_pass
  on public.episode_watches (pass_id, season_number, episode_number)
  where pass_id is not null;

create unique index if not exists episode_watches_legacy_unique
  on public.episode_watches (user_id, series_id, season_number, episode_number)
  where pass_id is null;


-- ──────────────────────────────────────────────────────────────────────────
-- 20260716061926 pass_hub_b3_fk_set_null  (fichero: 20260717_pass_hub_b3_fk_set_null.sql)
-- ──────────────────────────────────────────────────────────────────────────

-- La tanda B ató episode_watches.pass_id con ON DELETE CASCADE, y eso
-- contradice su propia semántica: pass_id nulo significa "visto alguna vez,
-- aunque la serie ya no esté en la biblioteca". Si borrar los pases (quitar
-- de biblioteca) arrastrara los vistos, esa capa desaparecería justo cuando
-- tiene que sobrevivir. El FK pasa a SET NULL: el pase muere, el visto queda.
alter table public.episode_watches
  drop constraint if exists episode_watches_pass_id_fkey;
alter table public.episode_watches
  add constraint episode_watches_pass_id_fkey
  foreign key (pass_id) references public.diary_entries(id) on delete set null;


-- ──────────────────────────────────────────────────────────────────────────
-- 20260716061939 pass_hub_b4_hub_writes  (fichero: 20260717_pass_hub_b4_hub_writes.sql)
-- ──────────────────────────────────────────────────────────────────────────

-- Hueco del plan detectado en la Tarea 5: el ejecutor de transiciones
-- (applyTransition) inserta y actualiza pases-hub, pero la BD todavía exigía
-- el mundo viejo por tres sitios. Sin esto, TODA alta y TODO cambio de
-- estado fallan en runtime (compilan bien: el fallo es NOT NULL + grants).
--
-- 1) library_entry_id era NOT NULL: un pase del hub nace SIN entrada de
--    biblioteca (el alta ya no escribe library_entries). Nullable hasta que
--    la migración C (Task 10) elimine la columna. El FK compuesto
--    (library_entry_id, user_id) es MATCH SIMPLE: con la columna a null no
--    se evalúa, así que los pases nuevos no chocan con él.
alter table public.diary_entries
  alter column library_entry_id drop not null;

-- 2) Grants por columna (20260714_passes_grants.sql hizo revoke all + grant
--    fino): las columnas del hub (tanda A) solo recibieron SELECT. El
--    ejecutor escribe estado, actividad, cursor, cola y fijado; la cola y el
--    fijado también los escriben moveEntryToQueue y favorite-actions.
grant insert (item_type, item_id, status, is_active, position,
              queue_id, queue_order, pinned_order)
  on public.diary_entries to authenticated;
grant update (status, is_active, position, queue_id, queue_order, pinned_order)
  on public.diary_entries to authenticated;

-- 3) check_pass_edition resolvía la obra vía library_entries usando
--    new.library_entry_id — con pases sin entrada, v_item_type quedaba null
--    y el trigger rechazaba CUALQUIER edición ("una serie no tiene
--    ediciones"). La obra ya vive en el propio pase (item_type/item_id NOT
--    NULL desde la tanda A): se lee de ahí y vale para viejos y nuevos.
create or replace function public.check_pass_edition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.edition_id is null then
    return new;
  end if;

  if new.item_type = 'book' then
    if not exists (
      select 1 from public.book_editions be
      where be.id = new.edition_id and be.book_id = new.item_id
    ) then
      raise exception 'la edicion % no es de este libro', new.edition_id;
    end if;
  elsif new.item_type = 'movie' then
    if not exists (
      select 1 from public.movie_versions mv
      where mv.id = new.edition_id and mv.movie_id = new.item_id
    ) then
      raise exception 'la version % no es de esta pelicula', new.edition_id;
    end if;
  else
    -- Las series no tienen ediciones: su unidad de progreso son los episodios.
    raise exception 'una serie no tiene ediciones';
  end if;

  return new;
end;
$$;


-- ──────────────────────────────────────────────────────────────────────────
-- 20260716061946 pass_hub_b5_sessions_optional  (fichero: 20260717_pass_hub_b5_sessions_optional.sql)
-- ──────────────────────────────────────────────────────────────────────────

-- Hueco del plan detectado en la Tarea 7: el propio plan (línea 880 de
-- docs/superpowers/plans/2026-07-15-pase-hub.md) pide que addSession deje de
-- escribir `library_entry_id` en progress_sessions ("el insert de la sesión
-- pierde library_entry_id y usa pass_id"), pero esa columna sigue siendo
-- NOT NULL hoy — solo se elimina del todo en la Tarea 10 (línea 1067 del
-- plan). Sin este cambio, TODO insert de sesión falla en runtime con "null
-- value in column library_entry_id violates not-null constraint": el código
-- compila (los tipos ya se parchearon a mano, ver database.types.ts) pero
-- revienta al primer guardado.
--
-- Mismo tratamiento que ya recibió diary_entries.library_entry_id en
-- 20260717_pass_hub_b4_hub_writes.sql: nullable, no se borra la columna
-- todavía (eso es la Tarea 10) ni se toca el FK compuesto (library_entry_id,
-- user_id) — MATCH SIMPLE ya no se evalúa cuando la columna es null, así que
-- las sesiones de pases nuevos (sin entrada de biblioteca, seguir ya no crea
-- library_entries) no chocan con él.
alter table public.progress_sessions
  alter column library_entry_id drop not null;


-- ──────────────────────────────────────────────────────────────────────────
-- 20260716062101 pass_hub_c_rename  (fichero: 20260717_pass_hub_c_rename.sql)
-- ──────────────────────────────────────────────────────────────────────────

-- Migración C del hub del pase: la tabla del pase deja de llamarse como el
-- diario. `diary_entries` era ya el hub del registro personal (item/estado/
-- cola/cursor, con sesiones y episodios colgando de pass_id); este rename hace
-- que el repositorio diga la verdad y corta el último lazo con library_entries.
--
-- Distinción CLAVE que gobierna toda la migración:
--   * Un `FROM diary_entries` en el cuerpo de una función ES una referencia de
--     TABLA y hay que reescribirla a `passes` (plpgsql resuelve el nombre en
--     tiempo de ejecución: una función que siga diciendo diary_entries fallaría).
--   * La CADENA 'diary_entries' / 'diary_entry' almacenada en comparticiones de
--     club (club_posts.ref->>'sourceTable') e interacciones (target_type) es un
--     DATO (una etiqueta), NO un nombre de tabla: NO se toca, o romperíamos las
--     comparticiones e interacciones existentes.

-- 1) El rename. FKs e índices cuelgan de la tabla por OID, así que las FKs que
--    APUNTAN a diary_entries (episode_watches.pass_id, progress_sessions.pass_id)
--    siguen la tabla sin tocar nada. Los triggers también.
alter table public.diary_entries rename to passes;

-- 2) Reescritura de TODA función cuyo cuerpo nombraba diary_entries como tabla.
--    Enumeradas exhaustivamente con `select proname from pg_proc where prosrc
--    ilike '%diary_entries%'` (6 funciones) — no por adivinanza.

-- 2a) block_edition_delete_if_used: cuenta pases que usan una edición. Simple
--     rename de tabla.
create or replace function public.block_edition_delete_if_used()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pases integer;
begin
  select count(*) into v_pases
  from public.passes d
  where d.edition_id = old.id;

  if v_pases > 0 then
    raise exception 'edition_in_use'
      using hint = format('%s pases usan esta edicion', v_pases);
  end if;

  return old;
end;
$function$;

-- 2b) can_view_target: el `when 'diary_entry'` es la etiqueta de datos del enum
--     target_kind (NO se toca); el `from diary_entries` sí es tabla → passes.
create or replace function public.can_view_target(p_target_type target_kind, p_target_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case p_target_type
    when 'diary_entry' then exists (
      select 1 from public.passes d where d.id = p_target_id and public.can_view_profile(d.user_id)
    )
    when 'episode_watch' then exists (
      select 1 from public.episode_watches e where e.id = p_target_id and public.can_view_profile(e.user_id)
    )
    when 'club_post' then exists (
      select 1 from public.club_posts cp where cp.id = p_target_id and public.is_club_member(cp.club_id)
    )
    when 'comment' then exists (
      select 1 from public.comments c where c.id = p_target_id
        and public.can_view_target(c.target_type, c.target_id)
    )
    when 'activity_checkpoint' then exists (
      select 1 from public.club_activity_checkpoints cc
      where cc.id = p_target_id
        and public.is_activity_participant(cc.activity_id)
        and public.has_reached_checkpoint(cc.id)
    )
  end;
$function$;

-- 2c) get_activity_diary_passes: antes puenteaba participante → library_entries
--     → diary_entries por library_entry_id. En el hub el pase YA lleva
--     item_type/item_id, así que se une passes directamente (esto además
--     ARREGLA un hueco: los pases nacidos en el hub tienen library_entry_id nulo
--     y quedaban fuera del join antiguo).
create or replace function public.get_activity_diary_passes(p_activity_id uuid)
 returns TABLE(user_id uuid, item_type item_type, item_id uuid, finished_on date)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with act as (
    select ca.id, w.window_start, w.window_end
      from public.club_activities ca
      cross join lateral public.activity_window(ca.id) w
     where ca.id = p_activity_id
       and ca.kind = 'criteria_challenge'
       and public.is_activity_participant(ca.id)
  )
  select p.user_id, d.item_type, d.item_id, d.finished_on
    from act a
    join public.club_activity_participants p on p.activity_id = a.id
    join public.passes d
      on d.user_id = p.user_id
     and d.finished_on between a.window_start and a.window_end;
$function$;

-- 2d) get_list_challenge_progress: misma migración de puente a passes directo.
--     Antes: library_entries (INNER, con el status) + diary_entries (LEFT, para
--     completed_on). En el hub, passes lleva status Y finished_on, así que un
--     único INNER a passes cubre ambos: en modo 'any' el filtro pide el PASE
--     ACTIVO con status 'completed' (el le.status='completed' de antes era el
--     estado ACTUAL de la entrada = el del pase activo del hub; sin el is_active
--     un pase histórico archivado, siempre 'completed', haría contar un ítem que
--     estás releyendo ahora — hallazgo de revisión Tarea 10) y completed_on
--     puede quedar nulo (el tick "ya lo tenías"); en modo 'window' el join no
--     filtra status y el HAVING exige un pase terminado dentro de la ventana.
create or replace function public.get_list_challenge_progress(p_activity_id uuid)
 returns TABLE(user_id uuid, item_type item_type, item_id uuid, completed_on date)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with act as (
    select ca.id,
           w.window_start,
           w.window_end,
           coalesce(ca.config ->> 'completionMode', 'window') = 'any' as open_mode
      from public.club_activities ca
      cross join lateral public.activity_window(ca.id) w
     where ca.id = p_activity_id
       and ca.kind = 'list_challenge'
       and public.is_activity_participant(ca.id)
  )
  select p.user_id,
         i.item_type,
         i.item_id,
         min(d.finished_on) filter (
           where d.finished_on between a.window_start and a.window_end
         ) as completed_on
    from act a
    join public.club_activity_participants p on p.activity_id = a.id
    join public.club_activity_items i on i.activity_id = a.id
    join public.passes d
      on d.user_id = p.user_id
     and d.item_type = i.item_type
     and d.item_id = i.item_id
     and (not a.open_mode or (d.is_active and d.status = 'completed'))
   group by a.open_mode, p.user_id, i.item_type, i.item_id
  having a.open_mode
      or bool_or(d.finished_on between a.window_start and a.window_end);
$function$;

-- 2e) resolve_pending_import: la cola de revisión (un colaborador resuelve una
--     fila de importación sin match, a nombre de su DUEÑO). El cuerpo antiguo
--     insertaba en library_entries + diary_entries(library_entry_id), un patrón
--     que ya estaba ROTO tras el hub (item_type/item_id son NOT NULL sin default
--     y no se aportaban). Se reescribe para insertar pases directamente,
--     espejando commit-row.ts: un pase ACTIVO (el estado/nota del shelf de
--     origen) más un pase histórico CERRADO por cada fecha de relectura que no
--     sea ya la del activo.
create or replace function public.resolve_pending_import(p_pending_id uuid, p_catalog_item_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row public.pending_import_rows;
  v_status media_status;
  v_rating smallint;
  v_position jsonb;
  v_dates jsonb;
  v_historical jsonb;
  v_date jsonb;
begin
  if not public.has_min_role('collaborator') then
    raise exception 'forbidden';
  end if;

  select * into v_row from public.pending_import_rows
    where id = p_pending_id and status = 'pending';
  if not found then
    raise exception 'pending row not found';
  end if;

  v_status := coalesce(nullif(v_row.payload->>'status','')::media_status, 'planned');
  v_rating := nullif(v_row.payload->>'rating','')::smallint;
  v_position := case
    when v_row.payload->>'bookFormat' is not null
      then jsonb_build_object('format', v_row.payload->>'bookFormat')
    else '{}'::jsonb
  end;
  v_dates := coalesce(v_row.payload->'diaryDates', '[]'::jsonb);

  -- Mismo criterio que commit-row.ts: si la obra está terminada/abandonada y hay
  -- fechas, la MÁS RECIENTE es el pase activo; si está planned/in_progress el
  -- activo es un pase aparte (abierto o planificado) y las fechas son relecturas
  -- pasadas.
  v_historical := null;
  if v_status in ('completed','dropped') then
    select d into v_historical
    from jsonb_array_elements(v_dates) d
    order by d->>'finishedOn' desc
    limit 1;
  end if;

  -- Pase activo. ON CONFLICT contra el índice parcial passes_one_active: si el
  -- dueño ya tiene un pase activo para esta obra (re-resolución), no se duplica.
  insert into public.passes (
    user_id, item_type, item_id, status, is_active, position, rating,
    started_on, finished_on, is_public
  ) values (
    v_row.user_id, v_row.item_type, p_catalog_item_id, v_status, true, v_position, v_rating,
    nullif(v_historical->>'startedOn','')::date, (v_historical->>'finishedOn')::date, true
  )
  on conflict (user_id, item_type, item_id) where is_active do nothing;

  -- Un pase cerrado por cada fecha del CSV que no sea ya la del activo, sin
  -- duplicar historial si se reimporta (no hay unique de BD para pases del hub).
  for v_date in select * from jsonb_array_elements(v_dates)
  loop
    if v_historical is not null and v_date->>'finishedOn' = v_historical->>'finishedOn' then
      continue;
    end if;
    if exists (
      select 1 from public.passes
      where user_id = v_row.user_id
        and item_type = v_row.item_type
        and item_id = p_catalog_item_id
        and finished_on = (v_date->>'finishedOn')::date
    ) then
      continue;
    end if;

    insert into public.passes (
      user_id, item_type, item_id, status, is_active, position,
      started_on, finished_on, rating, is_public, created_at
    ) values (
      v_row.user_id, v_row.item_type, p_catalog_item_id, 'completed', false, '{}'::jsonb,
      nullif(v_date->>'startedOn','')::date, (v_date->>'finishedOn')::date, v_rating, true,
      (v_date->>'finishedOn')::timestamptz
    );
  end loop;

  update public.pending_import_rows
    set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
    where id = p_pending_id;
end;
$function$;

-- 2f) validate_club_post_ref: el `case v_source` compara etiquetas ALMACENADAS
--     (datos), pero el `select 1 from diary_entries` de la rama 'diary_entries'
--     ES una tabla → passes. Además (alcance plegado de la revisión de la Tarea
--     9) se enseña la etiqueta nueva 'diary_entries_added': los ítems del hub no
--     tienen fila en library_entries, así que las comparticiones de "añadió a la
--     biblioteca" usan esa etiqueta y apuntan a una fila de `passes` (la del
--     pase añadido); antes caían en el `else null` → 'invalid_ref'. La
--     normalización final preserva v_source, así que la etiqueta se guarda tal
--     cual (dato intacto).
create or replace function public.validate_club_post_ref()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_source text;
  v_row uuid;
  v_owned boolean;
begin
  if new.kind <> 'activity_share' then
    if new.ref is not null then
      raise exception 'ref_only_for_activity_share';
    end if;
    return new;
  end if;

  if new.ref is null then
    raise exception 'ref_required';
  end if;

  v_source := new.ref->>'sourceTable';
  begin
    v_row := (new.ref->>'rowId')::uuid;
  exception when others then
    raise exception 'invalid_ref';
  end;

  v_owned := case v_source
    when 'diary_entries' then exists (
      select 1 from public.passes where id = v_row and user_id = new.author_id
    )
    when 'diary_entries_added' then exists (
      select 1 from public.passes where id = v_row and user_id = new.author_id
    )
    when 'episode_watches' then exists (
      select 1 from public.episode_watches where id = v_row and user_id = new.author_id
    )
    when 'library_entries' then exists (
      select 1 from public.library_entries where id = v_row and user_id = new.author_id
    )
    when 'progress_sessions' then exists (
      select 1 from public.progress_sessions where id = v_row and user_id = new.author_id
    )
    else null
  end;

  if v_owned is distinct from true then
    raise exception 'invalid_ref';
  end if;

  new.ref := jsonb_build_object('sourceTable', v_source, 'rowId', v_row::text);
  return new;
end;
$function$;

-- 2g) is_visible_via_club_share: su cuerpo NO nombra ninguna tabla (compara la
--     etiqueta almacenada contra el parámetro), así que el rename no le obliga.
--     Pero un pase compartido como 'diary_entries_added' apunta a la MISMA fila
--     de passes que uno compartido como 'diary_entries'; su visibilidad es la
--     misma. Como la vista pass_reviews y la política RLS de passes consultan con
--     'diary_entries' fijo, se enseña aquí a hacer coincidir ambas etiquetas para
--     esa consulta (así un "añadido" compartido a un club se ve sin tocar sus
--     llamadores). Las demás etiquetas (episode_watches, etc.) no se ven afectadas.
create or replace function public.is_visible_via_club_share(p_source_table text, p_row_id uuid, p_owner_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.club_posts cp
    where cp.kind = 'activity_share'
      and (
        cp.ref->>'sourceTable' = p_source_table
        or (p_source_table = 'diary_entries' and cp.ref->>'sourceTable' = 'diary_entries_added')
      )
      and cp.ref->>'rowId' = p_row_id::text
      and cp.author_id = p_owner_id
      and public.is_club_member(cp.club_id)
  );
$function$;

-- 3) La vista pass_reviews depende de passes.library_entry_id, así que se tira
--    ANTES de borrar la columna y se recrea sin ella (para la Tarea 9 ya nada la
--    selecciona) y con pinned_order.
drop view if exists public.pass_reviews;

-- 4) El footgun de la Tarea 5: finished_on arrastra DEFAULT CURRENT_DATE, que
--    estamparía una fecha de fin a cualquier pase abierto. Un pase abierto debe
--    conservar finished_on NULL.
alter table public.passes alter column finished_on drop default;

-- 5) El cordón: se corta el último lazo con library_entries. DROP COLUMN tira en
--    cascada la FK compuesta (…entry_owner_fkey) y los índices legacy que colgaban
--    de library_entry_id (one_open_pass / one_pass_per_day / idx_library_entry);
--    su papel ya lo hacen passes_one_active y passes_by_item, nacidos en el hub.
alter table public.progress_sessions drop column if exists library_entry_id;
alter table public.passes drop column if exists library_entry_id;

-- 6) Recreación de la vista desde passes, sin library_entry_id y con pinned_order.
create view public.pass_reviews as
select
  d.id, d.user_id, d.item_type, d.item_id,
  d.status, d.is_active, d.position, d.pinned_order,
  d.started_on, d.finished_on, d.rating, d.review, d.is_public,
  d.edition_id, d.created_at
from public.passes d
where
  d.user_id = (select auth.uid())
  or (
    d.is_public
    and (
      public.can_view_profile(d.user_id)
      or public.is_visible_via_club_share('diary_entries', d.id, d.user_id)
    )
  );

grant select on public.pass_reviews to anon, authenticated;

-- 7) Renombrado cosmético de los objetos SUPERVIVIENTES que aún llevan el nombre
--    viejo (para que el repositorio diga la verdad). Los que colgaban de
--    library_entry_id ya desaparecieron con la columna.
alter table public.passes rename constraint diary_entries_pkey to passes_pkey;
alter table public.passes rename constraint diary_entries_rating_check to passes_rating_check;
alter table public.passes rename constraint diary_entries_review_len to passes_review_len;
alter table public.passes rename constraint diary_entries_user_id_fkey to passes_user_id_fkey;
alter table public.passes rename constraint diary_entries_queue_id_fkey to passes_queue_id_fkey;
alter index public.idx_diary_entries_finished rename to idx_passes_finished;
alter trigger diary_entries_check_edition on public.passes rename to passes_check_edition;
alter trigger diary_entries_set_updated_at on public.passes rename to passes_set_updated_at;

-- 8) library_entries queda congelada como red de revert: sólo lectura, sin
--    escrituras de la app (se borrará en una limpieza posterior).
revoke insert, update, delete on public.library_entries from authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- 20260717195505 progress_sessions_started_at  (fichero: 20260717_progress_sessions_started_at.sql)
-- ──────────────────────────────────────────────────────────────────────────

-- "Cuándo lees" con dato real (plan 05, P8).
--
-- progress_sessions solo guardaba session_date (el día) y created_at (cuándo se
-- REGISTRÓ la sesión, no cuándo se consumió). Para la franja horaria favorita
-- hace falta la hora real de inicio: el cronómetro la rellena solo, la hoja
-- manual la deja opcional.
--
-- SIN backfill a propósito: created_at no es un sustituto honesto (mentiría
-- sobre la franja). "Cuándo lees" ignora las filas sin started_at.
alter table public.progress_sessions
  add column started_at timestamptz;

-- El grant de INSERT de progress_sessions es POR COLUMNA (ver
-- 20260714_passes_grants.sql): una columna nueva NO entra sola, así que sin
-- esto el rol authenticated no puede escribir started_at y el insert entero
-- falla con "permission denied for column started_at". (El SELECT sí la cubre:
-- ese grant es de tabla.)
grant insert (started_at) on public.progress_sessions to authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- 20260717195537 notes  (fichero: 20260717_notes.sql)
-- ──────────────────────────────────────────────────────────────────────────

-- Memorizar: notas y citas (plan 05, P7).
--
-- Hasta ahora una nota vivía suelta en dos sitios: progress_sessions.note (la
-- nota de una sesión, con su página en `position`) y library_entries.notes (una
-- nota de biblioteca sin sesión). Memorizar las unifica en una entidad propia,
-- privada, que además distingue nota de CITA y permite marcarla favorita.
--
-- Las columnas viejas se DEJAN en su sitio esta fase (el código lee de `notes`,
-- no las borra); se retiran en una limpieza posterior cuando la migración esté
-- verificada en prod.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  -- Opcionales: una cita puede venir de una sesión (libro) o no (una película
  -- no tiene sesión). Si el pase/sesión se borra, la nota sobrevive huérfana.
  pass_id uuid references public.passes(id) on delete set null,
  session_id uuid references public.progress_sessions(id) on delete set null,
  kind text not null check (kind in ('note', 'quote')),
  body text not null check (char_length(body) between 1 and 5000),
  -- Página / posición, mismo formato jsonb que progress_sessions.position.
  position jsonb,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notes_user on public.notes (user_id, created_at desc);

comment on table public.notes is 'Notas y citas de Memorizar (§P7). Privadas: solo el dueño, como challenges/queues.';

-- Privada, solo el dueño (mismo patrón que challenges).
alter table public.notes enable row level security;

create policy "own notes select" on public.notes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own notes insert" on public.notes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own notes update" on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "own notes delete" on public.notes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ── Migración de datos ───────────────────────────────────────────────────────

-- Notas de sesión: llevan su sesión y su página (position). El tipo y la obra
-- salen del pase.
insert into public.notes
  (user_id, item_type, item_id, pass_id, session_id, kind, body, position, created_at)
select ps.user_id, p.item_type, p.item_id, ps.pass_id, ps.id, 'note',
       ps.note, ps.position, ps.created_at
from public.progress_sessions ps
join public.passes p on p.id = ps.pass_id
where ps.note is not null and btrim(ps.note) <> '';

-- Notas de biblioteca: sin sesión ni pase; la obra sale de la propia entrada.
insert into public.notes
  (user_id, item_type, item_id, kind, body, created_at)
select le.user_id, le.item_type, le.item_id, 'note', le.notes, le.created_at
from public.library_entries le
where le.notes is not null and btrim(le.notes) <> '';


-- ──────────────────────────────────────────────────────────────────────────
-- 20260717195606 fuse_annual_goals_into_challenges  (fichero: 20260717_fuse_annual_goals_into_challenges.sql)
-- ──────────────────────────────────────────────────────────────────────────

-- Fusión de las metas anuales en retos (plan 05, P6).
--
-- Antes: profiles.annual_goal_{books,movies,series} guardaban la meta anual por
-- tipo, un modelo aparte de los retos (challenges) pese a significar lo mismo
-- ("N ítems completados de este tipo en el año"). Ahora hay un solo modelo: cada
-- meta > 0 se convierte en un reto del año natural en curso (item_type fijado,
-- criterio vacío, target = la meta) y las tres columnas se eliminan.
--
-- El progreso se conserva: un reto item_type='book', criteria={}, rango = el año
-- cuenta exactamente lo que contaba BookGoalCard (ver src/lib/challenges/match.ts
-- y annual-goals.ts, que deriva la meta por tipo del reto correspondiente).
--
-- ⚠️ Migración DESTRUCTIVA (DROP COLUMN). Aplicada primero en dev y verificada
-- (recuento antes/después) antes de prod.

-- 1) Data migration: cada meta > 0 → un reto del año en curso.
insert into public.challenges
  (user_id, name, item_type, target_count, criteria, start_date, end_date)
select
  user_id,
  annual_goal_books
    || case when annual_goal_books = 1 then ' libro en 2026' else ' libros en 2026' end,
  'book'::item_type, annual_goal_books, '{}'::jsonb, '2026-01-01'::date, '2026-12-31'::date
from public.profiles
where annual_goal_books is not null and annual_goal_books > 0
union all
select
  user_id,
  annual_goal_movies
    || case when annual_goal_movies = 1 then ' pelicula en 2026' else ' peliculas en 2026' end,
  'movie'::item_type, annual_goal_movies, '{}'::jsonb, '2026-01-01'::date, '2026-12-31'::date
from public.profiles
where annual_goal_movies is not null and annual_goal_movies > 0
union all
select
  user_id,
  annual_goal_series
    || case when annual_goal_series = 1 then ' serie en 2026' else ' series en 2026' end,
  'series'::item_type, annual_goal_series, '{}'::jsonb, '2026-01-01'::date, '2026-12-31'::date
from public.profiles
where annual_goal_series is not null and annual_goal_series > 0;

-- 2) Retirar las columnas: el modelo único son los retos.
alter table public.profiles
  drop column annual_goal_books,
  drop column annual_goal_movies,
  drop column annual_goal_series;


-- 20260718092053 20260718_activity_chat_target_enum  (fichero: 20260718_activity_chat_target.sql, parte 1/2)
-- 20260718092105 20260718_activity_chat_target_can_view  (fichero: 20260718_activity_chat_target.sql, parte 2/2)
-- ─────────────────────────────────────────────────────────────────────────────
-- Chat general de actividad (cambios de actividades): las actividades se vuelven
-- comentables/reaccionables reutilizando el sistema de interacciones (Bloque
-- B/F), con un target nuevo 'club_activity', gateado a participantes. Aplicada en
-- prod como DOS migraciones (el valor de enum debe estar committeado antes de que
-- can_view_target lo use, 55P04); el fichero del repo lo une con el idiom del
-- `commit;`. can_view_target se recrea desde su definición VIGENTE (diary_entry→
-- passes tras el hub), no desde 20260713.
alter type public.target_kind add value if not exists 'club_activity';

create or replace function public.can_view_target(p_target_type public.target_kind, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case p_target_type
    when 'diary_entry' then exists (
      select 1 from public.passes d where d.id = p_target_id and public.can_view_profile(d.user_id)
    )
    when 'episode_watch' then exists (
      select 1 from public.episode_watches e where e.id = p_target_id and public.can_view_profile(e.user_id)
    )
    when 'club_post' then exists (
      select 1 from public.club_posts cp where cp.id = p_target_id and public.is_club_member(cp.club_id)
    )
    when 'comment' then exists (
      select 1 from public.comments c where c.id = p_target_id
        and public.can_view_target(c.target_type, c.target_id)
    )
    when 'activity_checkpoint' then exists (
      select 1 from public.club_activity_checkpoints cc
      where cc.id = p_target_id
        and public.is_activity_participant(cc.activity_id)
        and public.has_reached_checkpoint(cc.id)
    )
    when 'club_activity' then public.is_activity_participant(p_target_id)
  end;
$$;


-- 20260718100000 20260718_activity_interconnection  (fichero: 20260718_activity_interconnection.sql)
-- ─────────────────────────────────────────────────────────────────────────────
-- Interconexión de actividades: columnas de enlace en club_activities + RPC
-- spawn_linked_activity (buddy_read desde un ítem / tierlist al cierre, nace
-- active, solo creador del reto o moderator+) + valor de enum de notificación
-- club_activity_spawned. Aplicada en prod vía MCP apply_migration.

-- EPIC-05 — Interconexión de actividades de club. Ver
-- docs/superpowers/specs/2026-07-18-club-activity-interconnection-design.md
-- Una actividad puede nacer ENLAZADA a otra: una lectura conjunta desde un ítem de un reto por
-- lista (frame 14), o una tierlist con los ítems del reto al cerrarlo (frame 15). Solo las lanza
-- el creador del reto o moderator+ del club, y nacen ya 'active' (no pasan por moderación), por
-- lo que su creación NO puede ir por INSERT de cliente (la RLS fuerza 'proposed') — va por esta
-- RPC atómica.

alter table public.club_activities
  add column spawned_from_activity_id uuid references public.club_activities(id) on delete set null,
  add column spawned_from_item_type public.item_type,
  add column spawned_from_item_id uuid;

create index idx_club_activities_spawned_from
  on public.club_activities (spawned_from_activity_id);

comment on column public.club_activities.spawned_from_activity_id is
  'Actividad padre de la que nació esta (interconexión). Agrupa la cadena en el detalle del reto.';
comment on column public.club_activities.spawned_from_item_type is
  'Tipo del ítem de origen (solo lecturas conjuntas nacidas de un ítem; null en tierlist de cierre).';
comment on column public.club_activities.spawned_from_item_id is
  'Ítem de origen (solo lecturas conjuntas nacidas de un ítem; null en tierlist de cierre).';

-- spawn_linked_activity: crea una actividad hija ya 'active', copia el pool desde el padre y
-- graba el enlace, todo en una transacción. Autorización: creador del padre O moderator+.
create or replace function public.spawn_linked_activity(
  p_parent_activity_id uuid,
  p_kind public.activity_kind,
  p_title text,
  p_from_item_type public.item_type,
  p_from_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_parent_kind public.activity_kind;
  v_parent_status public.activity_status;
  v_created_by uuid;
  v_child_id uuid;
  v_title text := trim(p_title);
begin
  select club_id, kind, status, created_by
    into v_club_id, v_parent_kind, v_parent_status, v_created_by
    from public.club_activities where id = p_parent_activity_id;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if v_created_by <> auth.uid() and not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_title = '' then
    raise exception 'title_required';
  end if;
  if v_parent_kind <> 'list_challenge' then
    raise exception 'unsupported parent kind';
  end if;

  if p_kind = 'buddy_read' then
    if v_parent_status <> 'active' then
      raise exception 'parent must be active';
    end if;
    if p_from_item_type is null or p_from_item_id is null then
      raise exception 'from item required';
    end if;
    if p_from_item_type not in ('book', 'series') then
      raise exception 'buddy read only for book or series';
    end if;
    if not exists (
      select 1 from public.club_activity_items
      where activity_id = p_parent_activity_id
        and item_type = p_from_item_type and item_id = p_from_item_id
    ) then
      raise exception 'item not in parent pool';
    end if;
  elsif p_kind = 'tierlist' then
    if v_parent_status <> 'finished' then
      raise exception 'parent must be finished';
    end if;
    if exists (
      select 1 from public.club_activities
      where spawned_from_activity_id = p_parent_activity_id and kind = 'tierlist'
    ) then
      raise exception 'tierlist already linked';
    end if;
  else
    raise exception 'unsupported child kind';
  end if;

  insert into public.club_activities (
    club_id, kind, title, status, created_by,
    spawned_from_activity_id, spawned_from_item_type, spawned_from_item_id
  ) values (
    v_club_id, p_kind, v_title, 'active', auth.uid(),
    p_parent_activity_id,
    case when p_kind = 'buddy_read' then p_from_item_type else null end,
    case when p_kind = 'buddy_read' then p_from_item_id else null end
  )
  returning id into v_child_id;

  if p_kind = 'buddy_read' then
    insert into public.club_activity_items (activity_id, item_type, item_id, added_by, position)
    values (v_child_id, p_from_item_type, p_from_item_id, auth.uid(), 0);
  else -- tierlist: copia todos los ítems del padre conservando el orden
    insert into public.club_activity_items (activity_id, item_type, item_id, added_by, position)
    select v_child_id, item_type, item_id, auth.uid(), position
      from public.club_activity_items
      where activity_id = p_parent_activity_id;
  end if;

  return v_child_id;
end;
$$;

revoke execute on function public.spawn_linked_activity(uuid, public.activity_kind, text, public.item_type, uuid) from public, anon;
grant execute on function public.spawn_linked_activity(uuid, public.activity_kind, text, public.item_type, uuid) to authenticated;

comment on function public.spawn_linked_activity(uuid, public.activity_kind, text, public.item_type, uuid) is
  'Crea una actividad hija ya active enlazada a un reto por lista: buddy_read desde un ítem (book/series, padre active) o tierlist con todos los ítems (padre finished, oferta única). Solo creador del padre o moderator+.';

alter type public.notification_type add value 'club_activity_spawned';


-- 20260718110000 20260718_activity_interconnection_fix  (fichero: 20260718_activity_interconnection_fix.sql)
-- ─────────────────────────────────────────────────────────────────────────────
-- Fix de revisión de la interconexión: índice único parcial de "una tierlist por reto" +
-- create-or-replace de spawn_linked_activity con FOR UPDATE del padre y guard de título NULL.

-- EPIC-05 — Interconexión de actividades: fix de la revisión de Task 1.
-- (1) Endurece la invariante "oferta única" de la tierlist de cierre: un índice único parcial
--     como backstop duro, más FOR UPDATE sobre la fila del padre que serializa los spawns
--     concurrentes del mismo padre (cierra también la carrera de cambio de estado del padre a
--     mitad de spawn).
-- (2) El guard de título vacío ahora también cubre NULL (trim(NULL) = '' es NULL, no disparaba).

create unique index if not exists club_activities_one_tierlist_per_parent
  on public.club_activities (spawned_from_activity_id)
  where kind = 'tierlist' and spawned_from_activity_id is not null;

create or replace function public.spawn_linked_activity(
  p_parent_activity_id uuid,
  p_kind public.activity_kind,
  p_title text,
  p_from_item_type public.item_type,
  p_from_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_parent_kind public.activity_kind;
  v_parent_status public.activity_status;
  v_created_by uuid;
  v_child_id uuid;
  v_title text := trim(p_title);
begin
  -- FOR UPDATE serializa los spawns concurrentes sobre el mismo padre: cierra tanto la carrera
  -- de la "oferta única" de tierlist como la de un cambio de estado del padre a mitad de spawn.
  select club_id, kind, status, created_by
    into v_club_id, v_parent_kind, v_parent_status, v_created_by
    from public.club_activities where id = p_parent_activity_id
    for update;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if v_created_by <> auth.uid() and not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_title is null or v_title = '' then
    raise exception 'title_required';
  end if;
  if v_parent_kind <> 'list_challenge' then
    raise exception 'unsupported parent kind';
  end if;

  if p_kind = 'buddy_read' then
    if v_parent_status <> 'active' then
      raise exception 'parent must be active';
    end if;
    if p_from_item_type is null or p_from_item_id is null then
      raise exception 'from item required';
    end if;
    if p_from_item_type not in ('book', 'series') then
      raise exception 'buddy read only for book or series';
    end if;
    if not exists (
      select 1 from public.club_activity_items
      where activity_id = p_parent_activity_id
        and item_type = p_from_item_type and item_id = p_from_item_id
    ) then
      raise exception 'item not in parent pool';
    end if;
  elsif p_kind = 'tierlist' then
    if v_parent_status <> 'finished' then
      raise exception 'parent must be finished';
    end if;
    if exists (
      select 1 from public.club_activities
      where spawned_from_activity_id = p_parent_activity_id and kind = 'tierlist'
    ) then
      raise exception 'tierlist already linked';
    end if;
  else
    raise exception 'unsupported child kind';
  end if;

  insert into public.club_activities (
    club_id, kind, title, status, created_by,
    spawned_from_activity_id, spawned_from_item_type, spawned_from_item_id
  ) values (
    v_club_id, p_kind, v_title, 'active', auth.uid(),
    p_parent_activity_id,
    case when p_kind = 'buddy_read' then p_from_item_type else null end,
    case when p_kind = 'buddy_read' then p_from_item_id else null end
  )
  returning id into v_child_id;

  if p_kind = 'buddy_read' then
    insert into public.club_activity_items (activity_id, item_type, item_id, added_by, position)
    values (v_child_id, p_from_item_type, p_from_item_id, auth.uid(), 0);
  else -- tierlist: copia todos los ítems del padre conservando el orden
    insert into public.club_activity_items (activity_id, item_type, item_id, added_by, position)
    select v_child_id, item_type, item_id, auth.uid(), position
      from public.club_activity_items
      where activity_id = p_parent_activity_id;
  end if;

  return v_child_id;
end;
$$;


-- 20260718120000 20260718_spawned_tierlist_default_tiers  (fichero: 20260718_spawned_tierlist_default_tiers.sql)
-- ─────────────────────────────────────────────────────────────────────────────
-- La tierlist de cierre nacía sin niveles (config null). spawn_linked_activity se recrea para
-- fijar los niveles por defecto (espejo de DEFAULT_TIERS) al crear la tierlist, más backfill de
-- las ya creadas. Supersede el create-or-replace del bloque de interconexión anterior.

-- EPIC-05 — Interconexión de actividades: la tierlist de cierre nacía con config = null, así que
-- el tablero la mostraba "sin configurar" (sin niveles). El flujo normal (composer TierlistFields)
-- arranca con DEFAULT_TIERS; el spawn se lo saltaba. Como la hija nace 'active' y el config solo
-- se puede editar en 'proposed' (update_activity_config lo congela al activar), los niveles deben
-- fijarse EN LA CREACIÓN. Se hace aquí dentro de la RPC (misma firma que antes -- create or
-- replace en sitio, sin ventana de redeploy) en vez de por parámetro desde la app.
--
-- Los niveles por defecto REPLICAN DEFAULT_TIERS de src/lib/clubs/activities/tierlist-types.ts
-- (S/A/B/C/D con sus tokens de color). Si allí cambian, actualizar también aquí -- el shape es el
-- que espera parseTierlistConfig: { tiers: [{ label, color }] }.

create or replace function public.spawn_linked_activity(
  p_parent_activity_id uuid,
  p_kind public.activity_kind,
  p_title text,
  p_from_item_type public.item_type,
  p_from_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_parent_kind public.activity_kind;
  v_parent_status public.activity_status;
  v_created_by uuid;
  v_child_id uuid;
  v_title text := trim(p_title);
  v_config jsonb;
begin
  -- FOR UPDATE serializa los spawns concurrentes sobre el mismo padre: cierra tanto la carrera
  -- de la "oferta única" de tierlist como la de un cambio de estado del padre a mitad de spawn.
  select club_id, kind, status, created_by
    into v_club_id, v_parent_kind, v_parent_status, v_created_by
    from public.club_activities where id = p_parent_activity_id
    for update;
  if v_club_id is null then
    raise exception 'not found';
  end if;
  if v_created_by <> auth.uid() and not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if v_title is null or v_title = '' then
    raise exception 'title_required';
  end if;
  if v_parent_kind <> 'list_challenge' then
    raise exception 'unsupported parent kind';
  end if;

  if p_kind = 'buddy_read' then
    if v_parent_status <> 'active' then
      raise exception 'parent must be active';
    end if;
    if p_from_item_type is null or p_from_item_id is null then
      raise exception 'from item required';
    end if;
    if p_from_item_type not in ('book', 'series') then
      raise exception 'buddy read only for book or series';
    end if;
    if not exists (
      select 1 from public.club_activity_items
      where activity_id = p_parent_activity_id
        and item_type = p_from_item_type and item_id = p_from_item_id
    ) then
      raise exception 'item not in parent pool';
    end if;
  elsif p_kind = 'tierlist' then
    if v_parent_status <> 'finished' then
      raise exception 'parent must be finished';
    end if;
    if exists (
      select 1 from public.club_activities
      where spawned_from_activity_id = p_parent_activity_id and kind = 'tierlist'
    ) then
      raise exception 'tierlist already linked';
    end if;
    -- Niveles por defecto (espejo de DEFAULT_TIERS, ver cabecera).
    v_config := jsonb_build_object('tiers', jsonb_build_array(
      jsonb_build_object('label', 'S', 'color', 'var(--status-dropped)'),
      jsonb_build_object('label', 'A', 'color', 'var(--gold)'),
      jsonb_build_object('label', 'B', 'color', 'var(--status-completed)'),
      jsonb_build_object('label', 'C', 'color', 'var(--type-movie)'),
      jsonb_build_object('label', 'D', 'color', 'var(--muted-foreground)')
    ));
  else
    raise exception 'unsupported child kind';
  end if;

  insert into public.club_activities (
    club_id, kind, title, status, created_by, config,
    spawned_from_activity_id, spawned_from_item_type, spawned_from_item_id
  ) values (
    v_club_id, p_kind, v_title, 'active', auth.uid(), v_config,
    p_parent_activity_id,
    case when p_kind = 'buddy_read' then p_from_item_type else null end,
    case when p_kind = 'buddy_read' then p_from_item_id else null end
  )
  returning id into v_child_id;

  if p_kind = 'buddy_read' then
    insert into public.club_activity_items (activity_id, item_type, item_id, added_by, position)
    values (v_child_id, p_from_item_type, p_from_item_id, auth.uid(), 0);
  else -- tierlist: copia todos los ítems del padre conservando el orden
    insert into public.club_activity_items (activity_id, item_type, item_id, added_by, position)
    select v_child_id, item_type, item_id, auth.uid(), position
      from public.club_activity_items
      where activity_id = p_parent_activity_id;
  end if;

  return v_child_id;
end;
$$;

-- Backfill: las tierlists ya creadas por spawn antes de este fix nacieron con config = null y el
-- tablero las mostraba "sin configurar". Se les ponen los mismos niveles por defecto. Seguro:
-- sin niveles no se pudo colocar nada, así que no hay colocaciones que renombrar/huérfanas.
-- Idempotente (solo toca las que siguen con config null).
update public.club_activities
set config = jsonb_build_object('tiers', jsonb_build_array(
  jsonb_build_object('label', 'S', 'color', 'var(--status-dropped)'),
  jsonb_build_object('label', 'A', 'color', 'var(--gold)'),
  jsonb_build_object('label', 'B', 'color', 'var(--status-completed)'),
  jsonb_build_object('label', 'C', 'color', 'var(--type-movie)'),
  jsonb_build_object('label', 'D', 'color', 'var(--muted-foreground)')
))
where kind = 'tierlist' and spawned_from_activity_id is not null and config is null;

-- ── 20260718_collections.sql ──────────────────────────────────────────────
-- Colecciones v2 (plan 02 T7): estanterías del usuario, privadas (RLS
-- solo-dueño), M:N ítem↔colección. `visibility` preparada para futuro público.
create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  visibility  text not null default 'private' check (visibility in ('private','public')),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index collections_user_idx on public.collections (user_id, position, created_at);

create table public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  item_type     item_type not null,
  item_id       uuid not null,
  position      integer not null default 0,
  added_at      timestamptz not null default now(),
  primary key (collection_id, item_type, item_id)
);
create index collection_items_col_idx on public.collection_items (collection_id, position, added_at);

alter table public.collections enable row level security;
create policy collections_owner on public.collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.collection_items enable row level security;
create policy collection_items_owner on public.collection_items
  for all using (
    exists (select 1 from public.collections c
            where c.id = collection_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.collections c
            where c.id = collection_id and c.user_id = auth.uid())
  );

-- ============================================================
-- 20260719_promote_active_pass_after_delete.sql
-- ============================================================

-- Al borrar el pase ACTIVO de una obra con varios pases, la obra desaparecía
-- de la biblioteca en vez de reactivar el pase anterior: solo un pase lleva
-- is_active=true (passes_one_active) y toda la lectura filtra por él. Espeja
-- promote_primary_edition_after_delete: tras borrar el activo, promueve el más
-- reciente que quede (mismo orden que getPasses). AFTER DELETE para no chocar
-- con passes_one_active; el borrado en bloque (removeFromLibrary) no promueve
-- porque no queda superviviente.
create or replace function public.promote_active_pass_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not old.is_active then
    return old;
  end if;

  update public.passes
     set is_active = true
   where id = (
     select id
       from public.passes
      where user_id = old.user_id
        and item_type = old.item_type
        and item_id = old.item_id
      order by finished_on desc nulls first, created_at desc
      limit 1
   );

  return old;
end;
$$;

drop trigger if exists passes_promote_active_after_delete on public.passes;
create trigger passes_promote_active_after_delete
  after delete on public.passes
  for each row execute function public.promote_active_pass_after_delete();

revoke execute on function public.promote_active_pass_after_delete() from public, anon, authenticated;

-- ── 20260719_sagas_hierarchy.sql ──────────────────────────────────────────────────────

-- Sagas v2 fase 1 (spec docs/superpowers/specs/2026-07-19-sagas-v2-design.md §1.1):
-- jerarquía de sagas. Una saga puede tener padre (saga "universo", p. ej.
-- UCM → Iron Man). accent_color es el token Paper con el que se pinta como
-- subsaga dentro de la ficha del padre; null = color rotatorio en render.

alter table public.sagas
  add column parent_saga_id uuid references public.sagas(id) on delete set null,
  add column accent_color text check (
    accent_color in ('terracota','verde','teal','ambar','purpura','beige')
  );

create index sagas_parent_idx on public.sagas (parent_saga_id)
  where parent_saga_id is not null;

-- Anti-ciclos: subir por la cadena de ancestros del nuevo padre; si aparece la
-- propia saga, hay ciclo. Cap de profundidad como cinturón extra (la lectura
-- también capa a 4, §1.5). SECURITY INVOKER basta: SELECT sobre sagas es público.
create or replace function public.saga_parent_no_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cur uuid;
  depth integer := 0;
begin
  if new.parent_saga_id is null then
    return new;
  end if;
  if new.parent_saga_id = new.id then
    raise exception 'saga % cannot be its own parent', new.id;
  end if;
  cur := new.parent_saga_id;
  while cur is not null loop
    depth := depth + 1;
    if depth > 10 then
      raise exception 'saga hierarchy deeper than 10 levels';
    end if;
    if cur = new.id then
      raise exception 'saga hierarchy cycle detected for %', new.id;
    end if;
    select parent_saga_id into cur from public.sagas where id = cur;
  end loop;
  return new;
end;
$$;

create trigger sagas_parent_no_cycle
  before insert or update of parent_saga_id on public.sagas
  for each row execute function public.saga_parent_no_cycle();

-- ── 20260719_saga_multi_membership.sql ──────────────────────────────────────────────────────

-- Sagas v2 fase 1 (spec §1.2): un ítem puede estar en N sagas (crossovers,
-- ítem directo en un universo). is_primary marca la saga que muestran el strip
-- de la ficha de obra y el breadcrumb; única por ítem (índice parcial).

alter table public.saga_items
  drop constraint saga_items_item_key;

alter table public.saga_items
  add constraint saga_items_saga_item_key unique (saga_id, item_type, item_id);

alter table public.saga_items
  add column is_primary boolean not null default false;

-- Backfill: hasta ahora cada ítem tenía como mucho UNA membresía (la
-- constraint borrada lo garantizaba), así que todas pasan a primary.
update public.saga_items set is_primary = true;

create unique index saga_items_primary_idx
  on public.saga_items (item_type, item_id)
  where is_primary;

-- ── 20260719_saga_graph.sql ──────────────────────────────────────────────────────

-- Sagas v2 fase 1 (spec §1.3): grafo de lectura curado. Un nodo referencia un
-- ítem del catálogo O una saga anidada (XOR). La subsaga de un nodo NO se
-- guarda: se deriva de saga_items. order_no define el orden principal;
-- opcional = nodo sin order_no. En fase 1 estas tablas quedan vacías (el
-- editor llega en fase 3); la ficha solo consulta si existen nodos.

create type public.saga_node_level as enum ('principal', 'menor');
create type public.saga_edge_type as enum ('principal', 'opcional', 'requisito');

create table public.saga_nodes (
  id             uuid primary key default gen_random_uuid(),
  saga_id        uuid not null references public.sagas(id) on delete cascade,
  item_type      public.item_type,
  item_id        uuid,
  child_saga_id  uuid references public.sagas(id) on delete cascade,
  x              real not null default 0,
  y              real not null default 0,
  level          public.saga_node_level not null default 'principal',
  order_no       integer check (order_no > 0),
  label_override text check (char_length(label_override) <= 120),
  created_at     timestamptz not null default now(),
  constraint saga_nodes_ref_xor check (
    (item_type is not null and item_id is not null and child_saga_id is null)
    or (item_type is null and item_id is null and child_saga_id is not null)
  )
);
create unique index saga_nodes_item_key on public.saga_nodes (saga_id, item_type, item_id)
  where item_id is not null;
create unique index saga_nodes_child_key on public.saga_nodes (saga_id, child_saga_id)
  where child_saga_id is not null;
create index saga_nodes_saga_idx on public.saga_nodes (saga_id);

create table public.saga_edges (
  id        uuid primary key default gen_random_uuid(),
  saga_id   uuid not null references public.sagas(id) on delete cascade,
  from_node uuid not null references public.saga_nodes(id) on delete cascade,
  to_node   uuid not null references public.saga_nodes(id) on delete cascade,
  edge_type public.saga_edge_type not null default 'principal',
  constraint saga_edges_no_self check (from_node <> to_node),
  constraint saga_edges_pair_key unique (from_node, to_node)
);
create index saga_edges_saga_idx on public.saga_edges (saga_id);

-- RLS: catálogo compartido — lectura pública, escritura = curación (collaborator+,
-- mismo gate que sagas/saga_items, §7.35).
alter table public.saga_nodes enable row level security;
create policy "saga nodes readable" on public.saga_nodes
  for select to anon, authenticated using (true);
create policy "saga nodes writable by collaborators" on public.saga_nodes
  for all to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));

alter table public.saga_edges enable row level security;
create policy "saga edges readable" on public.saga_edges
  for select to anon, authenticated using (true);
create policy "saga edges writable by collaborators" on public.saga_edges
  for all to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));

-- ── 20260719_saga_follows.sql ──────────────────────────────────────────────────────

-- Sagas v2 fase 1 (spec §1.4): seguimiento explícito de sagas. Alimenta el
-- botón «Seguir esta saga» del hero (fase 1) y la pestaña Sagas de Mi
-- Biblioteca (fase 4). RLS solo-dueño, patrón collections.

create table public.saga_follows (
  user_id    uuid not null references auth.users(id) on delete cascade,
  saga_id    uuid not null references public.sagas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, saga_id)
);
create index saga_follows_saga_idx on public.saga_follows (saga_id);

alter table public.saga_follows enable row level security;
create policy saga_follows_owner on public.saga_follows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 20260719_saga_items_update_policy.sql ──────────────────────────────────────────────────────

-- Sagas v2 fase 1: saga_items no tenía política de UPDATE (el modelo viejo
-- solo borraba+insertaba). La necesitan el upsert de assignItemToSaga y el
-- sync de posiciones de populateTmdbCollection. Curación = collaborator+
-- (§7.35), igual que el DELETE: para no-colaboradores el sync de posiciones
-- es no-op silencioso, como ya lo era el delete+insert anterior.
create policy "saga items updatable by collaborators" on public.saga_items
  for update to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));

-- ── 20260719_sagas_insert_hardening.sql ──────────────────────────────────────────────────────

-- Sagas v2 fase 1 — endurecimiento pre-prod (revisión final): crear sagas
-- sueltas sigue abierto a autenticados (lo necesita el cache-as-you-go de
-- persist-collection.ts), pero colgar una saga como hija de otra
-- (parent_saga_id) es curación de jerarquía → collaborator+ (§7.35). Sin esto,
-- cualquier autenticado podría colgar sagas basura de un universo curado vía
-- PostgREST y aparecerían como subsagas en la ficha.

drop policy "sagas insertable" on public.sagas;
create policy "sagas insertable" on public.sagas
  for insert to authenticated
  with check (parent_saga_id is null or public.has_min_role('collaborator'));

-- ── 20260719_save_saga_graph_rpc.sql ─────────────────────────────────────────────────────────

-- Sagas v2 fase 3 (spec §3.2): guardado atómico del grafo. El editor manda el
-- borrador completo y esta función hace el full-replace de saga_nodes y
-- saga_edges en UNA transacción (patrón spawn_linked_activity): sin estados a
-- medias si una arista referencia un nodo inválido (los FKs y el XOR de la
-- tabla validan dentro de la misma transacción). El cliente genera los uuid de
-- los nodos para poder referenciarlos desde las aristas antes de guardar.
-- SECURITY DEFINER + gate interno collaborator+ (§7.35); RLS de las tablas ya
-- exige lo mismo, esto lo hace explícito e independiente del rol de la sesión.

create or replace function public.save_saga_graph(
  p_saga_id uuid,
  p_nodes jsonb,
  p_edges jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_min_role('collaborator') then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from sagas where id = p_saga_id) then
    raise exception 'saga % not found', p_saga_id;
  end if;

  delete from saga_edges where saga_id = p_saga_id;
  delete from saga_nodes where saga_id = p_saga_id;

  insert into saga_nodes (id, saga_id, item_type, item_id, child_saga_id, x, y, level, order_no, label_override)
  select
    (n->>'id')::uuid,
    p_saga_id,
    (n->>'item_type')::public.item_type,
    (n->>'item_id')::uuid,
    (n->>'child_saga_id')::uuid,
    coalesce((n->>'x')::real, 0),
    coalesce((n->>'y')::real, 0),
    coalesce(n->>'level', 'principal')::public.saga_node_level,
    (n->>'order_no')::integer,
    nullif(n->>'label_override', '')
  from jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb)) as n;

  insert into saga_edges (saga_id, from_node, to_node, edge_type)
  select
    p_saga_id,
    (e->>'from_node')::uuid,
    (e->>'to_node')::uuid,
    coalesce(e->>'edge_type', 'principal')::public.saga_edge_type
  from jsonb_array_elements(coalesce(p_edges, '[]'::jsonb)) as e;
end;
$$;

revoke execute on function public.save_saga_graph(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_saga_graph(uuid, jsonb, jsonb) to authenticated;

-- DEFER F1: el inspector lista «aristas entrantes» de un nodo (to_node) y el
-- único índice existente empieza por from_node.
create index saga_edges_to_node_idx on public.saga_edges (to_node);

-- ── 20260719_sagas_delete_policy.sql ─────────────────────────────────────────────────────────

-- Mejoras post-v2 §3 (borrar saga): sagas tenía RLS con políticas de
-- SELECT/INSERT/UPDATE pero NINGUNA de DELETE, así que el DELETE de la action
-- deleteSaga afectaba 0 filas sin error (hallazgo Critical de la revisión).
-- Borrar una saga es curación → collaborator+ (§7.35). Las cascadas de
-- saga_items/saga_nodes/saga_edges/saga_follows son acciones referenciales
-- (exentas de RLS) y parent_saga_id hace set null: las subsagas sobreviven
-- como raíces.

create policy "sagas deletable by collaborators" on public.sagas
  for delete to authenticated
  using (public.has_min_role('collaborator'));

-- ── 20260720_onboarding.sql ──────────────────────────────────────────────────────────────────
-- Aplicada en prod el 2026-07-20 (ledger: version 20260720105805, name "onboarding").
--
-- interests   : respuesta del paso 1 del onboarding. Null = sin responder; el flujo lo trata
--               entonces como "los tres tipos", nunca como "ninguno".
-- onboarded_at: marca de completado. ES el gate de /onboarding.
alter table public.profiles
  add column interests public.item_type[],
  add column onboarded_at timestamptz;

-- Los grants de profiles son POR COLUMNA (ver 20260714_passes_grants.sql y
-- 20260717_progress_sessions_started_at.sql): una columna nueva NO entra sola. Sin esto, el
-- update del onboarding falla con "permission denied for column". Solo authenticated: el flujo
-- exige sesión y ninguna consulta anónima pide estas columnas.
grant select (interests, onboarded_at) on public.profiles to authenticated;
grant update (interests, onboarded_at) on public.profiles to authenticated;

-- Backfill: los perfiles que ya existen NO deben ver el asistente retroactivamente.
update public.profiles
   set onboarded_at = now()
 where onboarded_at is null;

comment on column public.profiles.interests is
  'Tipos que le interesan al usuario (paso 1 del onboarding). Null = sin responder, y entonces el flujo asume los tres.';
comment on column public.profiles.onboarded_at is
  'Cuando termino el onboarding. Null = no lo ha hecho; ES el gate de /onboarding. Se escribe al llegar a la bienvenida, tanto si completo como si salto.';

-- ── 20260721_notes_social_columns.sql ───────────────────────────────────────────────────────────
-- Aplicada en prod el 2026-07-21 (verificado contra columnas/índices/policies reales de
-- public.notes, no contra el ledger).
--
-- Notas y citas · Plan A. Cuatro columnas para cerrar el modelo de una vez.
-- `is_public` y `parent_note_id` se crean SIN UI en este ciclo (ver la spec
-- 2026-07-21-notas-captura-design.md, D2/D3).
--
-- RLS NO SE TOCA. Las cuatro políticas de dueño siguen siendo las únicas: abrir
-- la lectura pública antes de que exista el filtro spoiler-safe sería justo la
-- fuga que `is_public` viene a evitar. La columna registra intención; F2 la
-- honra cuando haya muro.

alter table public.notes
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists is_spoiler boolean not null default false,
  add column if not exists is_public boolean not null default false,
  add column if not exists parent_note_id uuid null
    references public.notes(id) on delete set null;

-- ON DELETE SET NULL, coherente con pass_id/session_id: borrar la cita padre no
-- debe llevarse por delante la nota hija.
create index if not exists idx_notes_parent
  on public.notes (parent_note_id) where parent_note_id is not null;

-- El único índice que había (idx_notes_user, sobre (user_id, created_at desc))
-- sirve al cuaderno por recientes, pero no a la lista de la ficha, que filtra
-- por obra.
create index if not exists idx_notes_item
  on public.notes (user_id, item_type, item_id);

-- ──────────────────────────────────────────────────────────────────────────
-- ANEXO 2026-07-22 — Eventos de club (kind `evento`)
-- Aplicadas a prod el 2026-07-22, en este orden. Verificadas contra pg_type y
-- pg_proc (no contra list_migrations), con el md5 del cuerpo normalizado de
-- ambas RPC idéntico en dev y prod.
--
-- Los dos `add value` van SOLOS y ANTES que las RPC a propósito: Postgres
-- prohíbe usar un valor de enum en la misma transacción que lo añade, así que
-- una función que compare `kind = 'evento'` no puede viajar con ellos.
-- ──────────────────────────────────────────────────────────────────────────

-- 20260722_activity_kind_evento
alter type public.activity_kind add value 'evento';
alter type public.notification_type add value 'club_event_created';
-- 20260722_club_event_rpcs
-- RPCs de eventos de club (spec 2026-07-22 §2.2). Separadas del `add value`
-- (20260722_activity_kind_evento.sql) por la restricción transaccional de enums.

-- create_club_event: existe porque la política "club_activities insert member"
-- FUERZA status='proposed' -- y un evento no se propone: lo crea quien tiene
-- autoridad para fijar la fecha, y al crearlo ya está fijada.
create or replace function public.create_club_event(
  p_club_id uuid,
  p_title text,
  p_description text,
  p_starts_on date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_min_club_role(p_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if p_starts_on is null then
    raise exception 'starts_on required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;

  insert into public.club_activities
    (club_id, kind, title, description, status, created_by, starts_on)
  values
    (p_club_id,
     'evento',
     trim(p_title),
     nullif(trim(coalesce(p_description, '')), ''),
     'active',
     auth.uid(),
     p_starts_on)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_club_event(uuid, text, text, date) from public, anon;
grant execute on function public.create_club_event(uuid, text, text, date) to authenticated;

-- update_club_event: el UPDATE que club_activities no tiene -- Bloque G dejó la
-- tabla sin política UPDATE a propósito, con las transiciones encapsuladas en RPCs.
--
-- OJO: el `and kind = 'evento'` del UPDATE es OBLIGATORIO, no defensivo. Sin él,
-- esta función -- SECURITY DEFINER y gateada solo por rol -- deja a un moderador
-- reescribir título, descripción y fechas de cualquier buddy_read o
-- list_challenge por la puerta de atrás. Eso es exactamente la edición arbitraria
-- que SD-8 evitó al no crear la política.
--
-- Mismo motivo para `and status = 'active'`: un evento nace 'active' y solo puede
-- pasar a 'archived' (nunca 'proposed' ni 'finished'), así que 'active' es el único
-- estado editable -- sin este guard, un moderador podría reescribir un evento ya
-- archivado.
create or replace function public.update_club_event(
  p_activity_id uuid,
  p_title text,
  p_description text,
  p_starts_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_kind public.activity_kind;
  v_status public.activity_status;
begin
  select club_id, kind, status into v_club_id, v_kind, v_status
  from public.club_activities where id = p_activity_id;

  if v_club_id is null then
    raise exception 'not found';
  end if;
  if v_kind <> 'evento' then
    raise exception 'not an event';
  end if;
  if v_status <> 'active' then
    raise exception 'event not active';
  end if;
  if not public.has_min_club_role(v_club_id, 'moderator') then
    raise exception 'forbidden';
  end if;
  if p_starts_on is null then
    raise exception 'starts_on required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;

  update public.club_activities
  set title = trim(p_title),
      description = nullif(trim(coalesce(p_description, '')), ''),
      starts_on = p_starts_on
  where id = p_activity_id and kind = 'evento' and status = 'active';
end;
$$;

revoke execute on function public.update_club_event(uuid, text, text, date) from public, anon;
grant execute on function public.update_club_event(uuid, text, text, date) to authenticated;

comment on function public.create_club_event(uuid, text, text, date) is
  'Crea un evento de club (kind=evento, status=active) saltando la RLS de INSERT que fuerza proposed. Moderador+.';
comment on function public.update_club_event(uuid, text, text, date) is
  'Edita título/descripción/fecha de un EVENTO. Moderador+. Restringida a kind=evento y status=active a propósito.';


-- ──────────────────────────────────────────────────────────────────────────
-- 20260722_saga_items_rls_hardening
-- Issue #169: cierra el INSERT de saga_items, la última escritura abierta a
-- cualquier `authenticated`. NO era un descuido: la migración que cerró el
-- DELETE lo dejó así por escrito porque lo necesitaba el cache-as-you-go de
-- persist-collection.ts. Se le quita la razón de existir moviendo la
-- hidratación TMDB a dos funciones SECURITY DEFINER acotadas a sagas TMDB.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.link_tmdb_saga_item(
  p_saga_id uuid,
  p_item_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_primary boolean;
begin
  if not exists (
    select 1 from sagas
    where id = p_saga_id and source = 'tmdb' and tmdb_collection_id is not null
  ) then
    raise exception 'saga % is not a tmdb collection', p_saga_id;
  end if;

  select exists (
    select 1 from saga_items
    where item_type = 'movie' and item_id = p_item_id and is_primary
  ) into v_has_primary;

  insert into saga_items (saga_id, item_type, item_id, is_primary)
  values (p_saga_id, 'movie', p_item_id, not v_has_primary)
  on conflict (saga_id, item_type, item_id) do nothing;
exception
  when unique_violation then
    insert into saga_items (saga_id, item_type, item_id, is_primary)
    values (p_saga_id, 'movie', p_item_id, false)
    on conflict (saga_id, item_type, item_id) do nothing;
end;
$$;

create or replace function public.sync_tmdb_saga_items(
  p_saga_id uuid,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from sagas
    where id = p_saga_id and source = 'tmdb' and tmdb_collection_id is not null
  ) then
    raise exception 'saga % is not a tmdb collection', p_saga_id;
  end if;

  insert into saga_items (saga_id, item_type, item_id, position, is_primary)
  select p_saga_id, 'movie', (i->>'item_id')::uuid, (i->>'position')::integer, false
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i
  on conflict (saga_id, item_type, item_id)
    do update set position = excluded.position;
end;
$$;

revoke execute on function public.link_tmdb_saga_item(uuid, uuid) from public, anon;
revoke execute on function public.sync_tmdb_saga_items(uuid, jsonb) from public, anon;
grant execute on function public.link_tmdb_saga_item(uuid, uuid) to authenticated;
grant execute on function public.sync_tmdb_saga_items(uuid, jsonb) to authenticated;

drop policy "saga items insertable" on public.saga_items;

create policy "saga items insertable by collaborators" on public.saga_items
  for insert to authenticated
  with check (public.has_min_role('collaborator'));

comment on function public.link_tmdb_saga_item(uuid, uuid) is
  'Alta de una película en su colección TMDB saltando la RLS de INSERT (collaborator+). Acotada a sagas source=tmdb.';
comment on function public.sync_tmdb_saga_items(uuid, jsonb) is
  'Rellenado perezoso de una colección TMDB: inserta lo que falte y corrige posiciones. Nunca borra. Acotada a sagas source=tmdb.';
