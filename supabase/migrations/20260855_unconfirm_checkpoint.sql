-- Desmarcar un hito de lectura conjunta, y el gate de confirm_checkpoint
-- (spec 2026-08-12).
--
-- POR QUÉ UNA RPC: `club_activity_checkpoint_reads` no tiene política de
-- escritura de cliente, a propósito (20260713_activity_checkpoints.sql). No hay
-- ningún camino de borrado, así que desmarcar exige función, no un `delete`
-- expuesto.
--
-- LA CASCADA VA HACIA DELANTE, simétrica a la de confirmar: confirmar el hito N
-- auto-confirma 1..N, así que desmarcar el N desmarca N..último. El invariante
-- es que el progreso de cada participante sea un tramo CONTINUO desde el
-- principio -- «voy por el hito 3» es lo único que significa algo en una
-- lectura. Permitir huecos daría estados sin sentido («he llegado al 5 pero no
-- al 2») que además no cambiarían ningún número, porque el tablero de grupo mide
-- por el hito más alto alcanzado.
--
-- NO comprueba el estado de la actividad, igual que confirm_checkpoint. La
-- asimetría sería peor que la permisividad: si puedes marcar en una actividad
-- finalizada, tienes que poder desmarcar.
create or replace function public.unconfirm_checkpoint(p_checkpoint_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_order smallint;
begin
  select activity_id, "order" into v_activity_id, v_order
    from public.club_activity_checkpoints
    where id = p_checkpoint_id;

  -- Gate PRIMERO (#129, migración 20260831). Con un id que no existe,
  -- v_activity_id es null y is_activity_participant(null) da false, así que
  -- quien pregunta recibe `forbidden` y no aprende si ese hito existe.
  if not public.is_activity_participant(v_activity_id) then
    raise exception 'forbidden';
  end if;

  -- Guarda defensiva: con el gate delante es inalcanzable, igual que en las
  -- cuatro funciones que arregló 20260831. Se conserva por coherencia con ellas.
  if v_activity_id is null then
    raise exception 'not_found';
  end if;

  -- Solo TUS filas: r.user_id = auth.uid(). Idempotente -- desmarcar dos veces
  -- seguidas no falla, la segunda borra cero filas.
  delete from public.club_activity_checkpoint_reads r
   using public.club_activity_checkpoints c
   where r.checkpoint_id = c.id
     and c.activity_id = v_activity_id
     and c."order" >= v_order
     and r.user_id = auth.uid();
end;
$$;

comment on function public.unconfirm_checkpoint(uuid) is
  'Deshace la declaración de haber llegado a un hito, y a los posteriores (spec 2026-08-12). Simétrica a confirm_checkpoint, que auto-confirma 1..N: el progreso de cada participante es siempre un tramo continuo desde el principio. Solo borra filas del llamante. Exige ser participante; no mira el estado de la actividad, igual que su gemela.';

revoke execute on function public.unconfirm_checkpoint(uuid) from public, anon;
grant execute on function public.unconfirm_checkpoint(uuid) to authenticated;


-- ── confirm_checkpoint: el gate de participante pasa a ir PRIMERO ────────────
-- Comprobaba `not found` ANTES que el permiso, así que revelaba si un uuid de
-- hito existe a quien no participa en la actividad. Es la misma fuga de INFO que
-- 20260831_club_activity_role_gate_first.sql (issue #129) corrigió en cuatro RPC
-- de club_activities. El cuerpo (la cascada 1..N) NO cambia: solo el orden de las
-- comprobaciones, y el código 'not found' se normaliza a 'not_found' para que
-- las dos gemelas hablen igual.
create or replace function public.confirm_checkpoint(p_checkpoint_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_order smallint;
begin
  select activity_id, "order" into v_activity_id, v_order
    from public.club_activity_checkpoints
    where id = p_checkpoint_id;

  if not public.is_activity_participant(v_activity_id) then
    raise exception 'forbidden';
  end if;

  if v_activity_id is null then
    raise exception 'not_found';
  end if;

  -- Confirmar el checkpoint N auto-confirma 1..N (idempotente) -- evita que quien
  -- salta directo a un checkpoint tardío se quede sin fila en los anteriores.
  insert into public.club_activity_checkpoint_reads (checkpoint_id, user_id)
  select id, auth.uid()
    from public.club_activity_checkpoints
    where activity_id = v_activity_id and "order" <= v_order
  on conflict (checkpoint_id, user_id) do nothing;
end;
$$;
