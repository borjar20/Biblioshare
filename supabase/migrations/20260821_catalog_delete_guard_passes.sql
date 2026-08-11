-- #272 — `passes` referencia el ítem de forma POLIMÓRFICA (`item_type` + `item_id`),
-- así que no puede haber FK que lo proteja: borrar una fila de `books` dejaba sus
-- pases colgando en silencio. En dev eso vació el pool del sorteo (`getSorteoPool`
-- descarta los pases sin obra en catálogo) y dejó `e2e/happy-path.spec.ts:54` en
-- rojo permanente con un timeout que no mencionaba ni el sorteo ni los pendientes.
--
-- Política elegida: **bloquear el borrado**, no cascadear.
--   · Ningún camino de la aplicación borra catálogo — `books`/`movies`/`series` no
--     tienen NINGUNA policy de DELETE, así que ni `authenticated` ni `anon` pueden.
--     Los huérfanos de dev los creó un borrado privilegiado (service role / consola),
--     que es justo el caso que este trigger intercepta.
--   · Un pase guarda datos del usuario (nota, reseña, fechas). Cascadearlo haría que
--     una limpieza de catálogo destruyese datos ajenos sin que nadie se entere.
--   · Al no existir borrado legítimo hoy, bloquear no rompe nada: obliga a quien
--     limpie catálogo a decidir explícitamente qué hacer con los pases.
--
-- NO se añade validación en el INSERT de `passes` a propósito: el alta de un pase
-- convive con la hidratación perezosa del catálogo y un EXISTS ahí arriesga romper
-- «Seguir» en producción, que es peor que el problema que cierra.

create or replace function private.forbid_delete_with_passes()
returns trigger
language plpgsql
security definer set search_path = ''
as $function$
declare v_count bigint;
begin
  select count(*) into v_count
  from public.passes p
  where p.item_type = tg_argv[0]::public.item_type
    and p.item_id = old.id;

  if v_count > 0 then
    raise exception 'catalog_item_has_passes'
      using errcode = '23503',
            detail = format('%s %s tiene %s pase(s) asociados', tg_argv[0], old.id, v_count),
            hint = 'Borra o reasigna los pases antes de borrar la obra del catalogo (#272)';
  end if;
  return old;
end;
$function$;

revoke execute on function private.forbid_delete_with_passes() from public, anon, authenticated;

drop trigger if exists trg_books_forbid_delete_with_passes on public.books;
drop trigger if exists trg_movies_forbid_delete_with_passes on public.movies;
drop trigger if exists trg_series_forbid_delete_with_passes on public.series;

create trigger trg_books_forbid_delete_with_passes
  before delete on public.books for each row
  execute function private.forbid_delete_with_passes('book');
create trigger trg_movies_forbid_delete_with_passes
  before delete on public.movies for each row
  execute function private.forbid_delete_with_passes('movie');
create trigger trg_series_forbid_delete_with_passes
  before delete on public.series for each row
  execute function private.forbid_delete_with_passes('series');
