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
