-- Cierra un hueco latente destapado en #365: `series.episode_runtime_minutes`
-- nunca tuvo grant de UPDATE para `authenticated`.
--
-- La columna se añadió en 20260710_typed_annual_goals_and_series_runtime.sql,
-- DESPUÉS de que se concediera el grant de tamaños original (que cubría
-- total_episodes / total_seasons), y nadie la añadió a ese grant. Verificado en
-- prod el 2026-08-03:
--
--   authenticated / UPDATE sobre series: cover_url, creator, genres,
--   release_year, synopsis, title, total_episodes, total_seasons
--                                     ^ falta episode_runtime_minutes
--
-- Por qué importaba tan poco hasta ahora y por qué importa ya: la hidratación
-- de tamaños escribe las tres columnas en un ÚNICO patch, así que en cuanto una
-- serie llegue sin duración de episodio el UPDATE falla ENTERO y se lleva por
-- delante también total_episodes/total_seasons. No se veía porque no había
-- ninguna serie pendiente (0 filas) y el backfill colgaba del sorteo; ahora la
-- hidratación corre al abrir CUALQUIER ficha de serie.
--
-- Coherente con el diseño ya documentado en
-- 20260714_editions_h_catalog_edit_grants.sql: las columnas de sincronización y
-- tamaño quedan abiertas a cualquier `authenticated` (las rellena quien visita
-- la ficha, no solo colaborador+); el trigger
-- enforce_catalog_edit_collaborator_only solo protege las columnas CURADAS
-- (título, sinopsis, géneros, año, portada, creación), y esta no lo es.
grant update (episode_runtime_minutes) on public.series to authenticated;

comment on column public.series.episode_runtime_minutes is
  'Duración media de un episodio en minutos, de TMDB (episode_run_time, con caída a la del último episodio emitido). NULL = desconocida; la rellena ensureItemEnriched al abrir la ficha de la serie (cache-as-you-go).';
