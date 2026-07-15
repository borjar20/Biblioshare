-- La vista pass_reviews debe exponer pinned_order: el ejecutor de
-- transiciones hereda el fijado al archivar un pase, y la capa de lectura de
-- pases (getPasses) lee por la vista — es la única lectura que incluye
-- review, así que el pase entero sale de ahí. La tanda A la creó sin esta
-- columna; misma técnica drop+create (no se pueden insertar columnas en
-- medio con create or replace).
drop view if exists public.pass_reviews;
create view public.pass_reviews as
select
  d.id, d.library_entry_id, d.user_id, d.item_type, d.item_id,
  d.status, d.is_active, d.position, d.pinned_order,
  d.started_on, d.finished_on, d.rating, d.review, d.is_public,
  d.edition_id, d.created_at
from public.diary_entries d
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
