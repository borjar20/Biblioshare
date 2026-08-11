-- Seed versionado del escenario QA de ITINERARIOS de lectura (issue #177).
--
-- Hasta ahora este escenario vivía SOLO como filas sembradas a mano en el
-- proyecto `supabase-dev` (ver la cabecera de `e2e/sagas-itinerarios.spec.ts` y
-- `.superpowers/sdd/task-10-report.md`): quien clonaba el repo y corría
-- `npm run test:e2e` sin esos datos veía timeouts de Playwright del tipo
-- "heading not visible", sin nada en el repo que dijera qué datos faltan. Este
-- fichero es ese escenario, versionado.
--
-- OJO: NO lo confundas con `e2e/support/qa-seed.ts`, que solo RE-NORMALIZA
-- (PATCH) la línea base de OTRO universo QA ([QA Sagas v2] Era Uno) que también
-- se dio por sembrado. Este script sí CREA desde cero el universo de itinerarios.
--
-- Escenario (calcado de la cabecera del spec):
--
--   [QA Itinerarios] Universo   (sin grafo, show_map=false)
--     ├─ obra directa "Ronda de noche"  (saga_items.position 3, COMPLETADA
--     │   por el colaborador de pruebas → universo = 1/3 = 33%)
--     └─ subsaga "La Guardia" (accent verde, position_in_parent 4)
--          ├─ "¡Guardias! ¡Guardias!"  (position 1)
--          └─ "Pies de barro"          (position 2)
--
--   Itinerario curado `la-guardia` ("La Guardia" / "Policíaco"): UN paso, el
--   bloque-subsaga de La Guardia (2 obras, 0 completadas = 0%).
--
-- Los denominadores distintos a propósito (universo 3 vs ruta 2) son lo que hace
-- que el test anti-#91 pueda detectar un hero mal enganchado a la ruta activa:
-- si fueran 2 = 2, un hero mal ligado daría el mismo número por coincidencia.
--
-- Idempotente: `ON CONFLICT (id) DO UPDATE` reimpone los campos, así que correrlo
-- sobre una semilla ya sembrada no crea duplicados y además la auto-sana si un
-- spec caído dejó algún campo movido. Solo toca filas de UUID fijo con prefijo
-- "[QA Itinerarios]" — no puede pisar datos reales.
--
-- Cómo correrlo (contra DEV, con el SQL editor o el MCP `supabase-dev`):
--   psql "$DEV_DB_URL" -f e2e/fixtures/seed-sagas-itinerarios.sql
-- Ver `docs/TESTING.md`.

begin;

-- 1) Catálogo: las tres obras.
insert into public.books (id, title, published_year) values
  ('7f881b7a-8a1f-4762-896a-e18825d460f5', '[QA Itinerarios] ¡Guardias! ¡Guardias!', 1989),
  ('0b49bdac-135e-4b9c-825d-a6f1ce97ca54', '[QA Itinerarios] Pies de barro',          1996),
  ('35a3c64b-aff4-430e-b10d-ef8ec5a7341e', '[QA Itinerarios] Ronda de noche',         2002)
on conflict (id) do update set title = excluded.title, published_year = excluded.published_year;

-- 2) Universo (sin padre, sin grafo) y subsaga La Guardia (cuelga del universo
--    por `parent_saga_id`, en position_in_parent 4 — no por una fila saga_items).
insert into public.sagas (id, name, source, accent_color, parent_saga_id, position_in_parent, placement_in_parent, optional_in_parent, show_map) values
  ('33d7bb93-da3d-4453-a6da-1722beff134d', '[QA Itinerarios] Universo',   'manual', null,    null,                                   null, null,   false, false),
  ('176df19e-fc90-4535-934b-3ea5799a5f47', '[QA Itinerarios] La Guardia', 'manual', 'verde', '33d7bb93-da3d-4453-a6da-1722beff134d',  4,    'fijo', false, false)
