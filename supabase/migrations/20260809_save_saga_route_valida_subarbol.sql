-- #176 (2): `save_saga_route` se fiaba de que el cliente dijera la verdad.
--
-- Hasta aquí, la única comprobación de "este bloque apunta a una subsaga de
-- ESTA saga" vivía en `validateRouteDraft`, y el conjunto contra el que
-- comparaba (`descendantIds`) llegaba desde el cliente por el server action.
-- Es decir: la validación se hacía contra un dato que el atacante controla.
-- Fabricando `descendantIds` se colaba un `child_saga_id` de una saga ajena.
--
-- El techo del abuso era bajo (`resolveRoute` descarta al leer cualquier
-- `child_saga_id` que no esté en el árbol real, así que quedaba una fila
-- inerte), pero la frontera estaba en el sitio equivocado. Aquí el subárbol se
-- calcula EN SERVIDOR a partir de `saga_routes.saga_id` -- la saga real de la
-- ruta, no la que dijo el cliente -- y `parent_saga_id`.
--
-- `validateRouteDraft` sigue existiendo y sigue haciendo la comprobación
-- optimista: da mensajes concretos en el editor sin roundtrip. Lo que cambia es
-- que ya no es la ÚNICA.
create or replace function public.save_saga_route(
  p_route_id uuid,
  p_entries jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_saga_id uuid;
  v_bloques_ajenos int;
  v_items_ajenos int;
begin
  if not public.has_min_role('collaborator') then
    raise exception 'forbidden';
  end if;

  -- La saga de la ruta se LEE, no se recibe: es la que gobierna qué puede
  -- contener el itinerario.
  select saga_id into v_saga_id from public.saga_routes where id = p_route_id;
  if v_saga_id is null then
    raise exception 'route % not found', p_route_id;
  end if;

  delete from public.saga_route_entries where route_id = p_route_id;

  insert into public.saga_route_entries (route_id, position, item_type, item_id, child_saga_id, note)
  select
    p_route_id,
    (e->>'position')::integer,
    (e->>'item_type')::public.item_type,
    (e->>'item_id')::uuid,
    (e->>'child_saga_id')::uuid,
    nullif(e->>'note', '')
  from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as e;

  -- Se valida DESPUÉS de insertar, a propósito: así se comprueba contra las
  -- columnas ya tipadas en vez de volver a castear el jsonb, y la función es
  -- una sola transacción -- el `raise` de abajo revierte el delete y el insert
  -- enteros. El full-replace sigue siendo atómico.
  with recursive subarbol as (
    select id from public.sagas where id = v_saga_id
    union all
    select s.id from public.sagas s join subarbol d on s.parent_saga_id = d.id
  )
  select
    (select count(*)
       from public.saga_route_entries e
      where e.route_id = p_route_id
        and e.child_saga_id is not null
        and (e.child_saga_id = v_saga_id
             or not exists (select 1 from subarbol d where d.id = e.child_saga_id))),
    (select count(*)
       from public.saga_route_entries e
      where e.route_id = p_route_id
        and e.item_id is not null
        and not exists (
          select 1
            from public.saga_items si
            join subarbol d on d.id = si.saga_id
           where si.item_type = e.item_type and si.item_id = e.item_id))
  into v_bloques_ajenos, v_items_ajenos;

  -- Un bloque a la PROPIA saga también se rechaza: un itinerario que se
  -- contiene a sí mismo no tiene lectura posible.
  if v_bloques_ajenos > 0 then
    raise exception 'foreign block';
  end if;
  -- Hueco gemelo que la validación de cliente ni siquiera intentaba cubrir: una
  -- obra que no pertenece a ninguna saga del subárbol.
  if v_items_ajenos > 0 then
    raise exception 'foreign item';
  end if;
end;
$$;

revoke execute on function public.save_saga_route(uuid, jsonb) from public, anon;
grant execute on function public.save_saga_route(uuid, jsonb) to authenticated;

comment on function public.save_saga_route(uuid, jsonb) is
  'Full-replace atómico de los pasos de un itinerario. Collaborator+. Valida en servidor que bloques y obras pertenezcan al subárbol de la saga de la ruta (#176).';
