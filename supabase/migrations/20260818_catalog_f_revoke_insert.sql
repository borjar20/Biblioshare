-- #674 parte F — EL CIERRE. Con register_catalog_item como única alta, se retira
-- el INSERT directo de authenticated/anon: se caen las policies permisivas y el
-- privilegio de tabla. La RPC es SECURITY DEFINER (escribe como owner), así que
-- sigue funcionando. Aplicar SOLO con el código nuevo ya desplegado (los call
-- sites deben pasar por register_catalog_item, no por insert directo).
drop policy if exists "catalog books insertable" on public.books;
drop policy if exists "catalog movies insertable" on public.movies;
drop policy if exists "catalog series insertable" on public.series;

revoke insert on public.books  from authenticated, anon;
revoke insert on public.movies from authenticated, anon;
revoke insert on public.series from authenticated, anon;
