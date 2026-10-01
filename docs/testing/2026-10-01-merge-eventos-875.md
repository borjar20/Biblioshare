# Fusiones de libro y referencias de eventos (#875)

> **[Evidencia · verificada el 2026-10-01 · local/dev/prod]**

El diagnóstico original solo describía `config.item`, pero el contrato actual
tiene además `fecha_destacada.config.relations[]`. La función vigente previa
en local/dev/prod coincidía: MD5 `1c7e2ccbfeabba26ed212ff00b26ec7c`. El scan
del 1 de octubre a las 10:04 UTC encontró cero referencias book y cero huérfanos
en ambos formatos y entornos; el problema sigue siendo latente antes del barrido.

La nueva prueba SQL falla con la función anterior: `book release repoints only
its itemId`. Reproduce una fusión real de fixtures dentro de una transacción;
el error revierte los datos. La primera aplicación local del candidato detectó
un terminador SQL ausente y no cambió la función. Se corrigió antes de aplicar
en dev; los dos FAIL y sus logs se conservan.

## Cobertura que queda en el gate

`supabase/tests/merge_book_club_event_refs.sql`, dos grupos con rollback, PASS:

- Once configuraciones: lanzamiento y fecha destacada book se repuntan;
  duplicados, orden y claves ajenas se conservan. Película y serie con el mismo
  UUID permanecen intactas, igual que los vínculos a otra actividad.
- Otras clases/tipos de evento, SQL null, escalares y relations no-array o vacío
  no se reinterpretan ni producen error.
- Dos pases activos en conflicto abortan antes de cambiar libros o referencias.
- RPC solo service_role; anon/authenticated no pueden ejecutarla.

El gate DB ejecuta esta matriz junto a la regresión canónica ISBN #906, que
sigue PASS. El manifiesto añade la migración una vez; el baseline generado
coincide y las siete pruebas de bootstrap pasan. Local es una instancia ya
existente con la función promovida de forma incremental; la repetición completa
desde vacío corresponde al check DB de la PR, no a su ledger local antiguo.

El contador de rastro de eventos usa el parser de la ficha y consulta todas las
páginas en orden total. Siete tests nuevos: ambos formatos, duplicados, otros
medios, malformed, >1000 filas, fallo de página posterior y ganador real con
evento frente a duplicado antiguo vacío. Con los tests del reconciliador:
53 PASS. Lint de los archivos cambiados y typecheck del repo, PASS. Revisión independiente
de SQL, matriz y contador: sin defectos materiales pendientes.

## Entornos y límites

Dev, ledger `20261001102008 / merge_book_club_event_refs`: los dos grupos se
ejecutan dentro de subtransacciones que revierten sus fixtures al completarse.
Resultado explícito PASS; auth.users, profiles, clubs, activities, books, movies,
series y passes propios quedan a cero. El resultado vacío del primer transporte
SQL no se usa como evidencia de que se hayan ejecutado las aserciones.

Prod, ledger `20261001102919 / merge_book_club_event_refs`: se redefine la función
sin ejecutar fusiones ni sembrar fixtures. Cuerpo idéntico al de local/dev:
MD5 `c8b66534da7190781a3578225040817b`, SECURITY DEFINER, search_path
`public, pg_temp`, service_execute=true y anon/auth_execute=false. Los recuentos
de books 437 y passes 1283 coinciden con el baseline anterior; hay 31 actividades.

El borrado ordinario sin FK continúa en #546 y la portada huérfana en #880.
El barrido real con plan/backup completo queda en #912; esta entrega no lo da
por ejecutado. La migración mantiene las firmas y no añade columnas/grants.

Artefactos ignorados en `.scratch/ticket-campaign/qa875/`: baseline dev/prod,
`baseline.log` (rojo), `apply-local.log` y `after-local.log` (candidato con error
de sintaxis conservado), `apply-local-fixed.log`, `after-local-fixed.log`,
`isbn-regression-local.log`, `unit-local.log`, `typecheck-local.log`,
`dev-rollback-regression.sql`, `dev-regression.json` y metadatos de promoción.
