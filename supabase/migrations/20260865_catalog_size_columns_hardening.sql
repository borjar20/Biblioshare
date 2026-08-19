-- Issue #676: DoS por amplificación — `total_seasons` controlaba un fan-out.
--
-- Cualquier `authenticated` podía `UPDATE series SET total_seasons = 100000`
-- por PostgREST: el grant de UPDATE por columna incluía las columnas de tamaño
-- y la política `series size backfill updatable` es `using(true)` (el trigger
-- `enforce_catalog_edit_collaborator_only` EXCLUYE a propósito las columnas de
-- tamaño, porque las escribía el backfill de cualquier lector). Al abrir esa
-- ficha, `getSeriesEpisodes` lanzaba UNA petición TMDB POR TEMPORADA con
-- `Promise.all` sin límite. El usuario controlaba el multiplicador.
--
-- Esta migración pone las dos capas de BD; las de app van en el mismo PR:
-- concurrencia acotada + techo de temporadas en `getSeriesEpisodes`, y contar
-- las temporadas contra TMDB en vez de contra la fila (`ensureSeriesEpisodes`).
--
-- ── Capa 1: se quita el UPDATE directo sobre las columnas de tamaño ─────────
-- Quien las escribe ahora es `hydrate_movie`/`hydrate_series` (SECURITY
-- DEFINER, fill-only, #674), que ya cubren exactamente estas columnas. El
-- llamador (`writeSizes` en `src/lib/people/enrich-item.ts`) pasa a la RPC en
-- este mismo PR. `scripts/backfill-sizes.ts` va con service_role: no le afecta.
--
-- OJO: se revocan SOLO las columnas de tamaño. Las de ficha
-- (title/creator/synopsis/genres/release_year/cover_url) conservan su grant
-- porque la edición de colaborador va por UPDATE directo y la guarda el
-- trigger. Revocar de más rompería la escritura ENTERA de la tabla (#375).
revoke update (total_seasons, total_episodes, episode_runtime_minutes)
  on public.series from authenticated;
revoke update (duration_minutes)
  on public.movies from authenticated;

-- ── Capa 2: rango razonable, para que ningún camino pueda escribir un absurdo ─
-- Verificado antes de crearlas contra los datos reales (2026-08-19):
--   dev  → max(total_seasons)=8,  max(total_episodes)=73,  max(episode_runtime)=90
--   prod → max(total_seasons)=11, max(total_episodes)=164, max(episode_runtime)=290,
--          max(movies.duration_minutes)=209
-- y CERO filas negativas o fuera de rango en ambas, así que `not valid` no hace
-- falta: validan al vuelo.
--
-- Los topes son generosos a propósito (no son una regla de negocio, son un
-- pararrayos): 200 temporadas está muy por encima de cualquier serie real,
-- 100000 episodios cubre las telenovelas diarias más largas, 1440 minutos es un
-- día entero de episodio y 2000 minutos deja sitio a las películas-río.
alter table public.series
  add constraint series_total_seasons_range
    check (total_seasons is null or (total_seasons >= 0 and total_seasons <= 200)),
  add constraint series_total_episodes_range
    check (total_episodes is null or (total_episodes >= 0 and total_episodes <= 100000)),
  add constraint series_episode_runtime_range
    check (episode_runtime_minutes is null or (episode_runtime_minutes >= 0 and episode_runtime_minutes <= 1440));

alter table public.movies
  add constraint movies_duration_minutes_range
    check (duration_minutes is null or (duration_minutes >= 0 and duration_minutes <= 2000));

comment on constraint series_total_seasons_range on public.series is
  '#676: `total_seasons` decide cuántas peticiones TMDB salen al abrir la ficha. El tope no es una regla de negocio: acota el fan-out por si alguna vía de escritura futura vuelve a dejar el valor en manos del usuario.';

-- Verificación (contra objetos reales, no contra el ledger):
--   select privilege_type, string_agg(column_name, ', ' order by column_name)
--   from information_schema.column_privileges
--   where table_schema='public' and table_name='series'
--     and grantee='authenticated' and privilege_type='UPDATE'
--   group by privilege_type;
--   -- esperado: cover_url, creator, genres, hydrated_at, release_year, synopsis, title
--
--   select conname from pg_constraint
--   where conrelid in ('public.series'::regclass,'public.movies'::regclass)
--     and contype='c' and conname like '%_range';
