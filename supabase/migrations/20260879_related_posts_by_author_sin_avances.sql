-- «Más de {usuario}» deja de proponer AVANCES (`posts.kind = 'progressed'`).
--
-- Motivo: un avance es un latido de lectura, no una pieza de conversación. Quien
-- lee un libro a ratos genera decenas sobre la MISMA obra, y como el ranking
-- premia justamente «misma obra» (+2), el raíl del post se llenaba de avances
-- del propio autor sobre el mismo ítem — el bloque de descubrimiento dejaba de
-- descubrir nada. El resto del ranking (saga > obra > géneros) no cambia; solo
-- se estrecha el conjunto de candidatos.
--
-- El gemelo de esta regla para «Más sobre la obra» vive en la capa de datos
-- (`getPostContext`, `src/lib/social/feed.ts`), que consulta `posts` directa.
--
-- Idéntica al cuerpo de 20260851 salvo el filtro nuevo en el `where`. Se mantiene
-- SECURITY INVOKER (regla #437): la RLS de `posts` sigue filtrando audiencia.

create or replace function public.related_posts_by_author(
  p_author_id uuid,
  p_anchor_type public.post_anchor_type,
  p_anchor_id uuid,
  p_exclude_post_id uuid,
  p_limit integer default 4
)
returns setof public.posts
language sql
stable
security invoker
set search_path = ''
as $$
  with cur_genres as (
    -- Géneros de la obra actual (solo catálogo; saga/persona no llevan).
    select coalesce(
      case p_anchor_type
        when 'book'   then (select genres from public.books   where id = p_anchor_id)
        when 'movie'  then (select genres from public.movies  where id = p_anchor_id)
        when 'series' then (select genres from public.series  where id = p_anchor_id)
        else null
      end, '{}'::text[]) as g
  ),
  cur_sagas as (
    -- El «universo» de la obra actual: las sagas a las que pertenece si es una
    -- obra de catálogo; y si el ancla ES una saga, ella misma + su padre + sus
    -- subsagas (misma franquicia). Comparación en texto (ver 20260851).
    select saga_id from public.saga_items
      where item_type::text = p_anchor_type::text and item_id = p_anchor_id
    union
    select p_anchor_id where p_anchor_type = 'saga'
    union
    select parent_saga_id from public.sagas
      where p_anchor_type = 'saga' and id = p_anchor_id and parent_saga_id is not null
    union
    select id from public.sagas
      where p_anchor_type = 'saga' and parent_saga_id = p_anchor_id
  )
  select p.*
  from public.posts p
  cross join cur_genres cg
  left join lateral (
    select case p.anchor_type
      when 'book'   then (select genres from public.books   b where b.id = p.anchor_id)
      when 'movie'  then (select genres from public.movies  m where m.id = p.anchor_id)
      when 'series' then (select genres from public.series  s where s.id = p.anchor_id)
      else '{}'::text[]
    end as genres
  ) cand on true
  where p.author_id = p_author_id
    and p.id <> p_exclude_post_id
    and p.kind <> 'progressed'   -- los avances no son material de descubrimiento
  order by
    ( 3 * (case when
             exists (
               select 1 from public.saga_items si
               where si.item_type::text = p.anchor_type::text
                 and si.item_id = p.anchor_id
                 and si.saga_id in (select saga_id from cur_sagas)
             )
             or (p.anchor_type = 'saga'
                 and p.anchor_id in (select saga_id from cur_sagas))
           then 1 else 0 end)
    + 2 * (case when p.anchor_type = p_anchor_type and p.anchor_id = p_anchor_id
                then 1 else 0 end)
    + 1 * (case when coalesce(cand.genres, '{}'::text[]) && cg.g
                then 1 else 0 end)
    ) desc,
    p.created_at desc,
    p.id desc
  limit greatest(p_limit, 0);
$$;

grant execute on function public.related_posts_by_author(uuid, public.post_anchor_type, uuid, uuid, integer)
  to authenticated, anon;
