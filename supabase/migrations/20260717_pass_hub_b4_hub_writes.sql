-- Hueco del plan detectado en la Tarea 5: el ejecutor de transiciones
-- (applyTransition) inserta y actualiza pases-hub, pero la BD todavía exigía
-- el mundo viejo por tres sitios. Sin esto, TODA alta y TODO cambio de
-- estado fallan en runtime (compilan bien: el fallo es NOT NULL + grants).
--
-- 1) library_entry_id era NOT NULL: un pase del hub nace SIN entrada de
--    biblioteca (el alta ya no escribe library_entries). Nullable hasta que
--    la migración C (Task 10) elimine la columna. El FK compuesto
--    (library_entry_id, user_id) es MATCH SIMPLE: con la columna a null no
--    se evalúa, así que los pases nuevos no chocan con él.
alter table public.diary_entries
  alter column library_entry_id drop not null;

-- 2) Grants por columna (20260714_passes_grants.sql hizo revoke all + grant
--    fino): las columnas del hub (tanda A) solo recibieron SELECT. El
--    ejecutor escribe estado, actividad, cursor, cola y fijado; la cola y el
--    fijado también los escriben moveEntryToQueue y favorite-actions.
grant insert (item_type, item_id, status, is_active, position,
              queue_id, queue_order, pinned_order)
  on public.diary_entries to authenticated;
grant update (status, is_active, position, queue_id, queue_order, pinned_order)
  on public.diary_entries to authenticated;

-- 3) check_pass_edition resolvía la obra vía library_entries usando
--    new.library_entry_id — con pases sin entrada, v_item_type quedaba null
--    y el trigger rechazaba CUALQUIER edición ("una serie no tiene
--    ediciones"). La obra ya vive en el propio pase (item_type/item_id NOT
--    NULL desde la tanda A): se lee de ahí y vale para viejos y nuevos.
create or replace function public.check_pass_edition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.edition_id is null then
    return new;
  end if;

  if new.item_type = 'book' then
    if not exists (
      select 1 from public.book_editions be
      where be.id = new.edition_id and be.book_id = new.item_id
    ) then
      raise exception 'la edicion % no es de este libro', new.edition_id;
    end if;
  elsif new.item_type = 'movie' then
    if not exists (
      select 1 from public.movie_versions mv
      where mv.id = new.edition_id and mv.movie_id = new.item_id
    ) then
      raise exception 'la version % no es de esta pelicula', new.edition_id;
    end if;
  else
    -- Las series no tienen ediciones: su unidad de progreso son los episodios.
    raise exception 'una serie no tiene ediciones';
  end if;

  return new;
end;
$$;
