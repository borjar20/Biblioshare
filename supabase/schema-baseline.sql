-- ============================================================================
-- Biblioshare — esquema consolidado (replay de las migraciones de producción)
-- Generado desde supabase_migrations.schema_migrations el 2026-07-10.
-- Uso: aplicar EN ORDEN en un proyecto Supabase limpio (SQL editor o psql)
-- para replicar el esquema de producción (p. ej. el proyecto dev).
-- No incluye datos. Tras aplicarlo, crear el usuario de prueba vía signup.
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
