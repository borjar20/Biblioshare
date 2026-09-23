-- #1201: el lote de filmografía dejaba las pelis/series marcadas como hidratadas
-- sin director, duración ni temporadas, y la ficha ya no las completaba nunca.
--
-- hydrate_screens_bulk delegaba en hydrate_movie/hydrate_series, que al final
-- hacen `hydrated_at = now()`. Pero el lote solo trae lo que viene en la
-- filmografía de TMDB (título, sinopsis, géneros, año, portada): director,
-- creador y tamaños NO. Con la marca puesta, `ensureMovieHydrated` /
-- `ensureSeriesHydrated` se saltaban la fila en la primera apertura de ficha.
-- En prod, el 2026-09-23: 3057 de 4477 películas y 900 de 996 series así.
--
-- Arreglo: el lote hace su propio UPDATE fill-only, con las mismas reglas que
-- hydrate_movie/hydrate_series, pero SIN tocar hydrated_at: la obra queda
-- pendiente de su hidratación completa, como ya pasa con los libros
-- (hydrate_books_bulk, 20260890). Mismo patrón del flag app.hydrating: se
-- enciende justo antes de cada UPDATE y se apaga justo después.
--
-- Además, un `genres` que no sea un array (null JSON) ya no hace fallar el
-- lote entero con «cannot extract elements from a scalar», y un array vacío
-- no cuenta como valor.

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
        duration_minutes = case when duration_minutes is null and r->>'duration_minutes' is not null then (r->>'duration_minutes')::int else duration_minutes end
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
        episode_runtime_minutes = case when episode_runtime_minutes is null and r->>'episode_runtime_minutes' is not null then (r->>'episode_runtime_minutes')::int else episode_runtime_minutes end
      where id = (r->>'item_id')::uuid;
    end if;
    perform set_config('app.hydrating', 'off', true);
  end loop;
end;
$$;

comment on function public.hydrate_screens_bulk(text, jsonb) is
  '#674/#1201: hidrata en lote pelis/series desde la filmografía de TMDB (fill-only). NO marca hydrated_at: director/creador y tamaños no vienen en el lote y los completa la primera apertura de ficha.';

-- Backfill: las filas que el lote dejó marcadas sin sus campos de ficha vuelven
-- a pendientes, para que la próxima apertura las complete. Una obra que de
-- verdad no tenga director en TMDB paga UNA llamada más y queda marcada otra
-- vez por hydrate_movie. `hydrated_at` null es justo el estado de una shell
-- recién registrada, así que no hay lector que lo trate distinto.
select set_config('app.hydrating', 'on', true);

update public.movies
set hydrated_at = null
where tmdb_id is not null
  and hydrated_at is not null
  and (director is null or duration_minutes is null);

update public.series
set hydrated_at = null
where tmdb_id is not null
  and hydrated_at is not null
  and (creator is null or total_seasons is null or total_episodes is null or episode_runtime_minutes is null);

select set_config('app.hydrating', 'off', true);
