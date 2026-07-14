-- Dos agujeros que la revisión encontró en el modelo de pases.
--
-- 1) DOBLE CLIC EN "VISTO" CREABA DOS PASES. El índice único parcial de
--    20260714_passes.sql solo cubre los pases ABIERTOS (where finished_on is
--    null). Pero una película va de Pendiente a Vista de un salto, y ese gesto
--    inserta un pase ya CERRADO, que queda fuera del índice: dos peticiones
--    simultáneas (doble toque en el móvil, dos pestañas, un reintento de red)
--    leían las dos "no hay pase abierto" y las dos insertaban. Resultado: dos
--    pases por un solo gesto, inflando el diario y los retos.
--
--    Se cierra con la regla más simple que lo hace imposible: no puedes
--    terminar el mismo ítem dos veces el mismo día. Releer un libro entero o
--    volver a ver una película y terminarla otra vez el MISMO día no es un caso
--    real; una carrera de doble clic sí lo es, todos los días. El segundo
--    insert choca con el índice y la app ya se traga ese 23505 como éxito.
create unique index diary_entries_one_pass_per_day
  on public.diary_entries (library_entry_id, finished_on)
  where finished_on is not null;

-- 2) UN PASE PODÍA APUNTAR A LA EDICIÓN DE OTRA OBRA. `edition_id` se añadió
--    como uuid suelto, sin clave ajena — y no puede tenerla, porque es
--    polimórfico: apunta a book_editions o a movie_versions según el tipo del
--    ítem. Sin comprobación, un usuario podía colgar de su pase de "Dune" una
--    edición de "El nombre del viento", y entonces su progreso se medía contra
--    las páginas equivocadas.
--
--    Lo cierra un trigger, y no la app, para que valga para cualquier vía de
--    escritura: la de hoy y las que vengan.
create or replace function public.check_pass_edition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_type item_type;
  v_item_id uuid;
begin
  if new.edition_id is null then
    return new;
  end if;

  select le.item_type, le.item_id into v_item_type, v_item_id
  from public.library_entries le
  where le.id = new.library_entry_id;

  if v_item_type = 'book' then
    if not exists (
      select 1 from public.book_editions be
      where be.id = new.edition_id and be.book_id = v_item_id
    ) then
      raise exception 'la edicion % no es de este libro', new.edition_id;
    end if;
  elsif v_item_type = 'movie' then
    if not exists (
      select 1 from public.movie_versions mv
      where mv.id = new.edition_id and mv.movie_id = v_item_id
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

drop trigger if exists diary_entries_check_edition on public.diary_entries;

create trigger diary_entries_check_edition
  before insert or update of edition_id on public.diary_entries
  for each row execute function public.check_pass_edition();
