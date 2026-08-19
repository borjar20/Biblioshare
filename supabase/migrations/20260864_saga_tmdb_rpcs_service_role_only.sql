-- Issue #675: bypass de autorización en las RPC de sagas TMDB.
--
-- `link_tmdb_saga_item()` y `sync_tmdb_saga_items()` son SECURITY DEFINER y
-- tenían EXECUTE para `authenticated`. Solo comprobaban que la saga PARECE TMDB
-- (`source='tmdb' and tmdb_collection_id is not null`); nunca que la película
-- pertenezca de verdad a esa colección. Un autenticado cualquiera —sin ser
-- colaborador— podía llamarlas por PostgREST e inyectar películas arbitrarias
-- dentro de una colección global que el resto de la app enseña como oficial,
-- saltándose la RLS de `saga_items` (que exige collaborator+ para sagas
-- manuales). `sync_tmdb_saga_items` acepta además un array entero → inyección
-- masiva de una tacada.
--
-- POR QUÉ NO SE ARREGLA VALIDANDO DENTRO DE LA FUNCIÓN: el hecho «esta peli
-- pertenece a esta colección» SOLO existe en TMDB. Postgres no puede
-- consultarlo, y cualquier columna que lo guardase la rellenaría el mismo
-- camino que queremos validar (hidratación fill-only llamable por el cliente,
-- #674) — sería circular: el atacante se adelanta, escribe la pertenencia falsa
-- y la validación le da la razón.
--
-- ARREGLO: la lista de partes la obtiene el SERVIDOR de TMDB
-- (`getCollection()` en `src/lib/sagas/get-saga.ts`,
-- `enrichItem`→`persistCollectionMembership`), así que la llamada deja de venir
-- del cliente de la sesión y pasa a hacerse con `service_role` desde el render
-- de servidor. Los argumentos son server-derived; el usuario ya no controla ni
-- la saga ni el ítem que se enlaza.
--
-- NO cambia el comportamiento observable: ambas funciones ya eran SECURITY
-- DEFINER (ya se ejecutaban con privilegios de owner), y el camino de app es el
-- mismo. Lo único que cambia es QUIÉN puede invocarlas.
--
-- Verificar en dev y en prod contra objetos reales, no contra el ledger:
--   select p.proname, array(select r.rolname from pg_roles r
--            where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
--              and r.rolname in ('anon','authenticated','service_role'))
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('link_tmdb_saga_item','sync_tmdb_saga_items');
--   -- esperado: {service_role} en las dos.

revoke execute on function public.link_tmdb_saga_item(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.sync_tmdb_saga_items(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.link_tmdb_saga_item(uuid, uuid) to service_role;
grant execute on function public.sync_tmdb_saga_items(uuid, jsonb) to service_role;

comment on function public.link_tmdb_saga_item is
  '#675: alta de una peli en su colección TMDB. SOLO service_role — la llama el servidor con la colección ya resuelta contra TMDB. Un authenticated no debe poder elegir saga+ítem (inyección en colección oficial).';
comment on function public.sync_tmdb_saga_items is
  '#675: rellenado perezoso de una colección TMDB. SOLO service_role — la lista de partes viene de getCollection() en servidor. Un authenticated no debe poder mandar el array (inyección masiva).';
