-- Filas de import sin match automático, guardadas para revisión manual por un
-- colaborador (§7.7/§7.35). El dueño de la fila conserva la propiedad: al
-- resolverse, la entrada de biblioteca se crea para él, no para el revisor.
create type public.pending_import_status as enum ('pending', 'resolved', 'dismissed');

create table public.pending_import_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type public.item_type not null,
  payload jsonb not null,           -- ImportRow serializado
  status public.pending_import_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index pending_import_rows_user_idx on public.pending_import_rows (user_id);
create index pending_import_rows_pending_idx on public.pending_import_rows (status) where status = 'pending';

alter table public.pending_import_rows enable row level security;

-- El dueño ve, crea y descarta sus propias filas.
create policy "pending import select own or collaborator" on public.pending_import_rows
  for select to authenticated
  using ((select auth.uid()) = user_id or public.has_min_role('collaborator'));

create policy "pending import insert own" on public.pending_import_rows
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "pending import delete own" on public.pending_import_rows
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Los colaboradores pueden marcar resueltas/descartadas (cola de revisión).
create policy "pending import update by collaborators" on public.pending_import_rows
  for update to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));

-- Resuelve una fila pendiente creando la entrada de biblioteca (y los pases de
-- diario) PARA EL DUEÑO de la fila, no para el revisor. SECURITY DEFINER porque
-- inserta con un user_id distinto del de auth.uid() (lo que la RLS "insert own"
-- de library_entries no permitiría). El colaborador crea antes el ítem de
-- catálogo y pasa su id aquí.
create or replace function public.resolve_pending_import(
  p_pending_id uuid,
  p_catalog_item_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pending_import_rows;
  v_entry_id uuid;
  v_position jsonb;
  v_date jsonb;
begin
  if not public.has_min_role('collaborator') then
    raise exception 'forbidden';
  end if;

  select * into v_row from public.pending_import_rows
    where id = p_pending_id and status = 'pending';
  if not found then
    raise exception 'pending row not found';
  end if;

  v_position := case
    when v_row.payload->>'bookFormat' is not null
      then jsonb_build_object('format', v_row.payload->>'bookFormat')
    else '{}'::jsonb
  end;

  insert into public.library_entries (user_id, item_type, item_id, status, rating, position)
  values (
    v_row.user_id,
    v_row.item_type,
    p_catalog_item_id,
    coalesce(nullif(v_row.payload->>'status','')::media_status, 'planned'),
    nullif(v_row.payload->>'rating','')::smallint,
    v_position
  )
  on conflict (user_id, item_type, item_id) do update set item_id = excluded.item_id
  returning id into v_entry_id;

  for v_date in
    select * from jsonb_array_elements(coalesce(v_row.payload->'diaryDates', '[]'::jsonb))
  loop
    insert into public.diary_entries (library_entry_id, user_id, started_on, finished_on, rating)
    values (
      v_entry_id,
      v_row.user_id,
      nullif(v_date->>'startedOn','')::date,
      (v_date->>'finishedOn')::date,
      nullif(v_row.payload->>'rating','')::smallint
    );
  end loop;

  update public.pending_import_rows
    set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
    where id = p_pending_id;
end;
$$;

revoke execute on function public.resolve_pending_import(uuid, uuid) from public, anon;
grant execute on function public.resolve_pending_import(uuid, uuid) to authenticated;
