-- La edición primaria la fija la base de datos, no la app.
--
-- El backfill de 20260714_editions.sql solo cubrió las obras que YA existían.
-- Una obra que entra nueva al catálogo (desde la búsqueda) se quedaría sin
-- edición primaria — y una película nueva, directamente sin ninguna versión.
-- Y la app no puede arreglarlo por su cuenta: `is_primary` está fuera de los
-- grants por columna, precisamente para que un usuario no pueda decidir cuál
-- es la edición canónica de una obra.
--
-- Así que lo hace Postgres:
--   1. Al nacer una obra, nace su edición primaria con los datos de la ficha.
--   2. Cualquier edición insertada en una obra que aún no tenga primaria pasa
--      a serlo (red de seguridad: obras huérfanas, ediciones creadas antes de
--      que existiera su primaria).

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
    (new.id, 'Edición principal', new.publisher, new.published_year,
     new.total_pages, new.isbn, new.cover_url, true)
  on conflict do nothing;
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
    (new.id, 'Versión principal', new.release_year, new.duration_minutes, true)
  on conflict do nothing;
  return new;
end;
$$;

create trigger books_create_primary_edition
  after insert on public.books
  for each row execute function public.create_primary_book_edition();

create trigger movies_create_primary_version
  after insert on public.movies
  for each row execute function public.create_primary_movie_version();

-- Red de seguridad: si la obra no tiene primaria todavía, la edición que entre
-- se convierte en la primaria. Va en un BEFORE INSERT porque escribe sobre la
-- propia fila (NEW), y así esquiva limpiamente el grant por columna: el
-- usuario no menciona `is_primary` en su INSERT, lo pone el trigger.
create or replace function public.ensure_primary_book_edition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.book_editions
    where book_id = new.book_id and is_primary
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
    select 1 from public.movie_versions
    where movie_id = new.movie_id and is_primary
  ) then
    new.is_primary := true;
  end if;
  return new;
end;
$$;

create trigger book_editions_ensure_primary
  before insert on public.book_editions
  for each row execute function public.ensure_primary_book_edition();

create trigger movie_versions_ensure_primary
  before insert on public.movie_versions
  for each row execute function public.ensure_primary_movie_version();
