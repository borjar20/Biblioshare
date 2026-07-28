-- Séptimo argumento de `save_saga_sequence`: los metadatos de los huecos en
-- tándem (spec 2026-07-28, fase 2).
--
-- ⚠️ SOBRECARGA, no reemplazo. `create or replace function` con otra lista de
-- parámetros NO sustituye a la existente: crea una función nueva. La de SEIS
-- argumentos sigue viva —reescrita aquí como envoltorio— hasta que el bundle
-- que llama con siete esté desplegado; entonces, y solo entonces, se borra
-- (20260802_drop_save_saga_sequence_v6.sql). Al revés, el bundle desplegado se
-- queda sin función en el primer guardado. Ya se pagó en las fases 2b y 4.
create or replace function public.save_saga_sequence(
  p_saga_id uuid,
  p_entries jsonb,
  p_blocks jsonb,
  p_removed jsonb,
  p_windows jsonb,
  p_window_subjects jsonb,
  p_tandems jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.has_min_role('collaborator') then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from sagas where id = p_saga_id) then
    raise exception 'saga % not found', p_saga_id;
  end if;

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

  insert into saga_items (saga_id, item_type, item_id, position, placement, optional, role, is_primary)
  select
    p_saga_id,
    (e->>'item_type')::public.item_type,
    (e->>'item_id')::uuid,
    (e->>'position')::integer,
    (e->>'placement')::public.saga_placement,
    coalesce((e->>'optional')::boolean, false),
    (e->>'role')::public.saga_item_role,
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

  update sagas s
     set position_in_parent  = (b->>'position_in_parent')::integer,
         placement_in_parent = (b->>'placement_in_parent')::public.saga_placement,
         optional_in_parent  = coalesce((b->>'optional_in_parent')::boolean, false)
    from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) as b
   where s.id = (b->>'child_saga_id')::uuid
     and s.parent_saga_id = p_saga_id;

  delete from saga_items si
   using jsonb_array_elements(coalesce(p_removed, '[]'::jsonb)) as r
   where si.saga_id = p_saga_id
     and si.item_type = (r->>'item_type')::public.item_type
     and si.item_id = (r->>'item_id')::uuid;

  delete from saga_placement_windows w
   using jsonb_array_elements(coalesce(p_window_subjects, '[]'::jsonb)) as s
   where w.saga_id = (s->>'saga_id')::uuid
     and w.item_type is not distinct from (s->>'item_type')::public.item_type
     and w.item_id is not distinct from (s->>'item_id')::uuid
     and w.child_saga_id is not distinct from (s->>'child_saga_id')::uuid;

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

  -- Metadatos de los huecos en tándem. Reemplazo por saga: un hueco que deja de
  -- ser tándem —o que se renumera— pierde su fila en la MISMA transacción en la
  -- que se reescribe la secuencia.
  --
  -- Por qué aquí SÍ vale el reemplazo por saga y en las ventanas no: las
  -- ventanas necesitaron sujetos explícitos (`p_window_subjects`) desde la
  -- fase 4 porque DOS pantallas escriben la misma fila —el editor del padre
  -- cura la ventana de una obra de su hija—. Un hueco, en cambio, pertenece a
  -- la secuencia de UNA saga, y solo el editor de esa saga lo escribe: el
  -- padre no toca la secuencia de la hija (#187 sigue cerrada). Con un único
  -- escritor por `saga_id`, borrar y reinsertar es exactamente la baja
  -- explícita que se pide, sin inventar un octavo argumento.
  delete from saga_tandems where saga_id = p_saga_id;

  insert into saga_tandems (saga_id, position, modo, nota)
  select
    p_saga_id,
    (t->>'position')::integer,
    (t->>'modo')::public.saga_tandem_mode,
    nullif(btrim(coalesce(t->>'nota', '')), '')
  from jsonb_array_elements(coalesce(p_tandems, '[]'::jsonb)) as t
  -- Una fila que no dice nada la rechazaría `saga_tandems_says_something` y
  -- abortaría la transacción ENTERA: un control que el curador dejó vacío no
  -- puede tumbar el guardado de toda la secuencia. Se filtra aquí.
  where (t->>'modo') is not null
     or nullif(btrim(coalesce(t->>'nota', '')), '') is not null;
end;
$function$;

-- La de SEIS pasa a delegar con `p_tandems = '[]'`. Mientras viva, el riesgo
-- conocido y aceptado es el mismo que documentó la 2b: un guardado desde el
-- bundle VIEJO manda '[]' sin saberlo y borra los metadatos que el editor nuevo
-- acabara de guardar. Ventana de minutos entre migración y despliegue, y con un
-- único tándem en toda la producción.
create or replace function public.save_saga_sequence(
  p_saga_id uuid,
  p_entries jsonb,
  p_blocks jsonb,
  p_removed jsonb,
  p_windows jsonb,
  p_window_subjects jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.save_saga_sequence(
    p_saga_id, p_entries, p_blocks, p_removed, p_windows, p_window_subjects, '[]'::jsonb
  );
end;
$function$;
