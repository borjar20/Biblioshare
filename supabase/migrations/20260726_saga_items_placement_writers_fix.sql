-- Cierra el escritor de `saga_items` más urgente de los cuatro que el review
-- final de la rama encontró sin respetar `saga_items_placement_position`
-- (20260725_saga_placement.sql): la RPC `sync_tmdb_saga_items`
-- (20260722_saga_items_rls_hardening.sql, YA aplicada en prod desde
-- 2026-07-22, por eso el arreglo va en migración nueva y no editando aquella).
--
-- `sync_tmdb_saga_items` insertaba `position` sin tocar `placement`, así que
-- cualquier alta o corrección de una colección TMDB creaba filas
-- (placement=null, position=N) — el CHECK las rechaza (23514). Es el escritor
-- MÁS urgente de los cuatro: es una función de BD, y la dispara cualquier
-- lector autenticado al abrir la ficha de una saga TMDB
-- (get-saga.ts → populateTmdbCollection), así que rompía en cuanto la
-- migración del CHECK llegara a prod, sin esperar ningún despliegue de
-- código. Reproducido contra dev antes de este fix:
--
--   begin;
--   select public.sync_tmdb_saga_items('<saga tmdb>'::uuid,
--     '[{"item_id":"<item>","position":99}]'::jsonb);
--   rollback;
--   -- ERROR: 23514 saga_items_placement_position
--
-- Arreglo: aplicar aquí mismo el principio que ya rige el backfill de la
-- migración de placement ("tener número ES estar colocado") — toda fila que
-- esta función escribe con `position` no nulo pasa a `placement='fijo'`,
-- tanto en el INSERT inicial como en el UPDATE del `on conflict` (antes solo
-- corregía `position`, dejando cualquier fila previa con placement=null
-- igual de rota si además traía un `position` nuevo).
create or replace function public.sync_tmdb_saga_items(
  p_saga_id uuid,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from sagas
    where id = p_saga_id and source = 'tmdb' and tmdb_collection_id is not null
  ) then
    raise exception 'saga % is not a tmdb collection', p_saga_id;
  end if;

  insert into saga_items (saga_id, item_type, item_id, position, placement, is_primary)
  select
    p_saga_id,
    'movie',
    (i->>'item_id')::uuid,
    (i->>'position')::integer,
    case when (i->>'position') is not null then 'fijo'::saga_placement else null end,
    false
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i
  on conflict (saga_id, item_type, item_id)
    do update set
      position = excluded.position,
      placement = excluded.placement;
end;
$$;

-- `link_tmdb_saga_item` (la hermana señalada para revisar): NO tiene el mismo
-- problema y se deja sin tocar. Nunca escribe `position` (solo
-- `saga_id, item_type, item_id, is_primary`), así que la fila que crea queda
-- con `position` y `placement` en su default `NULL` — la rama ELSE del CHECK
-- (`position is null`) se cumple trivialmente. Verificado leyendo su cuerpo en
-- 20260722_saga_items_rls_hardening.sql: no hay combinación de columnas ahí
-- que pueda producir (placement=null, position≠null).
