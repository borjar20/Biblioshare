-- Ficha cinemática (spec 2026-09-23-ficha-cinematica-design.md §2): el backdrop
-- apaisado de TMDB para el hero de películas y series.
--
-- Se escribe SOLO por las RPC hydrate_movie/hydrate_series (SECURITY DEFINER,
-- fill-only), igual que las columnas de tamaño desde #676: NO hay grant de
-- UPDATE sobre backdrop_url para `authenticated`. Por eso esta columna aparece
-- en la superficie 6 del DRIFT-CHECK como hueco de UPDATE: es a propósito.
--
-- Las RPC cambian de firma (parámetro nuevo). `create or replace` con un
-- parámetro más crearía una SOBRECARGA, y una llamada con argumentos por nombre
-- que casara con las dos fallaría con «could not choose the best candidate».
-- Por eso se BORRAN las firmas viejas y se crean de nuevo, con sus grants.

alter table public.movies add column if not exists backdrop_url text;
alter table public.series add column if not exists backdrop_url text;

-- Cualquier `authenticated` puede llamar a la RPC con el valor que quiera, y la
-- ficha pinta la URL a todo el mundo. Solo se admite el CDN de imágenes de TMDB.
alter table public.movies
  add constraint movies_backdrop_url_tmdb
    check (backdrop_url is null or backdrop_url like 'https://image.tmdb.org/t/p/%');
alter table public.series
  add constraint series_backdrop_url_tmdb
    check (backdrop_url is null or backdrop_url like 'https://image.tmdb.org/t/p/%');

drop function if exists public.hydrate_movie(uuid, text, text, text, text, text[], int, text, int);
drop function if exists public.hydrate_series(uuid, text, text, text, text, text[], int, text, int, int, int);

create function public.hydrate_movie(
  p_movie_id uuid,
  p_title text default null,
  p_original_title text default null,
  p_director text default null,
  p_synopsis text default null,
  p_genres text[] default null,
  p_release_year int default null,
  p_cover_url text default null,
  p_duration_minutes int default null,
  p_backdrop_url text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
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
    backdrop_url     = case when (backdrop_url is null or backdrop_url = '') and p_backdrop_url is not null then p_backdrop_url else backdrop_url end,
    hydrated_at      = now()
  where id = p_movie_id;
  perform set_config('app.hydrating', 'off', true);
end;
$$;

create function public.hydrate_series(
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
  p_episode_runtime_minutes int default null,
  p_backdrop_url text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
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
    backdrop_url            = case when (backdrop_url is null or backdrop_url = '') and p_backdrop_url is not null then p_backdrop_url else backdrop_url end,
    hydrated_at             = now()
  where id = p_series_id;
  perform set_config('app.hydrating', 'off', true);
end;
$$;

revoke all on function public.hydrate_movie(uuid, text, text, text, text, text[], int, text, int, text) from public;
grant execute on function public.hydrate_movie(uuid, text, text, text, text, text[], int, text, int, text) to authenticated;
revoke all on function public.hydrate_series(uuid, text, text, text, text, text[], int, text, int, int, int, text) from public;
grant execute on function public.hydrate_series(uuid, text, text, text, text, text[], int, text, int, int, int, text) to authenticated;

comment on column public.movies.backdrop_url is
  'Backdrop apaisado de TMDB (w1280) para el hero de la ficha. Solo lo escribe hydrate_movie (fill-only). NULL = sin consultar o TMDB no tiene.';
comment on column public.series.backdrop_url is
  'Backdrop apaisado de TMDB (w1280) para el hero de la ficha. Solo lo escribe hydrate_series (fill-only). NULL = sin consultar o TMDB no tiene.';

-- hydrate_screens_bulk (la de #1201, sin hydrated_at) acepta también la clave
-- `backdrop_url`. Hoy ningún llamador la manda; se añade para que el lote no
-- tenga que volver a tocarse si la filmografía empieza a traerla.
create or replace function public.hydrate_screens_bulk(
  p_item_type text,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r jsonb;
  v_genres text[];
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_item_type not in ('movie', 'series') then
    raise exception 'unknown item type: %', p_item_type;
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_genres := case
      when jsonb_typeof(r->'genres') = 'array' and jsonb_array_length(r->'genres') > 0
        then array(select jsonb_array_elements_text(r->'genres'))
      else null
    end;

    perform set_config('app.hydrating', 'on', true);
    if p_item_type = 'movie' then
      update public.movies set
        title            = case when (title is null or title = '') and r->>'title' is not null then r->>'title' else title end,
        original_title   = case when (original_title is null or original_title = '') and r->>'original_title' is not null then r->>'original_title' else original_title end,
        director         = case when (director is null or director = '') and r->>'director' is not null then r->>'director' else director end,
        synopsis         = case when (synopsis is null or synopsis = '') and r->>'synopsis' is not null then left(r->>'synopsis', 5000) else synopsis end,
        genres           = case when (genres is null or cardinality(genres) = 0) and v_genres is not null then v_genres else genres end,
        release_year     = case when release_year is null and r->>'release_year' is not null then (r->>'release_year')::int else release_year end,
        cover_url        = case when (cover_url is null or cover_url = '') and r->>'cover_url' is not null then r->>'cover_url' else cover_url end,
        duration_minutes = case when duration_minutes is null and r->>'duration_minutes' is not null then (r->>'duration_minutes')::int else duration_minutes end,
        backdrop_url     = case when (backdrop_url is null or backdrop_url = '') and r->>'backdrop_url' is not null then r->>'backdrop_url' else backdrop_url end
      where id = (r->>'item_id')::uuid;
    else
      update public.series set
        title                   = case when (title is null or title = '') and r->>'title' is not null then r->>'title' else title end,
        original_title          = case when (original_title is null or original_title = '') and r->>'original_title' is not null then r->>'original_title' else original_title end,
        creator                 = case when (creator is null or creator = '') and r->>'creator' is not null then r->>'creator' else creator end,
        synopsis                = case when (synopsis is null or synopsis = '') and r->>'synopsis' is not null then left(r->>'synopsis', 5000) else synopsis end,
        genres                  = case when (genres is null or cardinality(genres) = 0) and v_genres is not null then v_genres else genres end,
        release_year            = case when release_year is null and r->>'release_year' is not null then (r->>'release_year')::int else release_year end,
        cover_url               = case when (cover_url is null or cover_url = '') and r->>'cover_url' is not null then r->>'cover_url' else cover_url end,
        total_seasons           = case when total_seasons is null and r->>'total_seasons' is not null then (r->>'total_seasons')::int else total_seasons end,
        total_episodes          = case when total_episodes is null and r->>'total_episodes' is not null then (r->>'total_episodes')::int else total_episodes end,
        episode_runtime_minutes = case when episode_runtime_minutes is null and r->>'episode_runtime_minutes' is not null then (r->>'episode_runtime_minutes')::int else episode_runtime_minutes end,
        backdrop_url            = case when (backdrop_url is null or backdrop_url = '') and r->>'backdrop_url' is not null then r->>'backdrop_url' else backdrop_url end
      where id = (r->>'item_id')::uuid;
    end if;
    perform set_config('app.hydrating', 'off', true);
  end loop;
end;
$$;

-- Verificación (contra objetos reales, no contra el ledger):
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc
--    where proname in ('hydrate_movie','hydrate_series') and pronamespace = 'public'::regnamespace;
--   -- esperado: UNA fila por función, con p_backdrop_url text al final.
--   select table_name, column_name from information_schema.columns
--    where table_schema='public' and column_name='backdrop_url';
--   -- esperado: movies y series.
