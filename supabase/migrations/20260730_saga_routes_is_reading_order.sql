-- supabase/migrations/20260730_saga_routes_is_reading_order.sql
--
-- Fase 4 (A): el curador DESIGNA cuál de sus itinerarios ocupa el puesto de
-- «Orden de lectura» en la ficha. Hasta hoy el selector ofrecía dos chips que
-- prometen lo mismo: la ruta sintética «lectura» (el mapa derivado) y un
-- itinerario curado que suele llamarse «Orden recomendado».
--
-- Por qué un booleano y no una fila en `saga_routes` con slug «lectura»: ese
-- slug lo prohíbe el CHECK saga_routes_slug_not_reserved a propósito —
-- materializar lo derivado es la familia de fallo del #91. Un booleano compra
-- exactamente lo mismo sin congelar nada.
--
-- SIN BACKFILL a propósito: la decisión es del curador, no automática.
-- Designar cambia la vista POR DEFECTO de esa saga, así que no se hace en su
-- nombre.
alter table public.saga_routes
  add column is_reading_order boolean not null default false;

-- Uno como mucho por saga. Parcial: las filas en `false` son la inmensa
-- mayoría y no deben competir por el unique.
create unique index saga_routes_reading_order_key
  on public.saga_routes (saga_id) where is_reading_order;

comment on column public.saga_routes.is_reading_order is
  'true = este itinerario ocupa el puesto y la etiqueta de «Orden de lectura» en la ficha, y la ruta sintética «lectura» deja de ofrecerse. La fila NO se renombra: la etiqueta la pone buildRouteList.';
