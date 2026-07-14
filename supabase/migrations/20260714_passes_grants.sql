-- HALLAZGO 3 de la revisión de "registro de pases": 20260714_passes.sql (ya
-- aplicada) añadió `grant insert (...)` / `grant update (...)` por columna
-- sobre diary_entries y progress_sessions, pero esas dos tablas NUNCA
-- tuvieron un `revoke` previo.
--
-- Los default privileges del esquema public de Supabase conceden ALL a
-- anon/authenticated sobre cualquier relación nueva. Un `grant insert (...)`
-- / `grant update (...)` a secas es ADITIVO: NO resta nada. Sin el revoke,
-- anon/authenticated seguían teniendo INSERT/UPDATE/DELETE sobre TODAS las
-- columnas de ambas tablas (incluidas is_public, user_id, library_entry_id...)
-- pese al grant por columna — pura falsa sensación de seguridad. La RLS de
-- ambas tablas sigue limitando qué FILAS se pueden tocar, pero los grants de
-- columna existen para que ni siquiera con una fila propia se pueda escribir
-- en columnas que no tocan (p. ej. created_at, updated_at, id).
--
-- Mismo patrón que club_stats / profile_identities (ver schema-baseline.sql,
-- migraciones 20260713212115 y 20260713212653): revoke ANTES del grant.
--
-- Los grants concretos se decidieron mirando qué hace HOY la app
-- (grep -rn 'from("diary_entries")\|from("progress_sessions")' src/):
--
--   - diary_entries: la app hace insert (addDiaryEntry en
--     src/lib/diary/actions.ts, addMissingDiaryEntries en
--     src/lib/import/commit-row.ts) y delete (deleteDiaryEntry) de sus
--     propias filas. No hay NINGÚN .update() sobre diary_entries en el
--     código hoy, pero se mantiene el grant de columnas que ya declaraba
--     20260714_passes.sql (started_on, finished_on, rating, review,
--     is_public, edition_id) para cuando exista "editar un pase" — la RLS
--     ("diary entries update own") sigue exigiendo que la fila sea del
--     propio usuario.
--
--   - progress_sessions: la app hace insert (addSession en
--     src/lib/sessions/actions.ts) y delete (deleteSession) de sus propias
--     filas. addSession solo actualiza library_entries (posición/estado),
--     NUNCA progress_sessions — no hay ningún .update() sobre
--     progress_sessions en el código. Por eso NO se concede update aquí: no
--     hay que dar más superficie de la que la app usa.
--
-- CUIDADO: esta migración se escribe pero NO se aplica todavía (pendiente de
-- que el equipo la revise y la ejecute).

revoke all on public.diary_entries from anon, authenticated;
revoke all on public.progress_sessions from anon, authenticated;

-- select: la RLS ("diary entries select visible" / "progress sessions select
-- visible") ya limita qué filas ve cada cual — las propias, o las de un
-- perfil público. El grant de tabla solo abre la puerta; quién ve qué fila
-- lo decide la RLS.
grant select on public.diary_entries to anon, authenticated;
grant select on public.progress_sessions to anon, authenticated;

-- insert / update: mismas columnas que ya declaraba 20260714_passes.sql —
-- ese grant ya era el correcto, solo le faltaba el revoke previo para
-- restringir de verdad. anon no escribe nunca: solo authenticated.
grant insert (library_entry_id, user_id, started_on, finished_on, rating, review, is_public, edition_id)
  on public.diary_entries to authenticated;
grant update (started_on, finished_on, rating, review, is_public, edition_id)
  on public.diary_entries to authenticated;

grant insert (library_entry_id, user_id, session_date, duration_minutes, position, note, pass_id)
  on public.progress_sessions to authenticated;
-- Sin grant update en progress_sessions: la app nunca actualiza una sesión
-- ya creada, solo la inserta o la borra (ver nota de arriba).

-- delete: la app borra sesiones (deleteSession) y entradas de diario
-- (deleteDiaryEntry), siempre acotado a sus propias filas por la RLS
-- correspondiente ("diary entries delete own" / "progress sessions delete
-- own"). delete no admite lista de columnas en Postgres.
grant delete on public.diary_entries to authenticated;
grant delete on public.progress_sessions to authenticated;
