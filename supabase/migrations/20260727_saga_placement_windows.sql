-- La ventana de una entrada `libre` (spec 2026-07-26, fase 2b): entre dónde y
-- dónde se lee algo que no ocupa un hueco del orden. El caso que la motiva, en
-- palabras del curador: «Nacidos Era 2 es opcional, A PARTIR DE Era 1, y
-- recomendable ANTES DE Viento y Verdad».
--
-- ⚠️ Esto son aristas otra vez, con otro nombre. Lo que impide que degeneren en
-- el lienzo que la fase 2a retiró es la RESTRICCIÓN DURA: una fila por entrada,
-- dos anclas como máximo, solo para entradas `libre`, y curadas con dos
-- selectores — nunca arrastrando. Si alguna vez se relaja el unique, se admite
-- un tercer tipo de ancla o se deja que un ancla apunte fuera del subárbol, se
-- ha vuelto al punto de partida y hay que decirlo en voz alta.
create table public.saga_placement_windows (
  id uuid primary key default gen_random_uuid(),
  saga_id uuid not null references public.sagas(id) on delete cascade,

  -- SUJETO: la entrada cuya ventana es esta. Obra XOR bloque.
  item_type public.item_type,
  item_id uuid,
  child_saga_id uuid references public.sagas(id) on delete cascade,

  -- ANCLA «a partir de». Obra XOR bloque, opcional.
  after_item_type public.item_type,
  after_item_id uuid,
  after_child_saga_id uuid references public.sagas(id) on delete cascade,

  -- ANCLA «recomendable antes de». Misma forma, opcional.
  before_item_type public.item_type,
  before_item_id uuid,
  before_child_saga_id uuid references public.sagas(id) on delete cascade,

  created_at timestamptz not null default now(),

  -- El sujeto es obra XOR bloque, y una obra necesita SIEMPRE su tipo: item_id
  -- es polimórfico (book|movie|series) y sin item_type no se sabe a qué tabla
  -- apunta. Escrito sobre IS NOT NULL a propósito: la fase 1 se quemó con un
  -- CHECK de tres ramas unidas por OR, donde comparar con NULL da NULL, el OR
  -- entero da NULL y un CHECK solo rechaza FALSE — así que la fila imposible
  -- pasaba. `IS NOT NULL` nunca da NULL.
  constraint saga_placement_windows_subject check (
    ((item_id is not null and item_type is not null) and child_saga_id is null)
    or
    ((item_id is null and item_type is null) and child_saga_id is not null)
  ),
  constraint saga_placement_windows_after check (
    (after_item_id is null and after_item_type is null and after_child_saga_id is null)
    or ((after_item_id is not null and after_item_type is not null) and after_child_saga_id is null)
    or ((after_item_id is null and after_item_type is null) and after_child_saga_id is not null)
  ),
  constraint saga_placement_windows_before check (
    (before_item_id is null and before_item_type is null and before_child_saga_id is null)
    or ((before_item_id is not null and before_item_type is not null) and before_child_saga_id is null)
    or ((before_item_id is null and before_item_type is null) and before_child_saga_id is not null)
  ),
  -- Al menos un ancla: una ventana sin ninguna es un `libre` sin ventana, y
  -- entonces no hay fila.
  constraint saga_placement_windows_needs_anchor check (
    after_item_id is not null or after_child_saga_id is not null
    or before_item_id is not null or before_child_saga_id is not null
  )
);

-- Una fila por entrada. Mismo par de uniques parciales que ya protege
-- `saga_nodes` y `saga_route_entries` (20260723_saga_route_entries_uniques.sql).
create unique index saga_placement_windows_item_key
  on public.saga_placement_windows (saga_id, item_type, item_id) where item_id is not null;
create unique index saga_placement_windows_child_key
  on public.saga_placement_windows (saga_id, child_saga_id) where child_saga_id is not null;

create index saga_placement_windows_saga_idx on public.saga_placement_windows (saga_id);

alter table public.saga_placement_windows enable row level security;

-- Forma calcada de saga_routes/saga_route_entries (20260723_saga_routes.sql):
-- lectura pública para anon+authenticated, escritura solo para collaborator+.
create policy "saga placement windows readable by all" on public.saga_placement_windows
  for select to anon, authenticated using (true);
create policy "saga placement windows writable by collaborators" on public.saga_placement_windows
  for all to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));
