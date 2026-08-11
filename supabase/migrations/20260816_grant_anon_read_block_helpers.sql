-- Navegación anónima: un visitante sin sesión ya llega a perfiles públicos y su
-- feed. Las políticas SELECT {anon,authenticated} de passes/progress_sessions/
-- follows llaman a users_are_blocked(); el feed usa filter_unblocked_user_ids().
-- Ambas son SQL STABLE SECURITY INVOKER y se inlinean, así que el rol `anon`
-- necesita EXECUTE sobre las funciones Y SELECT sobre la tabla user_blocks que
-- referencian: el privilegio de tabla se comprueba en PLANIFICACIÓN aunque el
-- guard `auth.uid() is null → false/'{}'` impida tocarla en runtime. Sin esto,
-- cualquier lectura anónima de esas tablas lanzaba «permission denied for
-- function users_are_blocked» / «permission denied for table user_blocks» y
-- devolvía 500 (perfil público reventado).
--
-- Seguro: las funciones cortan con el viewer nulo, y user_blocks no tiene
-- política RLS para `anon` (solo las partes implicadas, {authenticated}), así
-- que el grant solo satisface el chequeo de privilegio — un anónimo nunca ve una
-- fila.
--
-- Aplicado en prod como una sola migración (ledger 20260802214926); en dev se
-- aplicó partido en dos (grant_anon_execute_block_helpers +
-- grant_anon_select_user_blocks). Estado final idéntico en ambos entornos.
grant execute on function public.users_are_blocked(uuid) to anon;
grant execute on function public.filter_unblocked_user_ids(uuid[]) to anon;
grant select on table public.user_blocks to anon;
