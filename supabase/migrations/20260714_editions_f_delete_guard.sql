-- No se puede borrar una edición que alguien está leyendo.
--
-- `diary_entries.edition_id` es polimórfico (apunta a book_editions O a
-- movie_versions según el tipo del ítem), así que NO admite una clave ajena. La
-- protección va en un trigger, que además vale para cualquier vía de borrado: la
-- de hoy y las que vengan.
--
-- Y se IMPIDE, no se reasigna en silencio a la edición primaria: reasignar
-- falsearía el progreso de alguien que no ha pedido nada ("voy por la página 240
-- de 662" se convertiría en "de 880" sin que su dueño se entere). Que el editor
-- lo explique y que el colaborador decida.
create or replace function public.block_edition_delete_if_used()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pases integer;
begin
  select count(*) into v_pases
  from public.diary_entries d
  where d.edition_id = old.id;

  if v_pases > 0 then
    raise exception 'edition_in_use'
      using hint = format('%s pases usan esta edicion', v_pases);
  end if;

  return old;
end;
$$;

drop trigger if exists book_editions_block_delete on public.book_editions;
create trigger book_editions_block_delete
  before delete on public.book_editions
  for each row execute function public.block_edition_delete_if_used();

drop trigger if exists movie_versions_block_delete on public.movie_versions;
create trigger movie_versions_block_delete
  before delete on public.movie_versions
  for each row execute function public.block_edition_delete_if_used();

-- El trigger lo dispara Postgres, no lo invoca nadie a mano: conceder EXECUTE
-- solo sería superficie de ataque y ruido en los advisors.
revoke execute on function public.block_edition_delete_if_used() from public, anon, authenticated;

-- Borrar una edición del catálogo es curación: colaborador+, igual que crearla.
grant delete on public.book_editions to authenticated;
grant delete on public.movie_versions to authenticated;

create policy "book_editions deletable by collaborators"
  on public.book_editions for delete to authenticated
  using (public.current_user_role() in ('collaborator', 'admin'));

create policy "movie_versions deletable by collaborators"
  on public.movie_versions for delete to authenticated
  using (public.current_user_role() in ('collaborator', 'admin'));

-- Hallazgo 2 (revisión final 2026-07-14): borrar la primaria no debe dejar la
-- obra sin denominador. El trigger de arriba (block_edition_delete_if_used)
-- solo bloquea el borrado si algún PASE referencia la edición por id — pero
-- los pases que contestaron "No lo sé" tienen edition_id = NULL y miden su
-- progreso contra la PRIMARIA (ver openPassEdition en
-- src/components/detail/log-panel.tsx / primaryEdition en
-- src/lib/editions/edition-label.ts). Nada se opone entonces a borrar la
-- primaria, y esos lectores pierden de golpe el "de 662 páginas" y se quedan
-- con "voy por la página 240" a secas.
--
-- Por eso, tras borrar una edición que ERA la primaria, se promueve otra
-- automáticamente: la más reciente que quede (año de publicación/estreno
-- desc nulls last, created_at desc como desempate — mismo criterio que
-- "más reciente" en el resto del editor). Si no queda ninguna edición, no se
-- hace nada: el progreso cae al espejo de books.total_pages /
-- movies.duration_minutes, que es el comportamiento de hoy y está bien (no
-- hay denominador mejor que rescatar si la obra se queda sin ediciones).
create or replace function public.promote_primary_edition_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo hay algo que arreglar si lo que se borró ERA la primaria: si no lo
  -- era, la primaria de siempre sigue intacta y no hay nada que promover.
  if not old.is_primary then
    return old;
  end if;

  if TG_TABLE_NAME = 'book_editions' then
    update public.book_editions
       set is_primary = true
     where id = (
       select id
         from public.book_editions
        where book_id = old.book_id
        order by published_year desc nulls last, created_at desc
        limit 1
     );
  elsif TG_TABLE_NAME = 'movie_versions' then
    update public.movie_versions
       set is_primary = true
     where id = (
       select id
         from public.movie_versions
        where movie_id = old.movie_id
        order by release_year desc nulls last, created_at desc
        limit 1
     );
  end if;

  return old;
end;
$$;

drop trigger if exists book_editions_promote_primary_after_delete on public.book_editions;
create trigger book_editions_promote_primary_after_delete
  after delete on public.book_editions
  for each row execute function public.promote_primary_edition_after_delete();

drop trigger if exists movie_versions_promote_primary_after_delete on public.movie_versions;
create trigger movie_versions_promote_primary_after_delete
  after delete on public.movie_versions
  for each row execute function public.promote_primary_edition_after_delete();

-- Mismo idioma de higiene que block_edition_delete_if_used: lo dispara
-- Postgres, no es una RPC.
revoke execute on function public.promote_primary_edition_after_delete() from public, anon, authenticated;
