-- Una reseña privada es del autor y de nadie más. En la BASE DE DATOS, no solo
-- en la app.
--
-- La tanda anterior añadió `is_public` y puso `.eq("is_public", true)` en los
-- seis sitios de la aplicación que sirven reseñas. Pero la política de SELECT
-- de diary_entries es `can_view_profile(user_id) OR is_visible_via_club_share(...)`:
-- no sabe nada de is_public. Y la clave anónima viaja en el JavaScript que
-- servimos, así que cualquiera podía pedirle a PostgREST
--
--   GET /rest/v1/diary_entries?select=review&is_public=eq.false
--
-- y llevarse las reseñas privadas de todos los perfiles públicos — que son la
-- mayoría, porque el perfil es público por defecto. Peor: 20260714_passes.sql
-- acababa de convertir en reseñas privadas las notas de library_entries de todo
-- el mundo, escritas cuando nadie esperaba que se publicaran.
--
-- El arreglo tiene dos piezas:
--   1. La columna `review` deja de ser legible desde el cliente. Punto.
--   2. Las reseñas se sirven por una vista que ya trae aplicado el filtro.
--
-- Por qué no basta con endurecer la política de la tabla: la media de la
-- comunidad cuenta el voto de TODOS los pases cerrados, también los de reseña
-- privada (is_public dice si se publica el TEXTO, no si cuenta la NOTA). Si la
-- política escondiera la fila entera, esos votos desaparecerían de la media.
-- Separar la columna del resto de la fila es exactamente lo que hace falta.

-- Ojo con esto, que es la trampa: `revoke select (review)` NO sirve de nada
-- mientras exista un `grant select` de TABLA, porque el grant de tabla ya cubre
-- todas las columnas —incluidas las que se añadan mañana— y un revoke por
-- columna no recorta un grant de tabla. Hay que quitar el SELECT de tabla y
-- volver a concederlo columna a columna, dejando `review` fuera.
revoke select on public.diary_entries from anon, authenticated;

grant select (id, library_entry_id, user_id, started_on, finished_on, rating,
              is_public, edition_id, created_at, updated_at)
  on public.diary_entries to anon, authenticated;

-- La vista corre con los permisos de su dueño (no es security_invoker), así que
-- salta el revoke de arriba: por eso el WHERE tiene que reproducir a mano la
-- visibilidad que da la RLS de la tabla, más el filtro de is_public.
create or replace view public.pass_reviews as
select
  d.id,
  d.library_entry_id,
  d.user_id,
  d.started_on,
  d.finished_on,
  d.rating,
  d.review,
  d.is_public,
  d.edition_id,
  d.created_at
from public.diary_entries d
where
  -- Tuya: la ves siempre, sea pública o privada.
  d.user_id = (select auth.uid())
  -- De otro: solo si la publicó Y su perfil es visible para ti (mismas reglas
  -- que la RLS de la tabla, incluida la compartición en clubes).
  or (
    d.is_public
    and (
      public.can_view_profile(d.user_id)
      or public.is_visible_via_club_share('diary_entries', d.id, d.user_id)
    )
  );

grant select on public.pass_reviews to anon, authenticated;

comment on view public.pass_reviews is
  'Reseñas de pase con la privacidad ya aplicada: las tuyas (públicas o no) y las públicas de quien puedas ver. La columna review de diary_entries no es legible desde el cliente; léela SIEMPRE por aquí.';
