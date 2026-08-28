-- Task 3 del plan obra/edición/representación (spec §4): alta de obra SOLO
-- para el camino ISBN-que-OpenLibrary-no-conoce. Hoy `register_catalog_item`
-- (20260818) únicamente sabe nacer una shell de libro a partir de
-- `openlibrary_work_key`; cuando la búsqueda por ISBN solo encuentra el
-- volumen en Google Books (OL no lo tiene indexado) no hay forma de dar de
-- alta esa obra. Mismo patrón que `register_catalog_item` (#674): la shell
-- nace VACÍA — solo con el id externo — y los canónicos (título, portada,
-- sinopsis) llegan después vía hidratación, nunca desde el cliente.
--
-- `google_books_volume_id` y su índice único SIN predicado ya existen desde
-- 20260882; el `on conflict` de abajo se apoya en ese índice.

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

-- `revoke ... from public` NO basta (#831): Supabase concede execute a anon
-- y authenticated vía ALTER DEFAULT PRIVILEGES al crear la función, no vía
-- PUBLIC. Hay que nombrar a anon explícitamente.
revoke all on function public.register_catalog_item_by_volume(text) from public;
revoke all on function public.register_catalog_item_by_volume(text) from anon;
grant execute on function public.register_catalog_item_by_volume(text) to authenticated;

comment on function public.register_catalog_item_by_volume is
  'Alta de shell de libro (spec §4) a partir de un volume id de Google Books: SOLO para el camino ISBN-que-OpenLibrary-no-conoce. Nace vacía (sin título/portada/repr_meta) — los canónicos llegan por hidratación, nunca desde el cliente. Idempotente: on conflict do nothing + re-select sobre el índice único de google_books_volume_id (20260882). Requiere sesión (auth.uid()); anon sin execute.';
