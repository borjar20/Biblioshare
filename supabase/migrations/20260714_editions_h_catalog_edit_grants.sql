-- Editor de ficha oficial (Tarea 9): colaborador+ puede corregir título,
-- autoría/dirección/creación, sinopsis, géneros, año y portada de books/
-- movies/series. Hoy `authenticated` NO puede escribir ninguno de esos
-- campos:
--
--   - books: solo tiene concedido `openlibrary_work_key` / `editions_synced_at`
--     (20260714_editions_e_sync_rls.sql, que además cerró un grant heredado
--     mucho más amplio que nunca debió existir — ver su cabecera). Esta
--     migración debe aplicarse DESPUÉS de esa: aquí solo se AÑADEN columnas al
--     grant ya acotado, nunca se reabre desde cero.
--   - movies / series: solo tienen concedido el backfill de tamaño
--     (duration_minutes / total_seasons+total_episodes — verificado en vivo
--     con information_schema.role_column_grants), que sigue intacto:
--     cualquier autenticado necesita seguir pudiendo rellenarlo
--     (backfillQueueSizes, src/lib/queue/backfill-queue-sizes.ts, corre para
--     cualquier visitante de la cola, no solo colaboradores).
--
-- OJO — por qué esto NO es "grant ampliado + policy de colaborador" sin más:
-- una policy RLS filtra FILAS, no columnas. Los tres UPDATE ya tienen una
-- policy permisiva `using(true)` (para que cualquier autenticado pueda seguir
-- escribiendo sus columnas de sincronización/backfill de siempre); si el
-- grant de columna se ampliara con título/sinopsis/géneros/etc bajo ESA misma
-- policy, cualquier autenticado (no solo colaborador+) podría reescribirlos
-- vía REST directo, porque policies permisivas se combinan con OR y ninguna
-- sabe qué columnas trae el UPDATE. Por eso la restricción de rol para estos
-- campos va en un TRIGGER (que sí ve OLD y NEW por columna), exactamente el
-- mismo patrón que enforce_people_enrich_only en
-- 20260715_enrich_only_and_hardening.sql.

-- ── 1. Grant ampliado (aditivo: no quita nada de lo que ya había) ───────────
grant update (title, author, synopsis, genres, published_year, cover_url)
  on public.books to authenticated;

grant update (title, director, synopsis, genres, release_year, cover_url)
  on public.movies to authenticated;

grant update (title, creator, synopsis, genres, release_year, cover_url)
  on public.series to authenticated;

-- ── 2. Trigger: estos campos concretos solo los cambia colaborador+ ─────────
-- auth.uid() IS NULL => contexto sin usuario (service_role / SQL del owner,
-- que ya bypasan RLS) — se deja pasar, mismo idioma que
-- enforce_people_enrich_only.
create or replace function public.enforce_catalog_edit_collaborator_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
  'BEFORE UPDATE en books/movies/series: título/autoría/sinopsis/géneros/año/portada solo los cambia collaborator+. Las columnas de sincronización (openlibrary_work_key, editions_synced_at, duration_minutes, total_seasons, total_episodes, episode_runtime_minutes) no se tocan aquí y siguen abiertas a cualquier authenticated (Tarea 6 / backfillQueueSizes). Ver cabecera de 20260714_editions_h_catalog_edit_grants.sql.';

drop trigger if exists trg_enforce_books_edit_collaborator_only on public.books;
create trigger trg_enforce_books_edit_collaborator_only
  before update on public.books
  for each row execute function public.enforce_catalog_edit_collaborator_only();

drop trigger if exists trg_enforce_movies_edit_collaborator_only on public.movies;
create trigger trg_enforce_movies_edit_collaborator_only
  before update on public.movies
  for each row execute function public.enforce_catalog_edit_collaborator_only();

drop trigger if exists trg_enforce_series_edit_collaborator_only on public.series;
create trigger trg_enforce_series_edit_collaborator_only
  before update on public.series
  for each row execute function public.enforce_catalog_edit_collaborator_only();

-- El trigger lo dispara Postgres, no es una RPC: mismo revoke de higiene que
-- el resto de funciones de trigger del proyecto.
revoke execute on function public.enforce_catalog_edit_collaborator_only() from public, anon, authenticated;
