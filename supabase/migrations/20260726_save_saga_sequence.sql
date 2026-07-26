-- supabase/migrations/20260726_save_saga_sequence.sql
--
-- Guardado atómico del editor de secuencia (spec 2026-07-26, fase 2a). Mismo
-- patrón y mismas garantías que `save_saga_route` (20260723_saga_routes.sql):
-- SECURITY DEFINER, gate de rol DENTRO de la función, revoke a public/anon.
--
-- DIFERENCIA DELIBERADA con save_saga_route y save_saga_graph: aquí NO hay
-- borrado por omisión. Las dos hermanas hacen `delete ... where <padre> = ...`
-- y reinsertan, porque sus filas solo las escribe su propio editor. `saga_items`
-- no: el formulario «Saga» de la ficha (`assignItemToSaga`) crea membresías
-- desde otra pantalla y otra persona. Con borrado por omisión, un curador que
-- abriera el editor, se fuera a comer y guardara borraría la obra que otro
-- añadió mientras tanto, sin error visible. Con `p_removed`, lo peor que pasa
-- es que un borrador rancio no la incluya.
create or replace function public.save_saga_sequence(
  p_saga_id uuid,
  p_entries jsonb,
  p_blocks  jsonb,
  p_removed jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_min_role('collaborator') then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from sagas where id = p_saga_id) then
    raise exception 'saga % not found', p_saga_id;
  end if;

  -- Obras de ESTA saga. El insert es lo que permite dar de alta desde el rail
  -- sin escribir en BD hasta que se guarda.
  insert into saga_items (saga_id, item_type, item_id, position, placement, optional, role, is_primary)
  select
    p_saga_id,
    (e->>'item_type')::public.item_type,
    (e->>'item_id')::uuid,
    (e->>'position')::integer,
    (e->>'placement')::public.saga_placement,
    coalesce((e->>'optional')::boolean, false),
    (e->>'role')::public.saga_item_role,
    false
  from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as e
  on conflict (saga_id, item_type, item_id) do update
    set position  = excluded.position,
        placement = excluded.placement,
        optional  = excluded.optional,
        role      = excluded.role;

  -- Hijas DIRECTAS. Sin insert ni delete: anidar y desanidar cambian
  -- `parent_saga_id` y son competencia de editor-actions.ts, no de la
  -- secuencia. El `where parent_saga_id = p_saga_id` impide que una petición
  -- manipulada recoloque la hija de otra saga.
  update sagas s
     set position_in_parent  = (b->>'position_in_parent')::integer,
         placement_in_parent = (b->>'placement_in_parent')::public.saga_placement,
         optional_in_parent  = coalesce((b->>'optional_in_parent')::boolean, false)
    from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) as b
   where s.id = (b->>'child_saga_id')::uuid
     and s.parent_saga_id = p_saga_id;

  -- Bajas explícitas, y SOLO estas.
  delete from saga_items si
   using jsonb_array_elements(coalesce(p_removed, '[]'::jsonb)) as r
   where si.saga_id = p_saga_id
     and si.item_type = (r->>'item_type')::public.item_type
     and si.item_id = (r->>'item_id')::uuid;
end;
$$;

revoke execute on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb) to authenticated;

comment on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb) is
  'Guardado atómico de la secuencia de una saga: obras propias, colocación de hijas directas y bajas explícitas. Collaborator+. La baja NUNCA es por omisión.';
