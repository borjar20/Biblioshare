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

-- Limpieza de las primarias en blanco ya creadas por el bug (dev y prod). Si el
-- libro tiene además ediciones reales, se promueve la mejor a primaria DESPUÉS
-- de borrar la blanca (el índice único parcial (book_id) where is_primary exige
-- que solo haya una, por eso primero se borra y luego se promueve).
do $$
declare b record;
begin
  for b in
    select id as blank_id, book_id
    from public.book_editions
    where is_primary
      and publisher is null
      and isbn is null
      and total_pages is null
  loop
    delete from public.book_editions where id = b.blank_id;

    update public.book_editions
       set is_primary = true
     where id = (
       select id
       from public.book_editions
       where book_id = b.book_id
       order by (publisher is not null or total_pages is not null) desc,
                published_year desc nulls last
       limit 1
     );
  end loop;
end $$;
