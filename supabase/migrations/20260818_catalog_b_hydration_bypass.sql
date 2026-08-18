-- #674 parte B: la hidratación automática necesita escribir campos de ficha
-- (title/director/synopsis/…) SIN ser collaborator — es rellenado desde el
-- proveedor oficial, no curación manual. Pero enforce_catalog_edit_collaborator_only
-- (20260714_editions_h) bloquea a cualquier `user` con `is distinct from`, así que
-- hoy la hidratación de un usuario normal FALLA (su error se traga en console.error).
-- En dev no se ve porque quien prueba es admin (#674 lo destapó verificando en dev).
--
-- Se añade una excepción por FLAG DE SESIÓN: las RPC SECURITY DEFINER de
-- hidratación activan `app.hydrating='on'` (set_config local, dura solo su
-- transacción) antes del UPDATE. Un usuario vía REST directo NO puede activar ese
-- GUC junto a su UPDATE, así que la curación manual sigue restringida a
-- collaborator+. Mismo idioma que el bypass de auth.uid() null ya existente.
create or replace function public.enforce_catalog_edit_collaborator_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Hidratación server-side (RPC definer con el flag): rellena huecos desde el
  -- proveedor, no es curación. Se deja pasar; la RPC es fill-only y no pisa nada.
  if current_setting('app.hydrating', true) = 'on' then
    return new;
  end if;

  if auth.uid() is null or public.has_min_role('collaborator') then
    return new;
  end if;

  if TG_TABLE_NAME = 'books' then
    if new.title is distinct from old.title
      or new.author is distinct from old.author
      or new.synopsis is distinct from old.synopsis
      or new.genres is distinct from old.genres
      or new.published_year is distinct from old.published_year
      or new.cover_url is distinct from old.cover_url
    then
      raise exception 'catalog ficha fields can only be edited by collaborators';
    end if;
  elsif TG_TABLE_NAME = 'movies' then
    if new.title is distinct from old.title
      or new.director is distinct from old.director
      or new.synopsis is distinct from old.synopsis
      or new.genres is distinct from old.genres
      or new.release_year is distinct from old.release_year
      or new.cover_url is distinct from old.cover_url
    then
      raise exception 'catalog ficha fields can only be edited by collaborators';
    end if;
  elsif TG_TABLE_NAME = 'series' then
    if new.title is distinct from old.title
      or new.creator is distinct from old.creator
      or new.synopsis is distinct from old.synopsis
      or new.genres is distinct from old.genres
      or new.release_year is distinct from old.release_year
      or new.cover_url is distinct from old.cover_url
    then
      raise exception 'catalog ficha fields can only be edited by collaborators';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_catalog_edit_collaborator_only() is
  'BEFORE UPDATE en books/movies/series: título/autoría/sinopsis/géneros/año/portada solo los cambia collaborator+ — SALVO la hidratación server-side, que activa el flag de sesión app.hydrating (RPC definer fill-only, #674). Las columnas de sincronización siguen abiertas a cualquier authenticated. Ver 20260714_editions_h y 20260818_catalog_b_hydration_bypass.';
