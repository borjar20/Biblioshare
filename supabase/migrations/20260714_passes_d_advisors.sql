-- Limpieza de los avisos que los advisors de Supabase levantaron sobre los
-- objetos de esta tanda. Ninguno era explotable, pero dos merecen arreglo y uno
-- se acepta a conciencia.
--
-- 1) `revoke ... from public` NO le quita el permiso a `anon`. Supabase tiene
--    default privileges que conceden EXECUTE a anon/authenticated sobre toda
--    función nueva del esquema public, y eso no lo recorta un revoke a PUBLIC:
--    hay que revocar de cada rol por su nombre. `register_book_edition` ya se
--    defendía sola (exige auth.uid() no nulo), pero un anónimo no debería poder
--    ni llamarla.
revoke execute on function public.register_book_edition(uuid, text, text, text, integer, integer, text) from anon;

-- 2) Las funciones de trigger no las invoca nadie: las dispara Postgres. Que
--    figuren como ejecutables por anon/authenticated es superficie de ataque
--    gratis (y ruido en los advisors, que es peor: esconde los avisos reales).
revoke execute on function public.create_primary_book_edition() from public, anon, authenticated;
revoke execute on function public.create_primary_movie_version() from public, anon, authenticated;
revoke execute on function public.ensure_primary_book_edition() from public, anon, authenticated;
revoke execute on function public.ensure_primary_movie_version() from public, anon, authenticated;
revoke execute on function public.check_pass_edition() from public, anon, authenticated;

-- 3) `sane_int` no fijaba search_path. Es pura (no toca tablas), así que el
--    riesgo es teórico, pero el proyecto ya fija search_path en todas las demás
--    y una excepción sin motivo es una excepción que alguien copiará.
create or replace function public.sane_int(v integer, lo integer, hi integer)
returns integer
language sql
immutable
set search_path = public
as $$
  select case when v between lo and hi then v end;
$$;

-- 4) ACEPTADO, no se arregla: el advisor marca `public.pass_reviews` como
--    "security definer view" (ERROR). Es intencional y es justo el motivo de que
--    la vista exista: tiene que saltarse el grant de columna sobre
--    diary_entries.review para poder servir el texto de las reseñas que SÍ
--    puedes ver. La visibilidad la reimplementa su propio WHERE (tuya, o pública
--    de un perfil que puedas ver). Mismo caso que `profile_identities`, que ya
--    está aceptado por la misma razón.
