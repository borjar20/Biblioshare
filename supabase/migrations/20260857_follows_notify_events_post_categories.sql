-- follows.notify_events pasa de 4 categorias por HECHO
-- ('finished','session','episode','added') a 3 por NATURALEZA DEL POST
-- ('milestone','progress','thought') -- spec 2026-08-13 §5.
--
--   finished              -> milestone
--   session OR episode    -> progress
--   cualquier cosa activa -> thought   <-- decision deliberada del dueno:
--       "quiero saber de esta persona" se interpreta como que incluye lo que
--       escriba. Es la unica transformacion que ANADE un aviso que nadie pidio
--       literalmente, y por eso queda escrita aqui y en decisiones.md.
--   added                 -> se pierde (anadir no publica post)
--
-- Una fila con notify_events vacio SE QUEDA VACIA: quien no queria avisos de
-- alguien sigue sin recibirlos. De ahi el WHERE.
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
where cardinality(notify_events) > 0;
