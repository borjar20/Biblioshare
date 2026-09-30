-- #1204: las firmas recreadas al añadir backdrop_url heredaron el grant de
-- anon. La hidratación requiere sesión y debe rechazar al visitante antes de
-- entrar en la función. Se conservan las firmas y los grants de otros roles.
revoke execute on function public.hydrate_movie(uuid, text, text, text, text, text[], integer, text, integer, text) from public, anon;
revoke execute on function public.hydrate_series(uuid, text, text, text, text, text[], integer, text, integer, integer, integer, text) from public, anon;
grant execute on function public.hydrate_movie(uuid, text, text, text, text, text[], integer, text, integer, text) to authenticated, service_role;
grant execute on function public.hydrate_series(uuid, text, text, text, text, text[], integer, text, integer, integer, integer, text) to authenticated, service_role;
