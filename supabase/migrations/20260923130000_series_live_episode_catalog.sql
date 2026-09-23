-- Catálogo vivo de series (#1193, spec 2026-09-23-series-flujo-rediseno, fase 1).
--
-- Hasta aquí `series_episodes` se rellenaba UNA vez (la primera visita a la
-- ficha) y no se volvía a mirar: las temporadas estrenadas después no llegaban
-- nunca, y los episodios anunciados (air_date futuro) contaban como vistos-por-
-- ver. Para refrescar con criterio hace falta saber, por serie:
--
--   tmdb_status          `status` de TMDB /tv/{id}: 'Returning Series',
--                        'Ended', 'Canceled', 'In Production', 'Planned',
--                        'Pilot'. NULL = serie manual o aún sin sincronizar.
--                        'Ended'/'Canceled' = no se vuelve a preguntar.
--   next_episode_air_date `next_episode_to_air.air_date`: si ya pasó, toca
--                        refrescar antes del plazo normal.
--   episodes_synced_at   última sincronización del catálogo de episodios.
--                        NULL = de antes de esta migración → se sincroniza una
--                        vez al abrir la ficha.
--
-- Permisos: las TRES son columnas de servidor. Las escribe
-- `ensureSeriesEpisodes` con service_role (mismo criterio que
-- `series_episodes`, #725: el dato lo respalda TMDB, no el cliente), así que NO
-- se concede UPDATE por columna a `authenticated` — a propósito, a diferencia
-- de las columnas de ficha. La lectura la cubre el grant SELECT de tabla que ya
-- tienen anon/authenticated (verificado en dev: `series` no tiene SELECT por
-- columna). DRIFT-CHECK superficie 6: ninguna escritura de sesión toca estas
-- columnas, así que no hay patch de usuario que se rompa por su falta de grant.

alter table public.series
  add column if not exists tmdb_status text,
  add column if not exists next_episode_air_date date,
  add column if not exists episodes_synced_at timestamptz;

-- Pararrayos (como series_total_seasons_range): texto corto de TMDB, no prosa.
alter table public.series
  drop constraint if exists series_tmdb_status_length;
alter table public.series
  add constraint series_tmdb_status_length check (tmdb_status is null or char_length(tmdb_status) <= 40);

comment on column public.series.tmdb_status is
  'status de TMDB (/tv/{id}). Ended/Canceled = no habrá más episodios. NULL = manual o sin sincronizar. Lo escribe ensureSeriesEpisodes (service_role).';
comment on column public.series.next_episode_air_date is
  'Fecha del siguiente episodio anunciado en TMDB (next_episode_to_air). Si ya pasó, el catálogo se refresca antes de plazo. Lo escribe ensureSeriesEpisodes (service_role).';
comment on column public.series.episodes_synced_at is
  'Última sincronización de series_episodes con TMDB. NULL = anterior al catálogo vivo (se sincroniza al abrir la ficha). Lo escribe ensureSeriesEpisodes (service_role).';
