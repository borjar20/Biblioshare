-- Initial schema recovered from the historical baseline (2026-07-07 through 2026-07-09).
-- Source: main bdcdd7c; later migrations are listed exactly once in manifest.json.

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
