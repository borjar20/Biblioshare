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
