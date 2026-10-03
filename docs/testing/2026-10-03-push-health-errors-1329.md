# #1329 — Observar los errores al guardar salud push

> [Evidencia · verificada contra código y fronteras locales el 2026-10-03]

Estado: candidato local verificado, pendiente de integración coordinada después de #1052. Base exacta: `4419656e400473359f2c59abe383bf3a6f775a05`, rama `codex/push-health-errors-1329`. No se hizo commit, push, PR ni merge durante esta implementación.

## Resultado y causa

`recordHealth` observa todas las operaciones de salud creadas: tanto respuestas PostgREST resueltas con `{ error }` como promesas rechazadas. Usa `Promise.allSettled` para que el rechazo de una operación no oculte las respuestas de las demás. Los fallos se registran una vez por operación; no se repite ningún UPDATE ni ningún envío.

El fallo original estaba en `Promise.all(ops).then(() => {}, ...)`: la rama de éxito ignoraba los valores resueltos. Una respuesta con `error` no equivale a un rechazo. Este contrato está documentado en [manejo de errores de Supabase](https://supabase.com/docs/guides/api/handling-errors-in-supabase-js) y se confirmó con el SDK instalado `@supabase/supabase-js` / `@supabase/postgrest-js` **2.110.1**, usando un `fetch` local.

El log mantiene el prefijo `sendPushToUsers: health update failed` y solo añade `{ kind, code }`. `kind` distingue `response` de `rejection`; `code` admite la forma de códigos SQLSTATE/PostgREST y usa `UNKNOWN` para otros valores. No se imprime el objeto de error, sus mensajes/detalles/hints, stacks, ids, filas, endpoints, claves, tokens ni contenido del push. El error al construir un UPDATE también pasa por este diagnóstico saneado.

Los ACK del proveedor siguen siendo independientes de la salud persistida: el reporte conserva `accepted` aunque un UPDATE falle. Se mantienen el update en lote de aceptados, la desactivación de inválidos, el incremento de fallos temporales sin desactivar y la ausencia de escrituras para descartes. No cambian claims, preferencias, payloads, transportes, helper de mascota, ruta de cron ni consumidores sociales.

## Verificación

Runtime explícito: Node **24.19.0**, `C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`; Vitest **4.1.11**. Sin instalación ni cambios de dependencias.

| Check | Resultado | Señal |
|---|---|---|
| Repro mínimo original en la base exacta | **FAIL esperado** | 1 test FAIL: ACK = 1, UPDATE = 1, llamadas al logger = 0. |
| Regresiones nuevas antes del arreglo | **FAIL esperado** | 17 pruebas: 16 FAIL, 1 PASS; errores resueltos ignorados y rechazos sin saneamiento. |
| Dispatcher + regresiones nuevas | **PASS** | 2 ficheros, 31 pruebas. |
| Dispatcher + salud + helper + POST, tras el ajuste final del test | **PASS** | 4 ficheros, 49 pruebas; incluye las 17 regresiones nuevas. |
| Tipos del repo | **PASS final** | `tsc --noEmit --incremental false`. El primer intento dio TS2353 por una opción `db.retry` no declarada en la interfaz pública instalada del cliente de test; se retiró y se conservó ese FAIL. |
| Lint de las tres fuentes afectadas | **PASS** | Fuente, test del dispatcher y regresiones de salud. |
| Diff | **PASS** | `git diff --check`; cambio de producción limitado a la observación y el diagnóstico de salud. |
| Base, hashes y aislamiento de #1052 | **PASS** | Fuentes originales de #1052 siguen intactas; snapshots y hashes del candidato están fuera del worktree. |
| Proveedores, base real, SQL, build, E2E, navegador y servidores | **SKIPPED** | Fuera del alcance; ninguna llamada a esos servicios. |

Las regresiones verifican los errores resueltos de las tres clases que escriben salud, mezclas de resueltos/rechazados, códigos reconocidos y arbitrarios, rechazos opacos, fallos al construir la escritura, casos correctos silenciosos y descartes. Comprueban ACK, recuentos, payload de salud, número de envíos y número de escrituras. Las cadenas sensibles usadas para probar el saneamiento son sintéticas.

Dos casos atraviesan el builder real de Supabase/PostgREST con respuestas locales: un PATCH 403 con `42501` y un fallo del `fetch` que el SDK convierte en una respuesta con `error`. Ambos hacen exactamente `GET`, `GET`, `PATCH`, conservan el ACK y generan un diagnóstico seguro. La configuración usa solo `global.fetch` y autenticación sin persistencia/refresco; los PATCH no se reintentan por el SDK según su [política documentada](https://supabase.com/docs/guides/api/automatic-retries-in-supabase-js).

Invocaciones, todas con el Node indicado:

```text
./node_modules/vitest/vitest.mjs run src/lib/push/health-errors.test.ts --maxWorkers=1 --no-file-parallelism
./node_modules/vitest/vitest.mjs run src/lib/push/health-errors.test.ts src/lib/push/send-push.test.ts --maxWorkers=1 --no-file-parallelism
./node_modules/vitest/vitest.mjs run src/lib/push/health-errors.test.ts src/lib/push/send-push.test.ts src/lib/pet/nudges/deliver.test.ts src/app/api/cron/pet-nudges/route.test.ts --maxWorkers=1 --no-file-parallelism
./node_modules/typescript/bin/tsc --noEmit --incremental false
./node_modules/eslint/bin/eslint.js src/lib/push/send-push.ts src/lib/push/send-push.test.ts src/lib/push/health-errors.test.ts
git diff --check
```

## Evidencia y límites

Evidencia nueva: `.scratch/ticket-campaign/20261002-resolve-all/pushhealth1329-implementation/attempt-20261003T132103Z/`. Las pruebas nuevas se escribieron y fallaron antes de modificar producción. `baseline/` preserva el diagnóstico original de #1329, incluido el test de 1759 bytes con SHA-256 `da1f7ef5fcf6f79b6b7cd6182721dcba95ba355b1d5a2a051e4fa24db6948a80` y su log de 1186 bytes con SHA-256 `b1c1bfed7c7861bdf8682053b600987cf44141f5e04d61437276e221278dace1`. La regresión durable conserva el síntoma de ese test y comprueba la nueva estructura saneada del log.

Se conservan los RED, el FAIL inicial de tipos, los GREEN, sus invocaciones/exit codes, fuentes verificadas, diff, estado de Git y hashes. El índice público `changelog.md` no pudo recuperarse con los dos mecanismos de lectura; sí se verificaron las guías oficiales y el comportamiento del SDK instalado. No se infiere ausencia de cambios del changelog no leído.

Este arreglo hace visibles los fallos; no garantiza que una escritura denegada se persista ni subsana permisos remotos. No acredita recepción o visualización en un dispositivo. La sincronización de decisiones y mapa canónicos queda asignada al coordinador para su integración; no se editaron esos documentos compartidos.

## Revisión independiente y corrección r2

La revisión r1 reprodujo dos fallos de robustez con excepciones inyectadas: leer un getter `code` que lanza ocultaba los diagnósticos posteriores, y un logger que lanza podía rechazar el reporte después de obtener el ACK. El control ordinario pasó; las otras dos pruebas fallaron. Los envíos y las escrituras permanecieron únicos. No hay evidencia de que esas excepciones hayan ocurrido en un proveedor o una base reales. La revisión y sus fuentes permanecen intactas en `pushhealth1329-independent-review/`, con manifiesto SHA-256 `57f405c7ea23f58f545b8c1c6ec3b9e1f8736ee7cddf7147e486a1678f1ac440`.

El candidato r2 contiene la lectura de `code` y la llamada al logger por separado: una propiedad ilegible se registra como `UNKNOWN` y un fallo del logger no elimina el reporte ni interrumpe la observación de las demás operaciones. No se vuelve a invocar el logger ni se repiten PATCH o envíos. Dos regresiones durables reproducen los fallos antes del cambio (**2 FAIL de aserción**) y pasan después. La del logger atraviesa el builder real de Supabase/PostgREST con un PATCH 403 local y comprueba un único `GET`, `GET`, `PATCH`.

La verificación r2 pasa **51 pruebas en cuatro ficheros**, incluidos los 19 casos de salud; tipos, lint focal y diff pasan. Evidencia nueva: `pushhealth1329-revision-r2-20261003/`; se conservan los resultados r1. La revisión independiente r2 pasa los **tres diagnósticos originales**, con copia exacta del test y configuración/caché nuevas, sin hallazgos nuevos. Sus cuatro fuentes permanecieron intactas antes/después; manifiesto `pushhealth1329-independent-review-r2-20261003/review-manifest-r2-01.json`, SHA-256 `e1711b1a5681ab253a58b29d08418d7b16a219fa98f52f71c615c0571008ab68`. La CI sobre el lote combinado sigue siendo gate previo al merge.
