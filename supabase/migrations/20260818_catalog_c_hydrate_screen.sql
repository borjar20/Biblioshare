-- #674 parte C: hidratación de pantalla (peli/serie), hermana de hydrate_book.
-- FILL-ONLY puro: solo rellena columnas vacías (null/''), nunca pisa lo que ya
-- hay (protege la curación de un colaborador). Marca hydrated_at para no volver a
-- preguntar al proveedor. Activa el flag app.hydrating para pasar el trigger
-- enforce_catalog_edit_collaborator_only (ver 20260818_catalog_b_hydration_bypass).
--
-- No hace falta "escritura autoritativa": las shells nacen SIN canónicos
-- (register_catalog_item + revoke del INSERT directo, partes E/F), así que la
-- hidratación siempre encuentra huecos, nunca valores que pisar.
--
-- El flag se ACTIVA justo antes del UPDATE y se APAGA justo después, en el mismo
-- cuerpo. `set_config(..., true)` dura toda la transacción, así que sin el 'off'
-- el bypass se filtraría a un UPDATE posterior en la misma transacción (p. ej. el
-- loop de hydrate_screens_bulk). El atributo `set` de función sería más limpio,
-- pero app.hydrating no es un GUC registrado y setearlo así da 42501. La única
-- ventana con el flag activo es el propio UPDATE de hidratación; si lanzara, la
-- transacción aborta y el flag se descarta con el rollback.
create or replace function public.hydrate_movie(
  p_movie_id uuid,
  p_title text default null,
  p_original_title text default null,
  p_director text default null,
  p_synopsis text default null,
  p_genres text[] default null,
  p_release_year int default null,
  p_cover_url text default null,
  p_duration_minutes int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  perform set_config('app.hydrating', 'on', true);
  update public.movies set
    title            = case when (title is null or title = '') and p_title is not null then p_title else title end,
    original_title   = case when (original_title is null or original_title = '') and p_original_title is not null then p_original_title else original_title end,
    director         = case when (director is null or director = '') and p_director is not null then p_director else director end,
    synopsis         = case when (synopsis is null or synopsis = '') and p_synopsis is not null then left(p_synopsis, 5000) else synopsis end,
    genres           = case when (genres is null or cardinality(genres) = 0) and p_genres is not null then p_genres else genres end,
    release_year     = case when release_year is null and p_release_year is not null then p_release_year else release_year end,
    cover_url        = case when (cover_url is null or cover_url = '') and p_cover_url is not null then p_cover_url else cover_url end,
    duration_minutes = case when duration_minutes is null and p_duration_minutes is not null then p_duration_minutes else duration_minutes end,
    hydrated_at      = now()
  where id = p_movie_id;
  perform set_config('app.hydrating', 'off', true);
end;
$$;

create or replace function public.hydrate_series(
  p_series_id uuid,
  p_title text default null,
  p_original_title text default null,
  p_creator text default null,
  p_synopsis text default null,
  p_genres text[] default null,
  p_release_year int default null,
  p_cover_url text default null,
  p_total_seasons int default null,
  p_total_episodes int default null,
  p_episode_runtime_minutes int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  perform set_config('app.hydrating', 'on', true);
  update public.series set
    title                   = case when (title is null or title = '') and p_title is not null then p_title else title end,
    original_title          = case when (original_title is null or original_title = '') and p_original_title is not null then p_original_title else original_title end,
    creator                 = case when (creator is null or creator = '') and p_creator is not null then p_creator else creator end,
    synopsis                = case when (synopsis is null or synopsis = '') and p_synopsis is not null then left(p_synopsis, 5000) else synopsis end,
    genres                  = case when (genres is null or cardinality(genres) = 0) and p_genres is not null then p_genres else genres end,
    release_year            = case when release_year is null and p_release_year is not null then p_release_year else release_year end,
    cover_url               = case when (cover_url is null or cover_url = '') and p_cover_url is not null then p_cover_url else cover_url end,
    total_seasons           = case when total_seasons is null and p_total_seasons is not null then p_total_seasons else total_seasons end,
    total_episodes          = case when total_episodes is null and p_total_episodes is not null then p_total_episodes else total_episodes end,
    episode_runtime_minutes = case when episode_runtime_minutes is null and p_episode_runtime_minutes is not null then p_episode_runtime_minutes else episode_runtime_minutes end,
    hydrated_at             = now()
  where id = p_series_id;
  perform set_config('app.hydrating', 'off', true);
end;
$$;

-- Camino de créditos de persona (origen servidor, datos de TMDB ya en mano): una
-- sola llamada aplica muchas filas. Cada hydrate_movie/series abre y cierra su
-- propio flag, así que entre filas el bypass queda 'off'. p_rows = jsonb array con
-- claves snake_case: item_id, title, original_title, director|creator, synopsis,
-- genres, release_year, cover_url, duration_minutes|total_seasons|total_episodes|episode_runtime_minutes.
create or replace function public.hydrate_screens_bulk(
  p_item_type text,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_item_type = 'movie' then
    for r in select * from jsonb_array_elements(p_rows) loop
      perform public.hydrate_movie(
        (r->>'item_id')::uuid,
        r->>'title', r->>'original_title', r->>'director', r->>'synopsis',
        case when r ? 'genres' then array(select jsonb_array_elements_text(r->'genres')) else null end,
        (r->>'release_year')::int, r->>'cover_url', (r->>'duration_minutes')::int
      );
    end loop;
  elsif p_item_type = 'series' then
    for r in select * from jsonb_array_elements(p_rows) loop
      perform public.hydrate_series(
        (r->>'item_id')::uuid,
        r->>'title', r->>'original_title', r->>'creator', r->>'synopsis',
        case when r ? 'genres' then array(select jsonb_array_elements_text(r->'genres')) else null end,
        (r->>'release_year')::int, r->>'cover_url',
        (r->>'total_seasons')::int, (r->>'total_episodes')::int, (r->>'episode_runtime_minutes')::int
      );
    end loop;
  else
    raise exception 'unknown item type: %', p_item_type;
  end if;
end;
$$;

revoke all on function public.hydrate_movie(uuid, text, text, text, text, text[], int, text, int) from public;
grant execute on function public.hydrate_movie(uuid, text, text, text, text, text[], int, text, int) to authenticated;
revoke all on function public.hydrate_series(uuid, text, text, text, text, text[], int, text, int, int, int) from public;
grant execute on function public.hydrate_series(uuid, text, text, text, text, text[], int, text, int, int, int) to authenticated;
revoke all on function public.hydrate_screens_bulk(text, jsonb) from public;
grant execute on function public.hydrate_screens_bulk(text, jsonb) to authenticated;

comment on function public.hydrate_movie is
  '#674: hidrata una película desde el proveedor (fill-only, no pisa curación). Activa app.hydrating alrededor del UPDATE para pasar el trigger de edición. Ver spec 2026-08-14.';
comment on function public.hydrate_series is
  '#674: hidrata una serie desde el proveedor (fill-only, no pisa curación). Activa app.hydrating alrededor del UPDATE para pasar el trigger de edición. Ver spec 2026-08-14.';