on conflict (id) do update set
  name = excluded.name, source = excluded.source, accent_color = excluded.accent_color,
  parent_saga_id = excluded.parent_saga_id, position_in_parent = excluded.position_in_parent,
  placement_in_parent = excluded.placement_in_parent, optional_in_parent = excluded.optional_in_parent,
  show_map = excluded.show_map;

-- 3) Pertenencias directas (obras dentro de cada saga). La subsaga cuelga del
--    universo por parent_saga_id (arriba), no aquí.
insert into public.saga_items (id, saga_id, item_type, item_id, position, is_primary, role, placement, optional) values
  -- La Guardia: dos obras
  ('a1000000-0000-4000-8000-000000000001', '176df19e-fc90-4535-934b-3ea5799a5f47', 'book', '7f881b7a-8a1f-4762-896a-e18825d460f5', 1, true, null, 'fijo', false),
  ('a1000000-0000-4000-8000-000000000002', '176df19e-fc90-4535-934b-3ea5799a5f47', 'book', '0b49bdac-135e-4b9c-825d-a6f1ce97ca54', 2, true, null, 'fijo', false),
  -- Universo: la obra directa
  ('a1000000-0000-4000-8000-000000000003', '33d7bb93-da3d-4453-a6da-1722beff134d', 'book', '35a3c64b-aff4-430e-b10d-ef8ec5a7341e', 3, true, null, 'fijo', false)
-- Conflicto sobre la CLAVE NATURAL (saga_id, item_type, item_id), no sobre id:
-- las filas ya sembradas en dev tienen otro id, así que apuntar a id no las
-- detectaría y chocaría contra el único natural. En BD fresca inserta con el id
-- fijo de arriba; en una ya sembrada actualiza la fila existente (su id queda).
on conflict (saga_id, item_type, item_id) do update set
  position = excluded.position, is_primary = excluded.is_primary, role = excluded.role,
  placement = excluded.placement, optional = excluded.optional;

-- 4) Itinerario curado `la-guardia` (un solo paso: el bloque-subsaga La Guardia).
insert into public.saga_routes (id, saga_id, slug, name, summary, position, is_reading_order) values
  ('da085042-03ee-404b-bf88-ca82c489ca1d', '33d7bb93-da3d-4453-a6da-1722beff134d', 'la-guardia', 'La Guardia', 'Policíaco', 1, false)
on conflict (saga_id, slug) do update set
  name = excluded.name, summary = excluded.summary,
  position = excluded.position, is_reading_order = excluded.is_reading_order;

insert into public.saga_route_entries (id, route_id, position, item_type, item_id, child_saga_id, note) values
  ('f9beaef3-78fa-4f25-aff0-3d0e8e1495ae', 'da085042-03ee-404b-bf88-ca82c489ca1d', 1, null, null, '176df19e-fc90-4535-934b-3ea5799a5f47', null)
on conflict (route_id, position) do update set
  item_type = excluded.item_type, item_id = excluded.item_id,
  child_saga_id = excluded.child_saga_id, note = excluded.note;

-- 5) El pase COMPLETADO del colaborador sobre la obra directa: es lo que pone el
--    universo en 1/3 (33%) mientras la ruta la-guardia sigue en 0/2 (0%).
--    Usuario = `borjar20+bibliosharecollab@gmail.com` (id fijo, ver spec).
insert into public.passes (id, user_id, item_type, item_id, status, is_active, is_public, finished_on) values
  ('4e8c7e00-b8e5-43fd-8b9a-1aa45ed54dee', '4265f51f-c784-4c5b-8153-3ef970800456', 'book', '35a3c64b-aff4-430e-b10d-ef8ec5a7341e', 'completed', false, false, '2026-07-22')
on conflict (id) do update set
  user_id = excluded.user_id, item_type = excluded.item_type, item_id = excluded.item_id,
  status = excluded.status, is_active = excluded.is_active, is_public = excluded.is_public,
  finished_on = excluded.finished_on;

commit;
