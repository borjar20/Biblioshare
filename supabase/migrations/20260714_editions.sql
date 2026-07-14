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
