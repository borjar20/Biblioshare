-- #690/#688 (P0) — bypass de RLS: escritura/borrado de reseñas ajenas vía la
-- vista `public.pass_reviews`.
--
-- RESCATE DE MIGRACIÓN HUÉRFANA. Aplicada a dev y prod el 2026-08-14 (ledger:
-- dev `20260814191214` con el nombre `..._security_invoker`, prod
-- `20260814222533` con el nombre `..._writes_revoke`) sin fichero en el repo;
-- la auditoría 2026-08 (F1-017) la detectó como fantasma. Se rescata para que el
-- árbol describa la base real y para que un entorno nuevo nazca parcheado.
-- Idempotente: `revoke` sobre un privilegio ya revocado no falla.
--
-- Qué agujero cerraba
-- -------------------
-- `pass_reviews` es una vista con `owner = postgres` (BYPASSRLS) y SIN
-- `security_invoker`, así que sus relaciones base se evalúan con los privilegios
-- del propietario. Mientras la vista tuvo grants de INSERT/UPDATE/DELETE para
-- `anon` y `authenticated` -- que es lo que Supabase concede POR DEFECTO a
-- cualquier tabla o vista nueva del esquema `public` --, cualquiera podía hacer
-- `UPDATE public.pass_reviews SET review=... WHERE id=<pase ajeno>` y reescribir
-- la reseña de otro usuario saltándose la RLS de `passes`. Confirmado en runtime
-- sobre prod (prueba transaccional revertida, 2026-08-14): `rows_updated = 1`.
--
-- Por qué NO se arregla con `security_invoker = true`
-- ---------------------------------------------------
-- Es el fix que proponía el issue y ROMPE LA APP. `public.passes` tiene grants
-- de SELECT **por columna**, y `review`, `dropped_reason` y `dropped_reason_note`
-- están deliberadamente FUERA de esos grants: nadie puede leerlas directamente de
-- la tabla. La vista existe precisamente para ser la única vía de lectura de la
-- reseña, con su propio enmascarado de privacidad en el WHERE y en los CASE. Con
-- `security_invoker = true` la vista pasa a leer `passes` con los privilegios del
-- que consulta y revienta con «permission denied for table passes» (comprobado en
-- dev, 2026-08-19). Hacerla funcionar exigiría conceder SELECT sobre `review` a
-- `anon`/`authenticated`, es decir, exponer por REST la reseña privada que la
-- vista enmascara: exactamente lo contrario de lo que se busca.
--
-- La semántica de definer es INTENCIONADA aquí. Lo que no puede volver a pasar es
-- que la vista tenga permisos de ESCRITURA: es de solo lectura. Editar o borrar
-- una reseña va por `public.passes`, que sí tiene RLS propia y grants finos.
--
-- TRAMPA para quien toque esta vista en el futuro
-- -----------------------------------------------
-- Cada `drop view` + `create view` de `pass_reviews` RECREA el objeto y con él
-- vuelven los grants por defecto de Supabase (ALL para anon/authenticated) -- que
-- es como nació este agujero. Ya se ha recreado en 20260714, 20260716 (x2),
-- 20260717, 20260833 y 20260858. **Toda migración que recree `pass_reviews` debe
-- terminar con el bloque `grant select` + `revoke` de abajo**, no solo con el
-- `grant select`. Superficie 7 de `docs/DRIFT-CHECK.md`.
grant select on public.pass_reviews to anon, authenticated;
revoke insert, update, delete, truncate, references on public.pass_reviews from anon, authenticated;

comment on view public.pass_reviews is
  'Única vía de lectura de passes.review (columna sin grant de SELECT en la tabla base). '
  'Vista de SOLO LECTURA con semántica de definer INTENCIONADA: NO ponerle security_invoker '
  '(rompe la lectura, ver migración 20260862 e issue #690). Toda recreación debe re-revocar '
  'insert/update/delete a anon y authenticated.';
