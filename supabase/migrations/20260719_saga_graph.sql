-- Sagas v2 fase 1 (spec §1.3): grafo de lectura curado. Un nodo referencia un
-- ítem del catálogo O una saga anidada (XOR). La subsaga de un nodo NO se
-- guarda: se deriva de saga_items. order_no define el orden principal;
-- opcional = nodo sin order_no. En fase 1 estas tablas quedan vacías (el
-- editor llega en fase 3); la ficha solo consulta si existen nodos.

create type public.saga_node_level as enum ('principal', 'menor');
create type public.saga_edge_type as enum ('principal', 'opcional', 'requisito');

create table public.saga_nodes (
  id             uuid primary key default gen_random_uuid(),
  saga_id        uuid not null references public.sagas(id) on delete cascade,
  item_type      public.item_type,
  item_id        uuid,
  child_saga_id  uuid references public.sagas(id) on delete cascade,
  x              real not null default 0,
  y              real not null default 0,
  level          public.saga_node_level not null default 'principal',
  order_no       integer check (order_no > 0),
  label_override text check (char_length(label_override) <= 120),
  created_at     timestamptz not null default now(),
  constraint saga_nodes_ref_xor check (
    (item_type is not null and item_id is not null and child_saga_id is null)
    or (item_type is null and item_id is null and child_saga_id is not null)
  )
);
create unique index saga_nodes_item_key on public.saga_nodes (saga_id, item_type, item_id)
  where item_id is not null;
create unique index saga_nodes_child_key on public.saga_nodes (saga_id, child_saga_id)
  where child_saga_id is not null;
create index saga_nodes_saga_idx on public.saga_nodes (saga_id);

create table public.saga_edges (
  id        uuid primary key default gen_random_uuid(),
  saga_id   uuid not null references public.sagas(id) on delete cascade,
  from_node uuid not null references public.saga_nodes(id) on delete cascade,
  to_node   uuid not null references public.saga_nodes(id) on delete cascade,
  edge_type public.saga_edge_type not null default 'principal',
  constraint saga_edges_no_self check (from_node <> to_node),
  constraint saga_edges_pair_key unique (from_node, to_node)
);
create index saga_edges_saga_idx on public.saga_edges (saga_id);

-- RLS: catálogo compartido — lectura pública, escritura = curación (collaborator+,
-- mismo gate que sagas/saga_items, §7.35).
alter table public.saga_nodes enable row level security;
create policy "saga nodes readable" on public.saga_nodes
  for select to anon, authenticated using (true);
create policy "saga nodes writable by collaborators" on public.saga_nodes
  for all to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));

alter table public.saga_edges enable row level security;
create policy "saga edges readable" on public.saga_edges
  for select to anon, authenticated using (true);
create policy "saga edges writable by collaborators" on public.saga_edges
  for all to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));
