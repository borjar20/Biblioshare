-- #345 (Bloque 3 del triage #496): la vista pass_reviews expone updated_at.
--
-- getFeed ya usa passes.updated_at como hora REAL de registro del terminado (un
-- pase se CREA al añadir la obra y el "terminado" llega después como UPDATE, así
-- que created_at puede ir semanas por delante). Los otros dos constructores de
-- FeedEvent a partir de un pase -- recent-reviews.ts y shared-activity.ts -- leen
-- de esta vista y seguían con created_at porque la vista no proyectaba updated_at.
--
-- Se añade d.updated_at AL FINAL (create or replace view solo admite columnas
-- nuevas al final; el resto conserva orden y definición). La RLS del WHERE no
-- cambia. Trade-off asumido, igual que en el feed: updated_at lo mueve CUALQUIER
-- update del pase (nota, edición), así que una edición posterior mueve la reseña.
-- Se acepta a cambio de que sortDate prometa una hora real y no un created_at
-- desfasado.
create or replace view public.pass_reviews as
select
  d.id, d.user_id, d.item_type, d.item_id,
  d.status, d.is_active, d.position, d.pinned_order,
  d.started_on, d.finished_on, d.rating, d.review, d.is_public,
  d.edition_id, d.created_at, d.updated_at
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
