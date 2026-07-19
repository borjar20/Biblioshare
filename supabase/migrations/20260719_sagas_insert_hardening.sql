-- Sagas v2 fase 1 — endurecimiento pre-prod (revisión final): crear sagas
-- sueltas sigue abierto a autenticados (lo necesita el cache-as-you-go de
-- persist-collection.ts), pero colgar una saga como hija de otra
-- (parent_saga_id) es curación de jerarquía → collaborator+ (§7.35). Sin esto,
-- cualquier autenticado podría colgar sagas basura de un universo curado vía
-- PostgREST y aparecerían como subsagas en la ficha.

drop policy "sagas insertable" on public.sagas;
create policy "sagas insertable" on public.sagas
  for insert to authenticated
  with check (parent_saga_id is null or public.has_min_role('collaborator'));
