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
