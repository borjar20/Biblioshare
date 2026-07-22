-- Rol narrativo de un miembro de saga (issue #167, spec
-- 2026-07-22-sagas-rol-narrativo-design.md). Qué ES la obra dentro de ESTA
-- saga: precuela, spin-off, relato, paralela.
--
-- Va en saga_items y no en saga_nodes a propósito: el grafo es opcional (una
-- saga sin saga_nodes no tiene pestaña Mapa) mientras que toda saga tiene
-- filas en saga_items, y el unique (saga_id, item_type, item_id) hace que el
-- atributo sea POR SAGA — un libro puede ser precuela en una y obra principal
-- en otra.
--
-- Nullable y SIN backfill: null = "sin clasificar". Los position IS NULL de hoy
-- son en buena parte descuido de curación, no una decisión editorial; darles un
-- valor sería escribir una mentira en la BD (ver spec, "Por qué no hay backfill").
--
-- No lleva política RLS propia: hereda las de saga_items (select público,
-- escrituras collaborator+). Las SECURITY DEFINER de TMDB no mencionan la
-- columna, así que insertan null y siguen funcionando sin tocarse.

create type public.saga_item_role as enum ('precuela', 'spin_off', 'relato', 'paralela');

alter table public.saga_items add column role public.saga_item_role;

comment on column public.saga_items.role is
  'Rol narrativo del ítem en ESTA saga. null = sin clasificar. Ortogonal a position: position dice si tiene hueco fijo, role dice qué es.';
