-- Alta MANUAL de catálogo (#674, cabo suelto). La parte F revocó el INSERT
-- directo sobre books/movies/series dejando `register_catalog_item` como única
-- puerta de alta, pero esa RPC solo sabe nacer una shell a partir de un id
-- EXTERNO (openlibrary_work_key / tmdb_id). El alta manual no tiene ninguno:
-- su call site (src/app/buscar/manual/actions.ts) se quedó con el insert
-- directo y desde entonces muere con 42501 "permission denied for table books"
-- — que la server action traga como error "generic".
--
-- Esta RPC es la puerta que le faltaba: mismo patrón definer que
-- register_catalog_item, pero con los canónicos que teclea el colaborador.
--
-- Cliente NO fiable: title/creator/año/páginas/ISBN vienen de un formulario, así
-- que se sanean aquí y el rol se comprueba EN SERVIDOR — el check de
-- hasMinRole() en la server action es defensa en profundidad, no la barrera.
--
-- hydrated_at se queda a null a propósito: la fila manual entra en el curador
-- de la ficha igual que cualquier otra (ensureBookHydrated ya contempla el caso
-- "alta manual" — resuelve work key por ISBN o la marca hidratada), y hydrate_book
-- es fill-only, nunca pisa lo que el colaborador escribió.
create or replace function public.register_manual_catalog_item(
  p_item_type text,
  p_title text,
  p_creator text default null,
  p_year int default null,
  p_cover_url text default null,
  p_publisher text default null,
  p_total_pages int default null,
  p_isbn text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_title text := nullif(btrim(p_title), '');
  v_creator text := nullif(btrim(p_creator), '');
  v_cover_url text := nullif(btrim(p_cover_url), '');
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  -- Crear ítems a mano es contribución curada → colaborador+ (§7.35). NULL
  -- (perfil sin rol) cae en el coalesce y se rechaza; sin él la comparación
  -- daría NULL y dejaría pasar.
  if coalesce(public.current_user_role(), 'user') not in ('collaborator', 'admin') then
    raise exception 'forbidden';
  end if;

  if v_title is null then
    raise exception 'title required';
  end if;

  if p_total_pages is not null and p_total_pages < 0 then
    raise exception 'invalid page count';
  end if;

  if p_item_type = 'book' then
    insert into public.books (title, author, published_year, cover_url, publisher, total_pages, isbn)
    values (v_title, v_creator, p_year, v_cover_url, nullif(btrim(p_publisher), ''), p_total_pages, nullif(btrim(p_isbn), ''))
    returning id into v_id;
  elsif p_item_type = 'movie' then
    insert into public.movies (title, director, release_year, cover_url)
    values (v_title, v_creator, p_year, v_cover_url)
    returning id into v_id;
  elsif p_item_type = 'series' then
    insert into public.series (title, creator, release_year, cover_url)
    values (v_title, v_creator, p_year, v_cover_url)
    returning id into v_id;
  else
    raise exception 'unknown item type: %', p_item_type;
  end if;

  return v_id;
end;
$function$;

-- `revoke ... from public` NO basta: Supabase concede execute a anon y authenticated
-- por ALTER DEFAULT PRIVILEGES en el momento de crear la funcion, y ese grant es
-- explicito, no via PUBLIC. Hay que nombrar a anon. (register_catalog_item se dejo
-- este cabo suelto y anon tiene execute sobre ella en dev y prod — issue aparte.)
-- La funcion ya rechaza al anonimo por auth.uid() null; esto es defensa en profundidad.
revoke all on function public.register_manual_catalog_item(text, text, text, int, text, text, int, text) from public;
revoke all on function public.register_manual_catalog_item(text, text, text, int, text, text, int, text) from anon;
grant execute on function public.register_manual_catalog_item(text, text, text, int, text, text, int, text) to authenticated;
