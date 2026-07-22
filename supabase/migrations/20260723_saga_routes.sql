-- Itinerarios de lectura (spec 2026-07-22-sagas-itinerarios-design.md).
-- Una saga puede tener varias rutas curadas con nombre. Las dos rutas de hoy
-- ("Orden de lectura" y "Publicación") NO se materializan: se sintetizan en
-- código con los slugs reservados `lectura` y `publicacion`. Materializarlas
-- obligaría a resincronizar la ruta `lectura` con el grafo en cada edición —
-- dos fuentes de verdad del mismo orden, que es la familia de fallo del #91.

create table public.saga_routes (
  id uuid primary key default gen_random_uuid(),
  saga_id uuid not null references public.sagas (id) on delete cascade,
  slug text not null,
  name text not null check (char_length(name) between 1 and 80),
  summary text check (summary is null or char_length(summary) <= 280),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (saga_id, slug),
  -- Slugs reservados para las rutas sintéticas.
  constraint saga_routes_slug_not_reserved check (slug not in ('lectura', 'publicacion')),
  constraint saga_routes_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create index saga_routes_saga_idx on public.saga_routes (saga_id, position);

create table public.saga_route_entries (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.saga_routes (id) on delete cascade,
  position integer not null check (position > 0),
  item_type public.item_type,
  item_id uuid,
  child_saga_id uuid references public.sagas (id) on delete cascade,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (route_id, position),
  -- Calcado de saga_nodes_ref_xor: una entrada es una obra O una subsaga.
  constraint saga_route_entries_ref_xor check (
    (item_type is not null and item_id is not null and child_saga_id is null)
    or (item_type is null and item_id is null and child_saga_id is not null)
  )
);
create index saga_route_entries_route_idx on public.saga_route_entries (route_id, position);

-- Adopción: guarda el SLUG, no el route_id, para que valga tanto con rutas
-- curadas como con las sintéticas y para que borrar una ruta degrade solo al
-- orden por defecto en vez de dejar una FK rota.
create table public.saga_route_choices (
  user_id uuid not null references auth.users (id) on delete cascade,
  saga_id uuid not null references public.sagas (id) on delete cascade,
  route_slug text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, saga_id)
);

alter table public.saga_routes enable row level security;
alter table public.saga_route_entries enable row level security;
alter table public.saga_route_choices enable row level security;

create policy "saga routes readable by all" on public.saga_routes
  for select to anon, authenticated using (true);
create policy "saga routes writable by collaborators" on public.saga_routes
  for all to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));

create policy "saga route entries readable by all" on public.saga_route_entries
  for select to anon, authenticated using (true);
create policy "saga route entries writable by collaborators" on public.saga_route_entries
  for all to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));

create policy "saga route choices own" on public.saga_route_choices
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Guardado atómico de los pasos: full-replace, mismo patrón que
-- save_saga_graph. SECURITY DEFINER con gate interno explícito.
create or replace function public.save_saga_route(
  p_route_id uuid,
  p_entries jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_min_role('collaborator') then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from saga_routes where id = p_route_id) then
    raise exception 'route % not found', p_route_id;
  end if;

  delete from saga_route_entries where route_id = p_route_id;

  insert into saga_route_entries (route_id, position, item_type, item_id, child_saga_id, note)
  select
    p_route_id,
    (e->>'position')::integer,
    (e->>'item_type')::public.item_type,
    (e->>'item_id')::uuid,
    (e->>'child_saga_id')::uuid,
    nullif(e->>'note', '')
  from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as e;
end;
$$;

revoke execute on function public.save_saga_route(uuid, jsonb) from public, anon;
grant execute on function public.save_saga_route(uuid, jsonb) to authenticated;

comment on function public.save_saga_route(uuid, jsonb) is
  'Full-replace atómico de los pasos de un itinerario. Collaborator+.';
