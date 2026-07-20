-- Retirada de las colas priorizadas (§7.22). Fase B: se va el esquema.
--
-- Contexto: al integrar Colección v2 la pestaña «Colas» dejó de pintarse y la
-- pantalla quedó inalcanzable (ningún enlace a `?tab=colas`). Su único uso vivo
-- —acotar el sorteo a un subconjunto propio— lo cubren desde el 2026-07-20 las
-- colecciones marcadas `is_sorteable` (`20260720_collections_sorteable.sql`).
-- La Fase A retiró la UI; esta retira el modelo.
--
-- Sin pérdida de datos de usuario: las 3 colas de producción estaban VACÍAS
-- (0 pases con `queue_id`) antes de este borrado.
--
-- `library_entries` está CONGELADA (ver data-model §0) pero sus columnas de
-- cola se van igual: nadie las lee desde el hub de pases y dejarlas solo
-- alimenta la confusión de "¿cuál de las dos manda?".

-- El RPC de reordenación va primero: depende de las columnas de abajo.
drop function if exists public.reorder_queue(uuid, uuid[]);

alter table public.passes
  drop column if exists queue_id,
  drop column if exists queue_order;

alter table public.library_entries
  drop column if exists queue_id,
  drop column if exists queue_order;

-- Ya sin referencias entrantes (los FK vivían en las columnas de arriba).
drop table if exists public.queues;
