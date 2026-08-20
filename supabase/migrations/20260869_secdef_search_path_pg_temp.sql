-- Issue #726 (S2-19, antes F1-031) — barrido de `pg_temp` en el `search_path`
-- de las funciones SECURITY DEFINER que quedaron fuera de #130.
--
-- ── Corrección del diagnóstico ──────────────────────────────────────────────
--
-- La issue decía «15 funciones». Son 15 las que no mencionan `pg_temp`, pero
-- SOLO 11 son desviaciones. Las otras 4+1 llevan `search_path = ""` (vacío):
--
--   ensure_club_round · get_club_round_state · list_club_round_weeks · pin_comment
--
-- Vaciar el `search_path` es MÁS estricto que `public, pg_temp`, no menos: esas
-- funciones cualifican cada nombre a mano (`public.x`) y no resuelven nada por
-- búsqueda, así que no hay esquema que envenenar. Pasarlas a `public, pg_temp`
-- las EMPEORARÍA. Se quedan como están, a propósito.
--
-- (`resolve_pending_import` también estaba en la lista de 15 y ya se arregló en
-- la migración 20260868, al recrearla por otro motivo.)
--
-- ── Riesgo real ─────────────────────────────────────────────────────────────
--
-- Ninguno hoy: sin `pg_temp` en el `search_path` explícito, PostgreSQL tampoco
-- lo antepone, así que el vector clásico —crear una función homónima en
-- `pg_temp` para que la SECURITY DEFINER la llame— no aplica. Lo que se arregla
-- es la CONSISTENCIA: «todas nuestras SECURITY DEFINER siguen la misma regla»
-- es una frase verificable con una consulta; «casi todas» no sirve para nada, y
-- es lo que deja pasar a la siguiente.
--
-- Verificación: contra `pg_proc.proconfig`, nunca contra `list_migrations`.
--
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosecdef
--     and coalesce(array_to_string(p.proconfig, ','), '') = 'search_path=public';
--   -- debe salir vacío después de esto
--
-- `alter function` NO recrea el cuerpo: no toca grants, ni owner, ni firma.

alter function public.archive_club_activity(uuid)
  set search_path = public, pg_temp;

alter function public.enforce_catalog_edit_collaborator_only()
  set search_path = public, pg_temp;

alter function public.get_activities_progress(uuid[])
  set search_path = public, pg_temp;

alter function public.hydrate_book(uuid, text, text[], text)
  set search_path = public, pg_temp;

alter function public.hydrate_movie(uuid, text, text, text, text, text[], integer, text, integer)
  set search_path = public, pg_temp;

alter function public.hydrate_screens_bulk(text, jsonb)
  set search_path = public, pg_temp;

alter function public.hydrate_series(uuid, text, text, text, text, text[], integer, text, integer, integer, integer)
  set search_path = public, pg_temp;

alter function public.pull_pending_celebrations()
  set search_path = public, pg_temp;

alter function public.register_catalog_item(text, text)
  set search_path = public, pg_temp;

alter function public.register_catalog_items_bulk(text, text[])
  set search_path = public, pg_temp;

alter function public.update_activity_details(uuid, text, text, date, date)
  set search_path = public, pg_temp;
