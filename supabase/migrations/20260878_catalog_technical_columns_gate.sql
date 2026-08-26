-- Auditoría 2026-08, hallazgo S2-14 — el trigger de curación dejaba fuera las
-- columnas TÉCNICAS del catálogo.
--
-- `enforce_catalog_edit_collaborator_only` protege los campos de FICHA (título,
-- autor/director/creador, sinopsis, géneros, año, portada): un `user` no los
-- puede reescribir. Pero el grant por columna a `authenticated` incluye además
-- tres columnas de fontanería que el gate no miraba:
--
--   books   · openlibrary_work_key, hydrated_at, editions_synced_at
--   movies  · hydrated_at
--   series  · hydrated_at
--
-- Con una sesión normal y un PATCH a PostgREST se podía:
--
--   1. Repuntar un libro a OTRA obra de Open Library
--      (`openlibrary_work_key='/works/OTRA'`): la siguiente sincronización trae
--      ediciones y portada equivocadas, y las ve TODO el mundo (catálogo global).
--   2. Poner `hydrated_at`/`editions_synced_at` a null en bucle: cada visita a la
--      ficha vuelve a preguntarle a Open Library / TMDB. Es la amplificación de
--      llamadas externas de S2-11 disparada desde una columna.
--
-- El arreglo NO es «gatear estas columnas a colaborador» ni «revocar el UPDATE»,
-- que es lo que proponía el informe: las escribe la hidratación perezosa con el
-- cliente de la petición de un usuario cualquiera, así que cerrarlas a secas
-- repetiría el modo de fallo de #699 (la hidratación muere en silencio con 42501
-- y las fichas se quedan sin sinopsis en producción).
--
-- Lo que se gatea es la TRANSICIÓN, que es donde está el abuso. Un no-colaborador
-- solo puede rellenar el hueco —null → valor—, que es exactamente lo que hacen
-- los tres únicos escritores legítimos:
--
--   src/lib/catalog/hydrate-book.ts:55   openlibrary_work_key, solo si venía null
--   src/lib/catalog/hydrate-book.ts:111  hydrated_at, solo si venía null
--   src/lib/catalog/hydrate-screen.ts:84 hydrated_at, solo si venía null
--   src/lib/editions/sync-editions.ts:19 editions_synced_at, solo si venía null
--
-- Reescribir o borrar un valor ya puesto queda para colaborador+ (es lo que hace
-- `resyncEditions`, ya gateado en TS) y para las RPC de hidratación, que entran
-- por la puerta de `app.hydrating` de arriba.
--
-- Carrera conocida y aceptada: dos pestañas abriendo a la vez la misma ficha
-- recién creada: la segunda encuentra la columna ya escrita y su UPDATE muere con
-- esta excepción. Los cuatro escritores ignoran el error a propósito (son
-- best-effort y ya lo ignoraban antes por otras razones), así que lo único que se
-- pierde es un atajo que la primera pestaña ya había ganado.

create or replace function public.enforce_catalog_edit_collaborator_only()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
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

    if (old.openlibrary_work_key is not null
         and new.openlibrary_work_key is distinct from old.openlibrary_work_key)
      or (old.hydrated_at is not null
           and new.hydrated_at is distinct from old.hydrated_at)
      or (old.editions_synced_at is not null
           and new.editions_synced_at is distinct from old.editions_synced_at)
    then
      raise exception 'catalog technical fields can only be re-set by collaborators';
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

    if old.hydrated_at is not null
      and new.hydrated_at is distinct from old.hydrated_at
    then
      raise exception 'catalog technical fields can only be re-set by collaborators';
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

    if old.hydrated_at is not null
      and new.hydrated_at is distinct from old.hydrated_at
    then
      raise exception 'catalog technical fields can only be re-set by collaborators';
    end if;
  end if;

  return new;
end;
$function$;
