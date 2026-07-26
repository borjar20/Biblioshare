-- supabase/migrations/20260727_save_saga_sequence_windows.sql
--
-- Fase 2b: `save_saga_sequence` también guarda las ventanas de colocación
-- (`saga_placement_windows`, 20260727_saga_placement_windows.sql).
--
-- ⚠️ Añadir un parámetro a una función de Postgres NO la reemplaza, crea una
-- SOBRECARGA. Borrar la de cuatro argumentos rompería el bundle que hoy está
-- desplegado en producción, que llama con cuatro. Por eso la de cuatro
-- argumentos no desaparece aquí: se reescribe como un envoltorio de la de
-- cinco, y se queda viva hasta que el código nuevo (que ya manda `p_windows`)
-- esté desplegado. Retirar el envoltorio es de otra tarea, después del
-- despliegue.
create or replace function public.save_saga_sequence(
  p_saga_id uuid,
  p_entries jsonb,
  p_blocks  jsonb,
  p_removed jsonb,
  p_windows jsonb
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
    -- `is_primary` NO puede ser un `false` incondicional: el resto de escritores
    -- (assignItemToSaga, link_tmdb_saga_item) marcan la fila como principal
    -- cuando el ítem no tiene ya una principal en otra saga, y sin esto un alta
    -- desde el editor deja al ítem SIN saga principal — que luego se lleva, en
    -- silencio, la siguiente saga a la que alguien lo añada desde la ficha.
    -- El `not exists` se evalúa contra la instantánea previa a la sentencia, lo
    -- cual es correcto aquí porque `validateSequenceDraft` ya rechaza un payload
    -- con el mismo ítem dos veces.
    not exists (
      select 1 from saga_items p
      where p.item_type = (e->>'item_type')::public.item_type
        and p.item_id = (e->>'item_id')::uuid
        and p.is_primary
    )
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

  -- Reemplazo total de las ventanas DE ESTA SAGA. Aquí sí es correcto —al
  -- contrario que en `saga_items`, donde la baja es explícita— porque no hay un
  -- segundo escritor: ninguna otra pantalla crea ventanas. Y borrar primero es
  -- lo que garantiza la coherencia que ningún CHECK entre tablas puede dar: una
  -- entrada que deja de ser `libre` no viaja en p_windows, así que su ventana
  -- desaparece en la misma transacción en que se mueve de zona.
  delete from saga_placement_windows where saga_id = p_saga_id;

  insert into saga_placement_windows (
    saga_id, item_type, item_id, child_saga_id,
    after_item_type, after_item_id, after_child_saga_id,
    before_item_type, before_item_id, before_child_saga_id
  )
  select
    p_saga_id,
    (w->>'item_type')::public.item_type, (w->>'item_id')::uuid, (w->>'child_saga_id')::uuid,
    (w->>'after_item_type')::public.item_type, (w->>'after_item_id')::uuid, (w->>'after_child_saga_id')::uuid,
    (w->>'before_item_type')::public.item_type, (w->>'before_item_id')::uuid, (w->>'before_child_saga_id')::uuid
  from jsonb_array_elements(coalesce(p_windows, '[]'::jsonb)) as w;
end;
$$;

revoke execute on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

comment on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb, jsonb) is
  'Guardado atómico de la secuencia de una saga: obras propias, colocación de hijas directas, bajas explícitas y ventanas de colocación (reemplazo total). Collaborator+. La baja de saga_items NUNCA es por omisión; la de ventanas SÍ, porque no hay segundo escritor.';

-- La versión de CUATRO argumentos pasa a ser un envoltorio, y se queda viva
-- hasta que el código nuevo esté desplegado. Sin esto, el bundle que hay hoy en
-- producción —que llama con cuatro— se quedaría sin función entre la migración
-- y el despliegue.
--
-- ⚠️ Llamar con `'[]'::jsonb` borra las ventanas de la saga (reemplazo total,
-- ver arriba). Para el bundle viejo eso es correcto: no conoce las ventanas y
-- nunca las manda, así que no hay ventanas suyas que perder. Pero si alguien
-- guardara desde el editor VIEJO una saga que YA tiene ventanas guardadas
-- (creadas mientras tanto desde el editor nuevo), esas ventanas desaparecerían
-- sin aviso. Es una ventana de riesgo de minutos, entre esta migración y el
-- despliegue del bundle nuevo — no antes (el bundle viejo no sabe de ventanas
-- hasta que esta migración existe) ni después (a partir del despliegue todo el
-- mundo llama con cinco argumentos).
create or replace function public.save_saga_sequence(
  p_saga_id uuid,
  p_entries jsonb,
  p_blocks  jsonb,
  p_removed jsonb
) returns void
language sql
security definer
set search_path = public
as $$ select public.save_saga_sequence(p_saga_id, p_entries, p_blocks, p_removed, '[]'::jsonb) $$;

revoke execute on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb) to authenticated;

comment on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb) is
  'Envoltorio de compatibilidad para el bundle desplegado sin ventanas: delega en la versión de cinco argumentos con p_windows = ''[]''. Vivo solo hasta que el código nuevo esté desplegado; retirarlo es de otra tarea.';
