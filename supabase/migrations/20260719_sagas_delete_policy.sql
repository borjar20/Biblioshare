-- Mejoras post-v2 §3 (borrar saga): sagas tenía RLS con políticas de
-- SELECT/INSERT/UPDATE pero NINGUNA de DELETE, así que el DELETE de la action
-- deleteSaga afectaba 0 filas sin error (hallazgo Critical de la revisión).
-- Borrar una saga es curación → collaborator+ (§7.35). Las cascadas de
-- saga_items/saga_nodes/saga_edges/saga_follows son acciones referenciales
-- (exentas de RLS) y parent_saga_id hace set null: las subsagas sobreviven
-- como raíces.

create policy "sagas deletable by collaborators" on public.sagas
  for delete to authenticated
  using (public.has_min_role('collaborator'));
