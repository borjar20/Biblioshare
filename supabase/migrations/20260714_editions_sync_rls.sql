-- Falta una policy de UPDATE en `books` para que el cache-as-you-go de
-- ediciones (Tarea 6, src/lib/editions/sync-editions.ts) pueda persistir.
--
-- 20260714_editions_sync.sql ya concedió el GRANT de columna
-- (`openlibrary_work_key`, `editions_synced_at`) a `authenticated`, pero un
-- GRANT no basta con RLS activado: sin una POLICY de UPDATE, Postgres filtra
-- la fila a actualizar a cero silenciosamente (no lanza error). Verificado en
-- dev: la RPC register_book_edition (security definer) SÍ inserta ediciones
-- reales con normalidad, pero el UPDATE directo a `books` desde el cliente
-- nunca toca ninguna fila — `editions_synced_at` se queda en null para
-- siempre y cada visita a la ficha repite la llamada a OpenLibrary, que es
-- justo lo que la Tarea 6 quería evitar.
--
-- De paso se cierra un grant más amplio de lo previsto: `books` tenía UPDATE
-- concedido en TODAS sus columnas a `anon` y `authenticated` (nunca se le
-- aplicó el revoke+grant acotado por columnas que sí recibieron movies/
-- series/people en 20260709230750_fix_catalog_rls_policies — books no
-- existía aún en esa migración). Sin una policy quedaba inerte igualmente,
-- pero conviene cerrarlo ahora: mismo patrón que las otras tres tablas.
revoke update on public.books from anon, authenticated;
grant update (openlibrary_work_key, editions_synced_at)
  on public.books to authenticated;

create policy "books editions sync updatable" on public.books
  for update to authenticated using (true) with check (true);
