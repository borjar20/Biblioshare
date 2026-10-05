-- Notas en el margen: el autor ve su propia fila en la misma sentencia.
-- INSERT ... RETURNING (createMarginNote usa .select('id')) evalúa la política de select
-- sobre la fila recién insertada, pero private.can_read_margin_note es STABLE y consulta
-- margin_notes con el snapshot de INICIO de la sentencia: no ve esa fila y el insert se
-- rechaza con 42501. La comprobación directa por columna sí ve la fila nueva.
drop policy margin_notes_select on public.margin_notes;
create policy margin_notes_select on public.margin_notes for select to authenticated
  using (author_id = auth.uid() or private.can_read_margin_note(id));

-- La CHECK margin_notes_anchor la evalúa el rol que escribe: service_role (fixtures,
-- tareas de servidor) también necesita execute. can_read_margin_note/encounter NO hacen
-- falta: service_role salta RLS y esas funciones solo viven en políticas.
grant execute on function private.margin_anchor_valid(public.item_type, jsonb) to service_role;
