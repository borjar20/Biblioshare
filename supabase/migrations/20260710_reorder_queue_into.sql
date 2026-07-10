-- Reordenación atómica AMPLIADA a colas múltiples (§7.22).
--
-- La versión previa (reorder_queue(uuid[])) renumeraba una única cola
-- implícita. Con varias colas, arrastrar un ítem de una cola a otra debe (a)
-- fijar su queue_id y (b) renumerar la cola destino, en la MISMA escritura
-- atómica — si no, un fallo entre ambos pasos dejaría el ítem en una cola con
-- un orden de la otra. Nueva firma con la cola destino como primer argumento.
--
-- Cambia la aridad, así que se elimina la sobrecarga anterior para no dejar una
-- resolución ambigua.
drop function if exists public.reorder_queue(uuid[]);

-- target_queue puede ser NULL: reordenar el bucket "Sin cola" (planificados sin
-- cola asignada). Cuando no es NULL, se valida que la cola pertenezca al
-- usuario — una cola ajena no debe poder recibir ítems, ni siquiera con ids
-- propios en el array. SECURITY INVOKER: la RLS "own queues"/"library entries
-- update own" sigue aplicando; el filtro explícito por auth.uid() e ids
-- obsoletos se mantiene.
create or replace function public.reorder_queue(target_queue uuid, entry_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if target_queue is not null
     and not exists (
       select 1 from public.queues q
       where q.id = target_queue and q.user_id = auth.uid()
     ) then
    raise exception 'Queue % does not belong to the current user', target_queue;
  end if;

  update public.library_entries le
  set queue_order = t.ord - 1,
      queue_id = target_queue
  from unnest(entry_ids) with ordinality as t(id, ord)
  where le.id = t.id
    and le.user_id = auth.uid()
    and le.status = 'planned';
end;
$$;

revoke execute on function public.reorder_queue(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_queue(uuid, uuid[]) to authenticated;
