-- hydrate_book nació con EXECUTE para anon: los default privileges de Supabase
-- conceden ejecución a anon+authenticated en funciones nuevas, y el
-- `revoke all ... from public` de 20260715_book_hydration no quita ese grant
-- explícito a anon. Funcionalmente anon no puede hacer nada (la función lanza
-- 'authentication required' si auth.uid() es null), pero se revoca igual para
-- igualar el patrón de register_book_edition y limpiar el advisor
-- `anon_security_definer_function_executable`. Aplicada en dev y prod.
revoke execute on function public.hydrate_book(uuid, text, text[], text) from anon;
