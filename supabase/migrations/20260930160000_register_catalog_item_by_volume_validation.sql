-- #924: Google Books documents volume IDs as opaque unique strings, without a
-- formal grammar. This is therefore a conservative project input boundary,
-- not a claim about every valid Google Books identifier.
create or replace function public.register_catalog_item_by_volume(p_volume_id text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if p_volume_id is null or btrim(p_volume_id) = '' then
    raise exception 'volume id required';
  end if;
  if char_length(btrim(p_volume_id)) > 256
     or (btrim(p_volume_id) collate "C") !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'invalid volume id';
  end if;

  insert into public.books (google_books_volume_id)
    values (btrim(p_volume_id))
    on conflict (google_books_volume_id) do nothing
    returning id into v_id;
  if v_id is null then
    select id into v_id from public.books where google_books_volume_id = btrim(p_volume_id);
  end if;

  return v_id;
end;
$$;

revoke all on function public.register_catalog_item_by_volume(text) from public;
revoke all on function public.register_catalog_item_by_volume(text) from anon;
grant execute on function public.register_catalog_item_by_volume(text) to authenticated;

comment on function public.register_catalog_item_by_volume is
  'Alta de shell de libro a partir de un volume id de Google Books. Acepta el límite de proyecto conservador ASCII URL-safe [A-Za-z0-9_-], de 1 a 256 caracteres; Google documenta el identificador como opaco, sin que este filtro afirme una gramática oficial. Nace vacía (sin título/portada/repr_meta); los canónicos llegan después vía hidratación. Idempotente: on conflict do nothing + re-select sobre el índice único de google_books_volume_id. Requiere sesión (auth.uid()); anon sin execute.';
