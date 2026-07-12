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
