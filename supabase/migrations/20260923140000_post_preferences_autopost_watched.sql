-- Fase 4 del rediseño de series (spec 2026-09-23-series-flujo-rediseno, D3):
-- las series dejan de tener sesiones y su avance llega al feed como UN post
-- `watched` por serie y día. Como el resto de hitos, se puede desactivar: nueva
-- preferencia `autopost_watched`, ACTIVADA por defecto (sin fila = defaults,
-- misma semántica que 20260845_post_preferences.sql).
--
-- #375 / DRIFT-CHECK superficie 6: `post_preferences` tiene grants POR COLUMNA.
-- Una columna nueva sin su grant rompe la escritura ENTERA de la tabla (el
-- INSERT/UPDATE de preferencias lista todas las claves), así que se concede en
-- la misma migración, con el mismo reparto que sus hermanas: select, insert y
-- update a `authenticated`; nada a `anon`.

alter table public.post_preferences
  add column if not exists autopost_watched boolean not null default true;

grant select (autopost_watched) on public.post_preferences to authenticated;
grant insert (autopost_watched) on public.post_preferences to authenticated;
grant update (autopost_watched) on public.post_preferences to authenticated;

comment on column public.post_preferences.autopost_watched is
  'Publicar en el feed un post watched por serie y día al marcar episodios (fase 4 series). Default true.';
