-- Reseñas con spoiler: una casilla que marca la reseña ENTERA, igual que
-- comments/notes/posts.is_spoiler. La reseña del pase y la de un episodio eran
-- el único texto social que no se podía marcar.
--
-- Solo UI: el texto sigue viajando al que mira (tiene permiso para leerlo);
-- la bandera decide si se pinta tapado hasta el clic (SpoilerGate).

-- 1. passes ------------------------------------------------------------------
alter table public.passes
  add column review_is_spoiler boolean not null default false;

-- passes tiene grants POR COLUMNA (DRIFT-CHECK superficie 6, #375): sin esto el
-- UPDATE de savePassFields falla ENTERO en cuanto nombra la columna nueva. La
-- bandera no es sensible (a diferencia de `review`), así que se puede leer
-- directamente como `rating`/`is_public`.
grant select (review_is_spoiler) on public.passes to anon, authenticated;
grant insert (review_is_spoiler), update (review_is_spoiler) on public.passes to authenticated;

-- pass_reviews: única vía de lectura de `review`, así que también sirve la
-- bandera. Columna nueva AL FINAL (create or replace view no admite reordenar).
-- Misma definición que 20260858 + la columna.
create or replace view public.pass_reviews as
select
  d.id, d.user_id, d.item_type, d.item_id,
  d.status, d.is_active, d.position, d.pinned_order,
  d.started_on, d.finished_on, d.rating, d.review, d.is_public,
  d.edition_id, d.created_at, d.updated_at,
  case when d.user_id = (select auth.uid()) then d.dropped_reason else null end as dropped_reason,
  case when d.user_id = (select auth.uid()) then d.dropped_reason_note else null end as dropped_reason_note,
  d.review_is_spoiler
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

-- Toda recreación de pass_reviews re-revoca las escrituras (20260862, #690,
-- superficie 7 de DRIFT-CHECK). `create or replace` no debería restaurarlas,
-- pero el bloque es idempotente y es la regla.
grant select on public.pass_reviews to anon, authenticated;
revoke insert, update, delete, truncate, references on public.pass_reviews from anon, authenticated;

-- 2. episode_watches ---------------------------------------------------------
-- Grants de TABLA (no por columna): la columna nueva queda cubierta sola.
alter table public.episode_watches
  add column review_is_spoiler boolean not null default false;
