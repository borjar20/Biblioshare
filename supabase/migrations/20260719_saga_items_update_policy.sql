-- Sagas v2 fase 1: saga_items no tenía política de UPDATE (el modelo viejo
-- solo borraba+insertaba). La necesitan el upsert de assignItemToSaga y el
-- sync de posiciones de populateTmdbCollection. Curación = collaborator+
-- (§7.35), igual que el DELETE: para no-colaboradores el sync de posiciones
-- es no-op silencioso, como ya lo era el delete+insert anterior.
create policy "saga items updatable by collaborators" on public.saga_items
  for update to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));
