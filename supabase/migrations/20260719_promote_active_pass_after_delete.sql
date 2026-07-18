-- Al borrar el pase ACTIVO de una obra con varios pases, la obra desaparecía
-- por completo de la biblioteca en vez de volver a activar el pase anterior.
--
-- La causa: solo un pase puede llevar is_active=true (índice parcial
-- passes_one_active) y toda la lectura de biblioteca filtra por is_active=true
-- (getLibraryItems, get-passes.getActivePass, la vista pass_reviews del hub…).
-- deletePass borra la fila sin más, así que una obra con 3 relecturas de la que
-- borras el pase de arriba se queda con 2 pases pero NINGUNO activo: invisible.
--
-- Mismo idioma que promote_primary_edition_after_delete (20260714_editions_*):
-- tras borrar la fila que ERA la activa, se promueve otra automáticamente —
-- el pase anterior, el más reciente que quede (finished_on desc nulls first,
-- created_at desc como desempate: el mismo orden con el que getPasses pinta el
-- diario, así el que sube a activo es justo el que el usuario ve arriba tras el
-- borrado). Si no queda ningún pase, no se hace nada: la obra sale de la
-- biblioteca, que es el comportamiento correcto (sin pases = no está trackeada).
--
-- AFTER DELETE (no BEFORE): la promoción consulta los pases que SOBREVIVEN, y
-- solo con la fila ya borrada el índice passes_one_active deja hueco para
-- activar otra sin chocar (23505). Un borrado en bloque (removeFromLibrary tira
-- todos los pases de la obra en un solo DELETE) es inofensivo: el subselect no
-- encuentra superviviente y no promueve nada.
create or replace function public.promote_active_pass_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo hay algo que promover si lo que se borró ERA el pase activo: si era un
  -- pase histórico archivado, el activo de siempre sigue intacto.
  if not old.is_active then
    return old;
  end if;

  update public.passes
     set is_active = true
   where id = (
     select id
       from public.passes
      where user_id = old.user_id
        and item_type = old.item_type
        and item_id = old.item_id
      order by finished_on desc nulls first, created_at desc
      limit 1
   );

  return old;
end;
$$;

drop trigger if exists passes_promote_active_after_delete on public.passes;
create trigger passes_promote_active_after_delete
  after delete on public.passes
  for each row execute function public.promote_active_pass_after_delete();

-- Mismo idioma de higiene que promote_primary_edition_after_delete: lo dispara
-- Postgres, no es una RPC que la app pueda invocar.
revoke execute on function public.promote_active_pass_after_delete() from public, anon, authenticated;
