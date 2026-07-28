-- supabase/migrations/20260730_save_saga_sequence_subjects.sql
--
-- Fase 4 (B): `save_saga_sequence` deja de borrar las ventanas POR SAGA y pasa
-- a borrarlas por LISTA EXPLÍCITA DE SUJETOS.
--
-- Por qué. El comentario de la versión de 5 argumentos justificaba el reemplazo
-- total diciendo que «no hay un segundo escritor: ninguna otra pantalla crea
-- ventanas». Eso deja de ser cierto en el momento en que el editor del padre
-- puede curar la ventana de una obra de su hija: hay dos pantallas escribiendo
-- la misma fila. Guardar desde el Cosmere borraría en silencio la ventana que
-- El Archivo tiene curada sobre *Esquirla del Amanecer*, o al revés. Es
-- exactamente la situación que en la fase 2a obligó a que la baja de
-- `saga_items` fuera explícita en vez de por omisión.
--
-- ⚠️ Añadir un parámetro NO reemplaza la función: crea una SOBRECARGA. La de 5
-- argumentos se queda VIVA E INTACTA hasta que el bundle nuevo esté desplegado
-- —si no, el bundle de hoy, que llama con cinco, se quedaría sin función entre
-- esta migración y el despliegue— y se retira en una migración aparte
-- (20260731_drop_save_saga_sequence_v5.sql), después.
create or replace function public.save_saga_sequence(
  p_saga_id uuid,
  p_entries jsonb,
  p_blocks  jsonb,
  p_removed jsonb,
  p_windows jsonb,
  p_window_subjects jsonb
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

  -- ALCANCE. Esta pantalla solo puede escribir o borrar ventanas de SU saga o
  -- de sus hijas DIRECTAS: es lo único que su editor enseña (la propia
  -- secuencia, y el cajón bajo cada bloque). Sin esta guarda, un payload
  -- manipulado podría borrar las ventanas de cualquier saga de la base con solo
  -- nombrarla en `p_window_subjects`.
  if exists (
    select 1
      from (
        select w as x from jsonb_array_elements(coalesce(p_windows, '[]'::jsonb)) as w
        union all
        select s as x from jsonb_array_elements(coalesce(p_window_subjects, '[]'::jsonb)) as s
      ) t
     where (t.x->>'saga_id')::uuid <> p_saga_id
       and not exists (
         select 1 from sagas c
          where c.id = (t.x->>'saga_id')::uuid and c.parent_saga_id = p_saga_id
       )
  ) then
    raise exception 'window saga out of scope';
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

  -- Bajas explícitas de obras, y SOLO estas.
  delete from saga_items si
   using jsonb_array_elements(coalesce(p_removed, '[]'::jsonb)) as r
   where si.saga_id = p_saga_id
     and si.item_type = (r->>'item_type')::public.item_type
     and si.item_id = (r->>'item_id')::uuid;

  -- Bajas explícitas de VENTANAS: exactamente los sujetos de los que esta
  -- pantalla se hace responsable. Borrar primero y reinsertar es lo que
  -- garantiza la coherencia que ningún CHECK entre tablas puede dar (una
  -- entrada que deja de ser `libre` viaja como sujeto pero no como ventana), y
  -- borrar SOLO estos es lo que impide que el padre se lleve por delante lo que
  -- la hija acaba de guardar.
  --
  -- ⚠️ `IS NOT DISTINCT FROM`, no `=`: el sujeto es obra XOR bloque, así que en
  -- cada fila hay columnas a NULL. Un `=` contra NULL da NULL, y un DELETE cuyo
  -- WHERE da NULL no borra nada — el fallo sería silencioso y solo se vería
  -- como «la ventana que quité sigue ahí».
  delete from saga_placement_windows w
   using jsonb_array_elements(coalesce(p_window_subjects, '[]'::jsonb)) as s
   where w.saga_id = (s->>'saga_id')::uuid
     and w.item_type is not distinct from (s->>'item_type')::public.item_type
     and w.item_id is not distinct from (s->>'item_id')::uuid
     and w.child_saga_id is not distinct from (s->>'child_saga_id')::uuid;

  -- El `saga_id` sale de CADA FILA, no de p_saga_id: la ventana de una obra de
  -- una hija vive bajo la hija.
  insert into saga_placement_windows (
    saga_id, item_type, item_id, child_saga_id,
    after_item_type, after_item_id, after_child_saga_id,
    before_item_type, before_item_id, before_child_saga_id
  )
  select
    (w->>'saga_id')::uuid,
    (w->>'item_type')::public.item_type, (w->>'item_id')::uuid, (w->>'child_saga_id')::uuid,
    (w->>'after_item_type')::public.item_type, (w->>'after_item_id')::uuid, (w->>'after_child_saga_id')::uuid,
    (w->>'before_item_type')::public.item_type, (w->>'before_item_id')::uuid, (w->>'before_child_saga_id')::uuid
  from jsonb_array_elements(coalesce(p_windows, '[]'::jsonb)) as w;
end;
$$;

revoke execute on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

comment on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Guardado atómico de la secuencia de una saga: obras propias, colocación de hijas directas, bajas explícitas y ventanas de colocación. Collaborator+. NINGUNA baja es por omisión: ni la de saga_items ni la de saga_placement_windows, que desde la fase 4 se borra por lista explícita de sujetos porque hay dos pantallas escribiendo la misma fila.';
