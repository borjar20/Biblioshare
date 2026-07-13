-- Proponer una actividad YA MONTADA (asistente de "Proponer actividad", Paper).
--
-- El diseño quiere que al proponer una actividad elijas su ítem y definas sus
-- hitos en el mismo formulario. Con la RLS actual eso es IMPOSIBLE:
--
--   · club_activity_items: exige is_activity_participant(). Quien propone una
--     actividad recién creada NO es participante de ella todavía. (Salvo en
--     list_challenge, donde el Bloque H3 ya abrió la rama del creador.)
--
--   · club_activity_checkpoints: exige status = 'active' Y moderator+. Una
--     actividad recién propuesta está en 'proposed', así que el insert se
--     deniega SIEMPRE, sin excepción.
--
-- Falta una regla que el modelo no tenía: mientras una actividad está
-- 'proposed', es el BORRADOR de quien la propone. Nadie se ha unido, nadie tiene
-- progreso, nadie la está usando — está esperando a que un moderador la apruebe.
-- Que su autor la monte antes de mandarla no le quita nada a nadie.
--
-- Lo que esta migración NO toca, y es lo importante: la garantía de que a una
-- actividad YA ACTIVA no se le muevan los hitos bajo los pies de quien va por la
-- mitad. Esa sigue igual — 'active' sigue siendo territorio exclusivo de
-- moderator+.

-- ── 1. Ítems: el creador puede sembrar el pool de su propia propuesta ────────
drop policy "club_activity_items insert participant or curator" on public.club_activity_items;

create policy "club_activity_items insert participant or curator" on public.club_activity_items
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and (
          -- NUEVO: tu propia propuesta, mientras siga siendo un borrador.
          (ca.created_by = (select auth.uid()) and ca.status = 'proposed')
          or case
            when ca.kind = 'list_challenge' then
              ca.created_by = (select auth.uid())
              or public.has_min_club_role(ca.club_id, 'moderator')
            else public.is_activity_participant(ca.id)
          end
        )
    )
  );

-- ── 2. Hitos: el creador puede definirlos al proponer ───────────────────────
drop policy "club_activity_checkpoints insert moderator on active" on public.club_activity_checkpoints;

create policy "club_activity_checkpoints insert creator on proposed or moderator on active"
  on public.club_activity_checkpoints
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and (
          -- NUEVO: tu propia propuesta, mientras siga siendo un borrador.
          (ca.created_by = (select auth.uid()) and ca.status = 'proposed')
          -- Lo de antes, intacto: una actividad EN MARCHA solo la tocan los mods.
          or (ca.status = 'active' and public.has_min_club_role(ca.club_id, 'moderator'))
        )
    )
  );

comment on table public.club_activity_checkpoints is
  'Hitos de una lectura conjunta. Se pueden crear en dos momentos: por su autor mientras la actividad está en ''proposed'' (es su borrador, nadie la usa aún), o por un moderator+ una vez ''active''. Un participante normal nunca los crea, y a una actividad activa no se le mueven los hitos salvo por moderación — el progreso de quien va por la mitad depende de ellos.';
