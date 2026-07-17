-- "Cuándo lees" con dato real (plan 05, P8).
--
-- progress_sessions solo guardaba session_date (el día) y created_at (cuándo se
-- REGISTRÓ la sesión, no cuándo se consumió). Para la franja horaria favorita
-- hace falta la hora real de inicio: el cronómetro la rellena solo, la hoja
-- manual la deja opcional.
--
-- SIN backfill a propósito: created_at no es un sustituto honesto (mentiría
-- sobre la franja). "Cuándo lees" ignora las filas sin started_at.
alter table public.progress_sessions
  add column started_at timestamptz;

-- El grant de INSERT de progress_sessions es POR COLUMNA (ver
-- 20260714_passes_grants.sql): una columna nueva NO entra sola, así que sin
-- esto el rol authenticated no puede escribir started_at y el insert entero
-- falla con "permission denied for column started_at". (El SELECT sí la cubre:
-- ese grant es de tabla.)
grant insert (started_at) on public.progress_sessions to authenticated;
