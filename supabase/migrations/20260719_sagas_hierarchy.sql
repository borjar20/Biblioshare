-- Sagas v2 fase 1 (spec docs/superpowers/specs/2026-07-19-sagas-v2-design.md §1.1):
-- jerarquía de sagas. Una saga puede tener padre (saga "universo", p. ej.
-- UCM → Iron Man). accent_color es el token Paper con el que se pinta como
-- subsaga dentro de la ficha del padre; null = color rotatorio en render.

alter table public.sagas
  add column parent_saga_id uuid references public.sagas(id) on delete set null,
  add column accent_color text check (
    accent_color in ('terracota','verde','teal','ambar','purpura','beige')
  );

create index sagas_parent_idx on public.sagas (parent_saga_id)
  where parent_saga_id is not null;

-- Anti-ciclos: subir por la cadena de ancestros del nuevo padre; si aparece la
-- propia saga, hay ciclo. Cap de profundidad como cinturón extra (la lectura
-- también capa a 4, §1.5). SECURITY INVOKER basta: SELECT sobre sagas es público.
create or replace function public.saga_parent_no_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cur uuid;
  depth integer := 0;
begin
  if new.parent_saga_id is null then
    return new;
  end if;
  if new.parent_saga_id = new.id then
    raise exception 'saga % cannot be its own parent', new.id;
  end if;
  cur := new.parent_saga_id;
  while cur is not null loop
    depth := depth + 1;
    if depth > 10 then
      raise exception 'saga hierarchy deeper than 10 levels';
    end if;
    if cur = new.id then
      raise exception 'saga hierarchy cycle detected for %', new.id;
    end if;
    select parent_saga_id into cur from public.sagas where id = cur;
  end loop;
  return new;
end;
$$;

create trigger sagas_parent_no_cycle
  before insert or update of parent_saga_id on public.sagas
  for each row execute function public.saga_parent_no_cycle();
