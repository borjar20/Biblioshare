-- #674 parte D: ARREGLO DE BUG PREEXISTENTE. hydrate_book (20260715_book_hydration)
-- es fill-only, pero el trigger enforce_catalog_edit_collaborator_only bloquea a
-- cualquier `user` (rol por defecto) al escribir synopsis/genres/cover_url —
-- `is distinct from` dispara también con null->valor. Resultado: para un usuario
-- normal la RPC lanza, su error se traga en console.error (ensureBookHydrated) y
-- hydrated_at nunca se marca; la ficha de libro se queda sin sinopsis ni géneros
-- y se reintenta en cada visita. NO se ve en dev (quien prueba es admin). Lo
-- destapó #674 verificando en dev con un rol `user`.
--
-- Se añade el mismo flag app.hydrating que hydrate_movie/series: activo alrededor
-- del UPDATE (y apagado justo después, para no filtrar el bypass a un UPDATE
-- posterior en la misma transacción). La función sigue siendo fill-only: no pisa
-- lo que un colaborador haya curado. Ver 20260818_catalog_b_hydration_bypass y la
-- issue de registro del bug.
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

  perform set_config('app.hydrating', 'on', true);
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
  perform set_config('app.hydrating', 'off', true);
end;
$$;

comment on function public.hydrate_book is
  'Cache-as-you-go de la obra al abrir su ficha (spec 2026-07-14): rellena synopsis/genres/cover_url SOLO si estaban vacíos y marca hydrated_at. Fill-only, no pisa curación. Activa app.hydrating alrededor del UPDATE para pasar el trigger de edición — antes de #674 fallaba para usuarios `user` (bug preexistente). Ver 20260818_catalog_d_hydrate_book_flag.';
