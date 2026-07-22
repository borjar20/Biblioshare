-- Eventos de club (spec 2026-07-22): actividad no participativa que marca una
-- fecha señalada. Kind nuevo en vez de tabla aparte, aplicando SD-8 -- el
-- calendario futuro debe leer UNA fuente de fechas de club, no un UNION.
--
-- Este fichero contiene SOLO los `add value`. Postgres prohíbe usar un valor de
-- enum en la misma transacción que lo añade, así que las RPCs que comparan
-- `kind = 'evento'` viven en 20260722_club_event_rpcs.sql.
alter type public.activity_kind add value 'evento';
alter type public.notification_type add value 'club_event_created';
