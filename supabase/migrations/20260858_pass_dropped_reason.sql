-- Motivo de abandono (siempre privado, ver docs/superpowers/specs/2026-08-14-motivo-abandono-y-dropped-en-pelis-design.md).
--
-- Categorías cerradas + "otro" con texto libre. dropped_reason_note solo
-- tiene sentido junto a dropped_reason = 'otro'; el servidor (savePassFields,
-- src/lib/passes/actions.ts) descarta la nota si la categoría no es 'otro'.
--
-- SIN backfill: los pases `dropped` ya existentes quedan con dropped_reason
-- NULL, indistinguible de "no contestó" — no hay forma de inferir un motivo
-- retroactivo.
create type public.pass_dropped_reason as enum (
  'no_enganchado',
  'aburrido',
  'no_es_momento',
  'no_esperado',
  'otro'
);

alter table public.passes
  add column dropped_reason public.pass_dropped_reason,
  add column dropped_reason_note text;

-- SOLO update, a propósito. La RLS de SELECT de passes ("diary entries
-- select visible") es can_view_profile(user_id) -- visibilidad de PERFIL,
-- no de dueño -- así que un grant select aquí (de tabla o por columna) se
-- filtraría a cualquiera que pueda ver el perfil, público o no, saltándose
-- is_public (que solo aplica la vista pass_reviews). Mismo motivo por el que
-- `review` se sacó del grant de tabla en 20260714_passes_review_privacy.sql.
-- Grant por columna (DRIFT-CHECK superficie 6, issue #375): sin esto el
-- UPDATE de savePassFields falla ENTERO en cuanto nombra dropped_reason, no
-- solo el campo nuevo.
grant update (dropped_reason, dropped_reason_note) on public.passes to authenticated;

-- pass_reviews: única vía de lectura (getPasses, src/lib/passes/get-passes.ts).
-- La vista corre con los permisos de su dueño (no es security_invoker), así
-- que puede leer las columnas aunque no tengan grant de tabla. Enmascaradas
-- por dueño DENTRO de la vista -- no por un grant -- para que sigan ocultas
-- si algún día se reutiliza getPasses para el perfil de otro usuario (hoy
-- solo se llama con el propio id, ver los tres page.tsx de libro/pelicula/serie).
-- Columnas nuevas al final (create or replace view no admite reordenar las
-- existentes), mismo patrón que 20260833_pass_reviews_updated_at.sql.
create or replace view public.pass_reviews as
select
  d.id, d.user_id, d.item_type, d.item_id,
  d.status, d.is_active, d.position, d.pinned_order,
  d.started_on, d.finished_on, d.rating, d.review, d.is_public,
  d.edition_id, d.created_at, d.updated_at,
  case when d.user_id = (select auth.uid()) then d.dropped_reason else null end as dropped_reason,
  case when d.user_id = (select auth.uid()) then d.dropped_reason_note else null end as dropped_reason_note
from public.passes d
where
  d.user_id = (select auth.uid())
  or (
    d.is_public
    and (
      public.can_view_profile(d.user_id)
      or public.is_visible_via_club_share('diary_entries', d.id, d.user_id)
    )
  );

grant select on public.pass_reviews to anon, authenticated;
