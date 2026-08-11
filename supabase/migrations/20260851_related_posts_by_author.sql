-- Ranking de «Más de {usuario}» por CONTINUIDAD TEMÁTICA (columna social de
-- `/post/[id]`). Antes el raíl mostraba los posts MÁS RECIENTES del autor sin
-- criterio de relación; ahora prioriza los del autor sobre obras EMPARENTADAS
-- con la obra del post actual.
--
-- Puntuación (deliberadamente simple, no un recomendador): reutiliza las
-- relaciones que YA existen en el modelo —sagas (`saga_items` + jerarquía
-- `parent_saga_id`) y géneros (arrays canónicos, índice GIN)—.
--
--   score = 3·misma_saga  +  2·misma_obra  +  1·géneros_solapan
--   orden = score DESC, created_at DESC, id DESC
--
-- Los de score 0 quedan al final: así el bloque muestra PRIMERO lo relacionado
-- y RELLENA con recientes si no hay bastante (lo que pide el diseño), sin dos
-- consultas. Devuelve `setof posts` para reaprovechar `resolvePostDrafts`
-- (resolución batch de ancla/autor) en la capa de datos; ese pipeline conserva
-- el orden de entrada, así que el ranking llega intacto a la UI.
--
-- SECURITY INVOKER a propósito (regla #437 y RLS): corre como quien llama, así
-- que la RLS de `posts` (`can_view_profile(author_id)`) sigue filtrando la
-- audiencia — un tercero solo ve del autor lo que ya podía ver. NUNCA se cachea
-- (la ruta `/post/[id]` es dinámica). Las comparaciones ancla↔saga_item se hacen
-- en espacio de TEXTO (`::text`): `posts.anchor_type` es `post_anchor_type`
-- {book,movie,series,saga,person} y `saga_items.item_type` es `item_type`
-- {book,movie,series} — castear 'saga'/'person' al segundo enum reventaría.

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
    -- subsagas (misma franquicia). Comparación en texto (ver cabecera).
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
