-- Segundo defecto del alta de libros, destapado al arreglar #730 (hasta ahora no
-- se podía ni llegar aquí: el 42P10 abortaba antes).
--
-- Desde #674 la fila de catálogo nace VACÍA —solo con el id externo— y los
-- canónicos los pone la hidratación server-side. Para películas y series eso
-- funciona: `hydrate_movie` y `hydrate_series` reciben `p_title`. `hydrate_book`
-- NO: solo recibía synopsis, genres y cover_url. Resultado medido en dev el
-- 2026-08-20, abriendo desde /buscar un libro nuevo:
--
--   title=NULL  author=NULL  synopsis=<puesta>  hydrated_at=<puesto>
--
-- Y como `hydrated_at` queda puesto, la ficha se queda en «Sin título» para
-- siempre: el curador de la ficha no reintenta lo que ya está marcado hidratado.
--
-- Se añaden `p_title`, `p_author` y `p_published_year` con el MISMO criterio
-- fill-only que hydrate_movie: solo rellenan el hueco, nunca pisan lo que un
-- colaborador escribió a mano.
--
-- Ojo con el DROP: `create or replace` con una firma distinta no reemplaza, crea
-- una SOBRECARGA. Quedarían dos `hydrate_book` y PostgREST no sabría cuál llamar.

drop function if exists public.hydrate_book(uuid, text, text[], text);

create or replace function public.hydrate_book(
  p_book_id uuid,
  p_synopsis text default null,
  p_genres text[] default null,
  p_cover_url text default null,
  p_title text default null,
  p_author text default null,
  p_published_year integer default null
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

  -- El flag deja pasar el trigger de edición de catálogo: sin él, un usuario con
  -- rol `user` no podía hidratar (bug preexistente que arregló #674, parte D).
  perform set_config('app.hydrating', 'on', true);
  update public.books
     set title       = case
                         when (title is null or title = '') and p_title is not null
                           then left(p_title, 300)
                         else title
                       end,
         author      = case
                         when (author is null or author = '') and p_author is not null
                           then left(p_author, 200)
                         else author
                       end,
         published_year = case
                         when published_year is null and p_published_year is not null
                           then p_published_year
                         else published_year
                       end,
         synopsis    = case
                         when (synopsis is null or synopsis = '') and p_synopsis is not null
                           then left(p_synopsis, 5000)
                         else synopsis
                       end,
         genres      = case
                         when (genres is null or cardinality(genres) = 0) and p_genres is not null
                           then p_genres
                         else genres
                       end,
         cover_url   = case
                         when (cover_url is null or cover_url = '') and p_cover_url is not null
                           then p_cover_url
                         else cover_url
                       end,
         hydrated_at = now()
   where id = p_book_id;
  perform set_config('app.hydrating', 'off', true);
end;
$$;

revoke all on function public.hydrate_book(uuid, text, text[], text, text, text, integer) from public;
revoke execute on function public.hydrate_book(uuid, text, text[], text, text, text, integer) from anon;
grant execute on function public.hydrate_book(uuid, text, text[], text, text, text, integer) to authenticated;

comment on function public.hydrate_book is
  'Cache-as-you-go de la obra al abrir su ficha (spec 2026-07-14): rellena title/author/published_year/synopsis/genres/cover_url SOLO si estaban vacíos y marca hydrated_at. Fill-only, no pisa curación. Activa app.hydrating alrededor del UPDATE para pasar el trigger de edición. title/author se añadieron al arreglar #730: sin ellos, un libro dado de alta desde /buscar se quedaba en «Sin título» para siempre.';
