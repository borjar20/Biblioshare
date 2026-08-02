-- Título en idioma original (TMDB original_title / original_name) para movies y
-- series. El `title` que cacheamos viene traducido a es-ES; el título original
-- es el que exporta Letterboxd y con el que casa el matcher de importación
-- (src/lib/import/match-row.ts). Ver docs/requirements/decisiones.md (2026-08-02).
--
-- Columna nullable: las filas ya cacheadas se rellenaron por un backfill puntual
-- que consulta TMDB por tmdb_id (no reproducible dentro de una migración, así que
-- no va aquí). A partir de ahora, find-or-create la escribe en cada alta.
alter table public.movies add column if not exists original_title text;
alter table public.series add column if not exists original_title text;

comment on column public.movies.original_title is 'TMDB original_title (idioma de rodaje). El title es la traducción es-ES. Usado por el matcher de importación (Letterboxd exporta el original).';
comment on column public.series.original_title is 'TMDB original_name (idioma de emisión). El title es la traducción es-ES.';
