-- #674 parte E: alta = shell sin canónicos. El cliente aporta SOLO el id externo;
-- ningún campo canónico entra por aquí. SECURITY DEFINER escribe como owner, así
-- que no necesita el grant de INSERT (que se revoca en la parte F). on conflict
-- do nothing + re-select resuelve la carrera igual que hoy (23505). raise si
-- auth.uid() null (mismo observable que el 42501 de antes: anónimo no crea catálogo).
create or replace function public.register_catalog_item(
  p_item_type text,
  p_external_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_item_type = 'book' then
    insert into public.books (openlibrary_work_key) values (p_external_id)
      on conflict (openlibrary_work_key) do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from public.books where openlibrary_work_key = p_external_id;
    end if;
  elsif p_item_type = 'movie' then
    insert into public.movies (tmdb_id) values (p_external_id::int)
      on conflict (tmdb_id) do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from public.movies where tmdb_id = p_external_id::int;
    end if;
  elsif p_item_type = 'series' then
    insert into public.series (tmdb_id) values (p_external_id::int)
      on conflict (tmdb_id) do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from public.series where tmdb_id = p_external_id::int;
    end if;
  else
    raise exception 'unknown item type: %', p_item_type;
  end if;

  return v_id;
end;
$$;

-- Alta en lote para el camino de créditos de persona (una llamada, no N).
create or replace function public.register_catalog_items_bulk(
  p_item_type text,
  p_external_ids text[]
)
returns table(external_id text, id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_item_type = 'book' then
    insert into public.books (openlibrary_work_key)
      select unnest(p_external_ids) on conflict (openlibrary_work_key) do nothing;
    return query
      select b.openlibrary_work_key, b.id from public.books b
       where b.openlibrary_work_key = any(p_external_ids);
  elsif p_item_type = 'movie' then
    insert into public.movies (tmdb_id)
      select unnest(p_external_ids)::int on conflict (tmdb_id) do nothing;
    return query
      select m.tmdb_id::text, m.id from public.movies m
       where m.tmdb_id = any(select unnest(p_external_ids)::int);
  elsif p_item_type = 'series' then
    insert into public.series (tmdb_id)
      select unnest(p_external_ids)::int on conflict (tmdb_id) do nothing;
    return query
      select s.tmdb_id::text, s.id from public.series s
       where s.tmdb_id = any(select unnest(p_external_ids)::int);
  else
    raise exception 'unknown item type: %', p_item_type;
  end if;
end;
$$;

revoke all on function public.register_catalog_item(text, text) from public;
grant execute on function public.register_catalog_item(text, text) to authenticated;
revoke all on function public.register_catalog_items_bulk(text, text[]) from public;
grant execute on function public.register_catalog_items_bulk(text, text[]) to authenticated;

comment on function public.register_catalog_item is
  '#674: alta de catálogo = shell con SOLO el id externo. Los canónicos los pone la hidratación server-side. Ver spec 2026-08-14.';
