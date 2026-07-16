-- Hueco del plan detectado en la Tarea 7: el propio plan (línea 880 de
-- docs/superpowers/plans/2026-07-15-pase-hub.md) pide que addSession deje de
-- escribir `library_entry_id` en progress_sessions ("el insert de la sesión
-- pierde library_entry_id y usa pass_id"), pero esa columna sigue siendo
-- NOT NULL hoy — solo se elimina del todo en la Tarea 10 (línea 1067 del
-- plan). Sin este cambio, TODO insert de sesión falla en runtime con "null
-- value in column library_entry_id violates not-null constraint": el código
-- compila (los tipos ya se parchearon a mano, ver database.types.ts) pero
-- revienta al primer guardado.
--
-- Mismo tratamiento que ya recibió diary_entries.library_entry_id en
-- 20260717_pass_hub_b4_hub_writes.sql: nullable, no se borra la columna
-- todavía (eso es la Tarea 10) ni se toca el FK compuesto (library_entry_id,
-- user_id) — MATCH SIMPLE ya no se evalúa cuando la columna es null, así que
-- las sesiones de pases nuevos (sin entrada de biblioteca, seguir ya no crea
-- library_entries) no chocan con él.
alter table public.progress_sessions
  alter column library_entry_id drop not null;
