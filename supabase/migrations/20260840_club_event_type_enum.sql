-- Enum discriminador de tipo de evento (spec 2026-08-09). SOLO en su fichero:
-- Postgres prohíbe usar un valor de enum en la misma transacción que lo crea, y
-- la columna de 20260841 usa 'encuentro' como default.
create type public.club_event_type as enum ('encuentro', 'lanzamiento', 'fecha_destacada');
