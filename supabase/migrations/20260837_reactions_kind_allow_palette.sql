-- Hotfix «Pensamiento»: la paleta multi-emoji (Fase 1) añadió read/shock/fire
-- en la app y amplió la lectura por kind, pero `reactions.kind` conservaba el
-- CHECK original `reactions_kind_like` que SOLO permitía 'like'. Insertar
-- cualquier otro emoji violaba el CHECK y fallaba en runtime.
--
-- Por qué no se detectó antes: los unit tests usan fakes de Supabase que no
-- aplican los CHECK, y el e2e (que sí golpea la BD real) no llegó a ejecutarse
-- en el worktree por falta de `.env.local`. La revisión de Fase 1 vio el índice
-- único `(interaction_target_id, user_id, kind)` y concluyó «sin migración de
-- datos», pero ese único es de UNICIDAD por kind, no de VALORES permitidos.
--
-- Aplicado en dev y en PROD el 2026-08-07 (el feature ya estaba desplegado).
alter table public.reactions drop constraint if exists reactions_kind_like;
alter table public.reactions add constraint reactions_kind_valid
  check (kind in ('like', 'read', 'shock', 'fire'));
