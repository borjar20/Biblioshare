-- follows.notify_events pasa de 4 categorias por HECHO
-- ('finished','session','episode','added') a 3 por NATURALEZA DEL POST
-- ('milestone','progress','thought') -- spec 2026-08-13 §5.
--
--   finished              -> milestone
--   session OR episode    -> progress
--   cualquier cosa activa -> thought   <-- decision deliberada del dueno:
--       "quiero saber de esta persona" se interpreta como que incluye lo que
--       escriba. Es la unica CATEGORIA que se anade de la nada, sin analogo
--       en el vocabulario viejo, y por eso queda escrita aqui y en decisiones.md.
--   added                 -> se pierde (anadir no publica post)
--
--   OJO (corregido 2026-08-13 tras la revision final de rama: la version
--   anterior de este comentario decia que 'thought' era la UNICA transformacion
--   que anade un aviso no pedido -- eso es falso. 'milestone' y 'progress' NO
--   son traducciones 1-a-1: CATEGORY_FOR_POST_KIND (notify-categories.ts) mete
--   varios post.kind bajo la misma categoria, asi que una fila con solo
--   'finished' sale suscrita tambien a 'started'/'dropped' (los tres caen en
--   milestone), y una fila con 'session' sin 'episode' (o al reves) sale
--   suscrita tambien al otro (los dos caen en progress).
--
--   MEDIDO AL APLICAR EN PROD (2026-08-13; solo comentario, el SQL no cambia):
--   esta cabecera decia que las 8 filas no vacias de prod "solo tienen
--   'finished'" -- FALSO. Las 8 tenian 'finished'+'session'+'episode', y 6 de
--   ellas ademas 'added'. La conclusion sigue en pie: las 8 salieron suscritas
--   a TRES tipos de aviso nuevos (followed_started, followed_dropped,
--   followed_thought), no a uno. Resultado real: 8 filas a
--   {milestone,progress,thought}, 4 filas vacias intactas.
--
-- Una fila con notify_events vacio SE QUEDA VACIA: quien no queria avisos de
-- alguien sigue sin recibirlos. Y una fila que YA paso por esta migracion
-- (su array ya solo tiene milestone|progress|thought) tampoco se toca: el
-- WHERE exige solapamiento con el vocabulario VIEJO, asi que reejecutar este
-- fichero sobre una fila ya migrada es un no-op seguro en vez de perder
-- milestone/progress (que ya no matchean 'finished'/'session'/'episode').
--
-- No hay columna nueva, asi que la superficie 6 de docs/DRIFT-CHECK.md (grants
-- por columna) no aplica: notify_events ya trae el suyo desde
-- 20260804000000_follow_notify_events.sql.

update public.follows
set notify_events = (
  select array_agg(distinct v order by v)
  from unnest(
    (case when 'finished' = any(notify_events)
          then array['milestone'] else array[]::text[] end)
    || (case when 'session' = any(notify_events) or 'episode' = any(notify_events)
             then array['progress'] else array[]::text[] end)
    || array['thought']::text[]
  ) as v
)
where notify_events && array['finished','session','episode','added']::text[];

comment on column public.follows.notify_events is
  'Categorías de evento del followee por las que el follower pidió aviso (milestone|progress|thought). Vacío = sin avisos. Escrito por service-role desde setFollowNotify.';
