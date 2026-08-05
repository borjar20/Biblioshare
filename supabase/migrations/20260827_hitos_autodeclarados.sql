-- Issue #471 (opción B) — los hitos de buddy_read dejan de ser una página absoluta con
-- gate numérico y pasan a ser autodeclarados. Motivo: la página objetivo la fijaba el
-- moderador según SU edición, y cada participante mide en páginas de LA SUYA
-- (book_editions.total_pages varía): el mismo número cae en puntos distintos de la
-- historia. Con edición más compacta no podías confirmar aunque hubieras terminado el
-- tramo; con edición más paginada se te abría el chat (spoiler guard) antes de llegar.
--
-- Confirmar es ahora declarar «ya llegué»: solo exige ser participante. El spoiler guard
-- (can_view_target: participante + has_reached_checkpoint) no cambia — el chat sigue
-- cerrado hasta que confirmas. La posición del checkpoint queda como pista visual
-- opcional ({} = sin pista); la comparación TS (hasReachedPosition) se elimina en el
-- mismo cambio de app.
--
-- Sustituye a 20260826_confirm_checkpoint_lee_passes.sql, que arregló el drift de
-- library_entries→passes (#470) dentro del gate que aquí desaparece.

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

  if v_activity_id is null then
    raise exception 'not found';
  end if;
  if not public.is_activity_participant(v_activity_id) then
    raise exception 'forbidden';
  end if;

  -- Confirmar el checkpoint N auto-confirma 1..N-1 (idempotente) -- evita que quien
  -- salta directo a un checkpoint tardío se quede sin fila en los anteriores.
  insert into public.club_activity_checkpoint_reads (checkpoint_id, user_id)
  select id, auth.uid()
    from public.club_activity_checkpoints
    where activity_id = v_activity_id and "order" <= v_order
  on conflict (checkpoint_id, user_id) do nothing;
end;
$$;

comment on table public.club_activity_checkpoints is 'Checkpoints ordenados de una actividad buddy_read (EPIC-05 Bloque H1). position es el mismo shape polimórfico que passes.position, como PISTA visual opcional ({} = sin pista) -- desde #471 no gatea nada: la página depende de la edición de cada participante. Visibles a todo el club; solo moderator+ los crea/edita/borra, y solo mientras la actividad está active.';

comment on table public.club_activity_checkpoint_reads is 'Quién ha declarado haber llegado a qué checkpoint (tablero de progreso grupal). Sin política de escritura de cliente -- solo vía confirm_checkpoint() (SECURITY DEFINER), que desde #471 es autodeclarativa: exige ser participante, sin revalidación de posición (las ediciones hacen incomparables las páginas).';
