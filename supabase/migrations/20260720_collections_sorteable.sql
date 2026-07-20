-- Colecciones sorteables: marcar qué colecciones alimentan el filtro del sorteo
-- («sacar un lomo», §7.28). Sustituye a las colas (§7.22) como forma de acotar
-- el pool a un subconjunto propio.
--
-- Opt-in a propósito (`default false`): sin ninguna marcada, el sorteo sigue
-- comportándose como hasta ahora (toda la biblioteca), y el desplegable no se
-- llena con todas las colecciones del usuario — que es justo lo que hacía
-- inmanejable el filtro.
--
-- No se convierten las colas existentes en colecciones: en prod las 3 colas
-- están vacías (0 pases con `queue_id`), así que la conversión solo habría
-- creado colecciones vacías con nombre de cola. El DROP de `queues` va en una
-- migración posterior, cuando el sorteo con colecciones esté verificado.

alter table public.collections
  add column if not exists is_sorteable boolean not null default false;

comment on column public.collections.is_sorteable is
  'Si true, la colección aparece en el selector del sorteo (§7.28). El pool es entonces colección ∩ pases planned activos.';

-- El sorteo pide las sorteables del usuario en cada carga del Rincón.
create index if not exists collections_user_sorteable_idx
  on public.collections (user_id)
  where is_sorteable;
