-- Endurecimiento de las ediciones. Dos agujeros de la tanda anterior:
--
-- 1) UNA EDICIÓN MALA NO PUEDE TUMBAR LA OBRA. `books` no valida nada, pero
--    `book_editions` sí (total_pages between 1 and 20000, año entre 1400 y
--    2200). Google Books devuelve `pageCount: 0` a menudo, así que el trigger
--    que crea la edición primaria propagaba un check_violation y abortaba el
--    INSERT del libro entero: ese título quedaba imposible de añadir para
--    siempre. Ahora el trigger sanea lo que copia y, si aun así falla, avisa y
--    deja nacer la obra sin edición primaria (la red del BEFORE INSERT la
--    creará en cuanto llegue una edición válida).
--
-- 2) EL CATÁLOGO NO SE ESCRIBE A PELO. La política "book_editions from catalog
--    sources" dejaba a cualquier autenticado insertar una edición en CUALQUIER
--    libro, con editorial, portada y páginas arbitrarias, con solo poner algo
--    de 10–20 caracteres en `isbn`. Eso es escribir en el catálogo compartido
--    sin ser colaborador, que es justo lo que la curación quería evitar. Se
--    sustituye por una función que valida el ISBN de verdad y deja rastro de
--    quién la llamó.

drop policy if exists "book_editions from catalog sources" on public.book_editions;

-- Sanea lo que viene de una fuente externa: 0 páginas no es "cero páginas", es
-- "no lo sé"; un año imposible tampoco es un año.
create or replace function public.sane_pages(p integer)
returns integer language sql immutable as $$
  select case when p between 1 and 20000 then p end;
$$;

create or replace function public.sane_year(y integer)
returns integer language sql immutable as $$
  select case when y between 1400 and 2200 then y end;
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
    (new.id, 'Edición principal', new.publisher, public.sane_year(new.published_year),
     public.sane_pages(new.total_pages),
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
    (new.id, 'Versión principal', public.sane_year(new.release_year),
     case when new.duration_minutes between 1 and 1200 then new.duration_minutes end,
     true)
  on conflict do nothing;
  return new;
exception when others then
  raise warning 'version primaria omitida para la pelicula %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- Alta de edición desde una fuente de catálogo (la búsqueda). No es curación a
-- mano —el ISBN lo eligió el usuario en Google Books—, así que no exige ser
-- colaborador; pero pasa por aquí y no por un INSERT directo, para poder
-- validar el ISBN de verdad (10 o 13 dígitos, con su dígito de control) y
-- dejar firmado quién lo hizo. SECURITY DEFINER: el insert lo hace la función,
-- no el usuario, que sigue sin permiso de escritura directa.
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
      v_sum := v_sum + (substr(v_digits, v_i, 1))::integer * case when v_i % 2 = 0 then 3 else 1 end;
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
     public.sane_year(p_year), public.sane_pages(p_pages), v_digits, p_cover_url, auth.uid())
  on conflict do nothing
  returning id into v_id;

  return v_id;  -- null si ya existía: el alta es idempotente
end;
$$;

revoke all on function public.register_book_edition(uuid, text, text, text, integer, integer, text) from public;
grant execute on function public.register_book_edition(uuid, text, text, text, integer, integer, text) to authenticated;
