-- PELDAÑO 2 de la escalera de hidratación (spec 2026-07-14): la obra se hidrata
-- al ABRIR su ficha, no al buscarla. `hydrated_at` es el guard de ese
-- cache-as-you-go, hermano de `editions_synced_at` (20260714_editions_d_sync):
-- si está puesta, no se vuelve a preguntar a OpenLibrary por esta obra.
--
-- Las filas que ya existen quedan con null a propósito: se rehidratan solas la
-- primera vez que alguien abra su ficha, y así se curan las que se cachearon
-- sucias con el flujo antiguo (sinopsis vacía, géneros de basura, páginas que
-- eran la mediana de todas las ediciones).
alter table public.books
  add column hydrated_at timestamptz;

-- Mismo grant que `editions_synced_at`: la hidratación la dispara la ficha con
-- la sesión del visitante, que no tiene por qué ser colaborador.
grant update (hydrated_at) on public.books to authenticated;

-- La hidratación escribe synopsis/genres/cover_url, que son columnas CURADAS:
-- el trigger de 20260714_editions_h_catalog_edit_grants solo deja cambiarlas a
-- collaborator+. Pero rellenar un hueco no es curar. Esta función es la vía:
-- security definer, y escribe SOLO donde la fila no tenía nada. Así un
-- authenticated cualquiera completa una obra vacía con solo abrir su ficha, sin
-- poder pisar jamás lo que un colaborador escribió a mano.
create or replace function public.hydrate_book(
  p_book_id uuid,
  p_synopsis text default null,
  p_genres text[] default null,
  p_cover_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  update public.books
     set synopsis    = case
                         when (synopsis is null or synopsis = '') and p_synopsis is not null
                           then left(p_synopsis, 5000)
                         else synopsis
                       end,
         genres      = case
                         when (genres is null or cardinality(genres) = 0) and p_genres is not null
                           then p_genres
                         else genres
                       end,
         cover_url   = case
                         when (cover_url is null or cover_url = '') and p_cover_url is not null
                           then p_cover_url
                         else cover_url
                       end,
         hydrated_at = now()
   where id = p_book_id;
end;
$$;

revoke all on function public.hydrate_book(uuid, text, text[], text) from public;
grant execute on function public.hydrate_book(uuid, text, text[], text) to authenticated;

comment on function public.hydrate_book is
  'Cache-as-you-go de la obra al abrir su ficha (spec 2026-07-14): rellena synopsis/genres/cover_url SOLO si estaban vacíos y marca hydrated_at. No pisa nunca lo que un colaborador haya escrito; para eso está el editor de ficha.';

-- La columna legacy: guardaba la work key de OpenLibrary bajo un nombre que
-- mentía (el código de Google Books lleva muerto desde que la búsqueda pasó a
-- OpenLibrary). 20260714_editions_d_sync.sql ya copió su contenido a
-- `openlibrary_work_key`, que es la columna por la que ahora busca
-- find-or-create.ts.
alter table public.books
  drop column google_books_id;
