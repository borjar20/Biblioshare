-- Consolida las políticas de club_activity_items (fix de drift, revisión 2026-07-14).
--
-- Historia del problema: la política INSERT se reescribió por drop+recreate en
-- CUATRO migraciones (Bloque G -> H3 -> propose_with_setup -> H2 tierlist), y el
-- orden de APLICACIÓN en producción no coincidió con el orden de los ficheros:
-- tierlist (20260713180350) se aplicó ANTES que propose_with_setup
-- (20260713220944), así que propose_with_setup — que partía del texto de H3 —
-- machacó la rama de curador de tierlist. Estado resultante en prod: el pool de
-- una tierlist ACTIVA lo podía ampliar cualquier participante (rama else),
-- justo lo que H2 quería impedir. Y en el repo, 20260714_tierlist.sql no
-- incluye la rama de borrador de propose_with_setup, así que un replay en orden
-- de fichero rompería el asistente de proponer.
--
-- Esta migración deja la versión FINAL única con las tres ramas:
--   1. Borrador: el creador siembra su propia propuesta mientras está en
--      'proposed' (propose_with_setup).
--   2. Curador: en list_challenge y tierlist, la lista/el pool es el enunciado
--      — solo creador o moderator+ lo curan (H3 + H2).
--   3. Participante: el resto de kinds conserva la semántica de G.
--
-- Lección de proceso: cuando dos ramas tocan la MISMA política, la última en
-- aplicarse debe partir del texto vigente en prod, no del de su rama.

drop policy if exists "club_activity_items insert participant or curator" on public.club_activity_items;

create policy "club_activity_items insert participant or curator" on public.club_activity_items
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and (
          -- Rama 1: tu propia propuesta, mientras siga siendo un borrador.
          (ca.created_by = (select auth.uid()) and ca.status = 'proposed')
          or case
            -- Rama 2: la lista/el pool es el enunciado -> solo curadores.
            when ca.kind in ('list_challenge', 'tierlist') then
              ca.created_by = (select auth.uid())
              or public.has_min_club_role(ca.club_id, 'moderator')
            -- Rama 3: el resto de kinds, semántica original de Bloque G.
            else public.is_activity_participant(ca.id)
          end
        )
    )
  );

-- DELETE: la versión de H2 (tierlist incluida en la rama de curador) ya es la
-- vigente en prod, pero se recrea aquí para que la versión canónica viva en UNA
-- migración y cualquier entorno rezagado converja.
drop policy if exists "club_activity_items delete own or moderate or curator" on public.club_activity_items;

create policy "club_activity_items delete own or moderate or curator" on public.club_activity_items
  for delete to authenticated
  using (
    added_by = (select auth.uid())
    or exists (
      select 1 from public.club_activities ca
      where ca.id = activity_id
        and (
          public.has_min_club_role(ca.club_id, 'moderator')
          or (ca.kind in ('list_challenge', 'tierlist') and ca.created_by = (select auth.uid()))
        )
    )
  );
