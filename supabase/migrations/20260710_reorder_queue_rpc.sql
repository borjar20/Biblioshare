-- Reordenación atómica de la cola (§7.22): un solo UPDATE con unnest ... with
-- ordinality en vez de N updates en paralelo sin transacción (que podían dejar
-- la cola a medias). SECURITY INVOKER: corre con los permisos del usuario, así
-- que la RLS "library entries update own" aplica; además se filtra por
-- user_id = auth.uid() y status = 'planned' para ignorar ids obsoletos.
create or replace function public.reorder_queue(entry_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.library_entries le
  set queue_order = t.ord - 1
  from unnest(entry_ids) with ordinality as t(id, ord)
  where le.id = t.id
    and le.user_id = auth.uid()
    and le.status = 'planned';
end;
$$;

revoke execute on function public.reorder_queue(uuid[]) from public, anon;
grant execute on function public.reorder_queue(uuid[]) to authenticated;
