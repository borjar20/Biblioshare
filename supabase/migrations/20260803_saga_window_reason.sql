-- Motivo de una ventana recomendada (spec 2026-07-28, fase 3): POR QUÉ el
-- tramo es el que es. Es lo que convierte «entre X e Y» en una recomendación
-- que se puede razonar — el mockup lo dice en el frame B: «fuera de ella hay
-- spoilers en ambos sentidos».
--
-- NULLABLE y SIN BACKFILL, a propósito. Las 4 ventanas que hay hoy en
-- producción se curaron antes de que esta columna existiera, y nadie decidió
-- su motivo. Rellenarlas «por defecto» sería poner en boca del curador una
-- afirmación que no hizo — exactamente el error que la fase 2 evitó dejando
-- `saga_tandems.modo` nullable, y que antes de ella cometía la interfaz al
-- afirmar «se leen a la vez» de todos los tándems.
--
-- Sin CHECK nuevo: `saga_placement_windows_needs_anchor` ya impide una fila
-- sin ninguna ancla, así que un motivo nunca puede existir sin su tramo.
-- Y sin tocar RLS: las policies de esta tabla son de tabla, no de columna.
create type public.saga_window_reason as enum ('spoiler', 'contexto');

alter table public.saga_placement_windows
  add column motivo public.saga_window_reason;
