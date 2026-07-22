-- Issue #169: cierra el INSERT de `saga_items`, el último resquicio de escritura
-- abierto a cualquier `authenticated`. SELECT es público a propósito; UPDATE
-- (20260719_saga_items_update_policy.sql) y DELETE (rbac_curation_hardening, §4)
-- ya exigían collaborator+.
--
-- OJO: el INSERT abierto NO era un descuido. La migración que cerró el DELETE lo
-- dice expresamente: «El INSERT sigue abierto a authenticated: lo necesita el
-- cache-as-you-go (src/lib/sagas/persist-collection.ts)». El enriquecimiento
-- automático de colecciones TMDB escribe en saga_items con el cliente del
-- usuario y se dispara al abrir una ficha (persist-collection.ts y get-saga.ts).
--
-- Lo que queda abierto con INSERT y por qué merece cerrarse igualmente: un
-- autenticado puede meter cualquier obra en cualquier saga curada, y puede
-- reclamar `is_primary` de un ítem que aún no tenga saga principal (índice
-- parcial saga_items_primary_idx). No puede modificar ni borrar filas
-- existentes.
--
-- Solución: el camino automático pasa por dos funciones SECURITY DEFINER
-- ACOTADAS a sagas TMDB (patrón save_saga_graph), que es lo que elimina la razón
-- por la que el INSERT seguía abierto. Un autenticado sigue pudiendo poblar
-- colecciones TMDB, pero ya no puede tocar a mano el catálogo curado.
--
-- Efecto colateral bueno: la corrección de posiciones de una colección TMDB
-- (get-saga.ts) hacía un UPDATE que para un usuario normal fallaba en silencio
-- desde que se cerró el UPDATE. Ahora funciona para cualquiera.

-- ── Alta de una película en su colección TMDB ────────────────────────────────
-- is_primary solo si el ítem aún no tiene saga primary (índice parcial
-- saga_items_primary_idx). Idempotente por saga_items_saga_item_key.
create or replace function public.link_tmdb_saga_item(
  p_saga_id uuid,
  p_item_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_primary boolean;
begin
  -- Acotado a sagas TMDB: esta función NO es una puerta trasera para curar
  -- sagas manuales, que siguen exigiendo collaborator+ vía RLS.
  if not exists (
    select 1 from sagas
    where id = p_saga_id and source = 'tmdb' and tmdb_collection_id is not null
  ) then
    raise exception 'saga % is not a tmdb collection', p_saga_id;
  end if;

  select exists (
    select 1 from saga_items
    where item_type = 'movie' and item_id = p_item_id and is_primary
  ) into v_has_primary;

  insert into saga_items (saga_id, item_type, item_id, is_primary)
  values (p_saga_id, 'movie', p_item_id, not v_has_primary)
  on conflict (saga_id, item_type, item_id) do nothing;
exception
  -- Carrera contra otra alta que ganó la primary (saga_items_primary_idx):
  -- reintentar sin primary, igual que hacía el TS.
  when unique_violation then
    insert into saga_items (saga_id, item_type, item_id, is_primary)
    values (p_saga_id, 'movie', p_item_id, false)
    on conflict (saga_id, item_type, item_id) do nothing;
end;
$$;

-- ── Rellenado perezoso del resto de la colección ─────────────────────────────
-- Diff no destructivo (spec §1.2): inserta lo que falte y corrige posiciones,
-- sin tocar miembros manuales y sin borrar nada. is_primary=false siempre: la
-- primary la fija el alta con contexto, no el rellenado.
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

  insert into saga_items (saga_id, item_type, item_id, position, is_primary)
  select p_saga_id, 'movie', (i->>'item_id')::uuid, (i->>'position')::integer, false
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i
  on conflict (saga_id, item_type, item_id)
    do update set position = excluded.position;
end;
$$;

revoke execute on function public.link_tmdb_saga_item(uuid, uuid) from public, anon;
revoke execute on function public.sync_tmdb_saga_items(uuid, jsonb) from public, anon;
grant execute on function public.link_tmdb_saga_item(uuid, uuid) to authenticated;
grant execute on function public.sync_tmdb_saga_items(uuid, jsonb) to authenticated;

-- ── Cierre de la RLS ─────────────────────────────────────────────────────────
-- Solo el INSERT: DELETE y UPDATE ya estaban cerrados (verificado contra
-- pg_policies en dev y prod el 2026-07-22, no contra el ledger de migraciones).
drop policy "saga items insertable" on public.saga_items;

create policy "saga items insertable by collaborators" on public.saga_items
  for insert to authenticated
  with check (public.has_min_role('collaborator'));
