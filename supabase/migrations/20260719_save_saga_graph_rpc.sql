-- Sagas v2 fase 3 (spec §3.2): guardado atómico del grafo. El editor manda el
-- borrador completo y esta función hace el full-replace de saga_nodes y
-- saga_edges en UNA transacción (patrón spawn_linked_activity): sin estados a
-- medias si una arista referencia un nodo inválido (los FKs y el XOR de la
-- tabla validan dentro de la misma transacción). El cliente genera los uuid de
-- los nodos para poder referenciarlos desde las aristas antes de guardar.
-- SECURITY DEFINER + gate interno collaborator+ (§7.35); RLS de las tablas ya
-- exige lo mismo, esto lo hace explícito e independiente del rol de la sesión.

create or replace function public.save_saga_graph(
  p_saga_id uuid,
  p_nodes jsonb,
  p_edges jsonb
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

  delete from saga_edges where saga_id = p_saga_id;
  delete from saga_nodes where saga_id = p_saga_id;

  insert into saga_nodes (id, saga_id, item_type, item_id, child_saga_id, x, y, level, order_no, label_override)
  select
    (n->>'id')::uuid,
    p_saga_id,
    (n->>'item_type')::public.item_type,
    (n->>'item_id')::uuid,
    (n->>'child_saga_id')::uuid,
    coalesce((n->>'x')::real, 0),
    coalesce((n->>'y')::real, 0),
    coalesce(n->>'level', 'principal')::public.saga_node_level,
    (n->>'order_no')::integer,
    nullif(n->>'label_override', '')
  from jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb)) as n;

  insert into saga_edges (saga_id, from_node, to_node, edge_type)
  select
    p_saga_id,
    (e->>'from_node')::uuid,
    (e->>'to_node')::uuid,
    coalesce(e->>'edge_type', 'principal')::public.saga_edge_type
  from jsonb_array_elements(coalesce(p_edges, '[]'::jsonb)) as e;
end;
$$;

revoke execute on function public.save_saga_graph(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_saga_graph(uuid, jsonb, jsonb) to authenticated;

-- DEFER F1: el inspector lista «aristas entrantes» de un nodo (to_node) y el
-- único índice existente empieza por from_node.
create index saga_edges_to_node_idx on public.saga_edges (to_node);
