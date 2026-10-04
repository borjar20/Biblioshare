# #977 — migración de guardados IndexedDB: rollback y reintento

[Informe acotado · verificado 2026-10-04 · base 6fd301b7aadf9d55b31ca7b9a25dcedc0bdabeea]

El diagnóstico operativo de la [issue #977](https://github.com/borjar20/Biblioshare/issues/977)
se rectifica: el aborto completo descrito sí ocurre, pero conserva la fuente v1 y ya
se maneja mediante el error de apertura y el fallback existente. No se ha demostrado
un defecto que requiera añadir `onerror` a cada `cursor.update()`/`cursor.delete()`.
Se mantiene `db.ts` sin cambios y se añade cobertura de ese contrato.

La base actual tiene `DB_VERSION = 4`: una apertura desde v1 ejecuta la conversión de
los guardados a v2 y crea `players`/`companion` en la misma transacción de actualización.
El fallo revierte conjuntamente los registros, el esquema y la versión. Cancelar el
error de una petición para continuar permitiría confirmar registros v1/v2 mezclados;
no se adopta ese comportamiento.

## Fuentes y alcance

- Fuente actual: `src/lib/play/core/db.ts`, `readActive`/`listSaved`/`saveFinished`,
  y el fallback de hidratación de `src/lib/play/core/store.ts`.
- Contrato histórico corroborado en el código actual: spec de persistencia fase 3 §2
  y spec de sincronización fase 5 §§3/8, ambas de 2026-08-30. Los fallos de almacenamiento
  degradan a memoria; la migración deriva el resumen y marca los guardados pendientes.
- `docs/requirements/data-model.md` §8.1 describe `play_games` remoto; no constituye el
  esquema local de IndexedDB. El mapa consultado fue `docs/architecture/graph.json`, nodo
  `m-play`. No se modifica el esquema remoto ni su documentación canónica.
- [IndexedDB, W3C §5.5](https://www.w3.org/TR/IndexedDB-3/#abort-transaction) establece
  que un aborto revierte registros, objetos e incremento de versión.
  [W3C §5.10](https://www.w3.org/TR/IndexedDB-3/#fire-error-event) describe el aborto
  por defecto cuando no se cancela el error de petición. Se aplica el contrato atómico.
- Se leyó la guía `use-client.md` de Next 16.3.8 instalada. Las pruebas ejecutan el
  módulo cliente en Node; no arrancan Next ni acceden a cuentas del navegador.

## Reproducción causal

Fixtures exclusivamente en RAM con `fake-indexeddb` 6.2.5. Se siembran una activa de
revisión 7 y cinco guardados v1: tres reproducibles y dos corruptos. Por orden de clave,
el cursor actualiza `a-first` y borra `b-corrupt` antes del fallo. El objetivo de
`update` es `c-update-target`; el de `delete`, `d-delete-target`.

La inyección sustituye temporalmente `storeRecord` o `deleteRecord` del backend de
`fake-indexeddb`. Estas operaciones se ejecutan en su cola asíncrona después de que
el cursor devuelve la petición real. No se sustituye el callback de migración, el
error de petición, la propagación, el aborto ni el rollback. La observación incluye
el error de petición que burbujea sin cancelación, el aborto de transacción y el
`AbortError` de apertura. Los helpers del test declaran esta frontera expresamente.

| Escenario | Petición | Apertura | Fuente tras el fallo | Reintento sin reset |
|---|---|---|---|---|
| update intermedio | `QuotaExceededError` | `AbortError` | v1; activa y cinco logs exactos; sólo active/saved | v4; tres guardados v2; corruptos descartados |
| delete intermedio | `UnknownError` | `AbortError` | v1; activa y cinco logs exactos; sólo active/saved | v4; tres guardados v2; corruptos descartados |

La prueba durable exige que una segunda apertura siga fallando mientras la causa
persiste, sin modificar la fuente. Al retirarla, el siguiente `readActive` recupera
la activa original y `listSaved` devuelve los logs válidos con resumen, `pending` y
`deletedAt: null`. No se llama a `__resetDbForTests` entre fallo y recuperación.

El harness adicional usa el store real: tras fallar la hidratación puede empezar una
partida en memoria para otra identidad; su escritura vuelve a fallar y las fuentes
v1 siguen intactas. Ese fallback no promete guardado de los cambios nuevos mientras
el almacenamiento siga fallando, ni rehidratar automáticamente un store ya activo.
La recuperación comprobada es la siguiente apertura de la API.

**Límite de evidencia:** `QuotaExceededError` se inyecta en una operación asíncrona real
del backend en memoria, no se llena el disco/cuota de un navegador. Un fallo síncrono
de replay o `DataCloneError` no se presenta como prueba de cuota asíncrona. No se han
usado servidores, Chrome del usuario, credenciales, SQL ni datos remotos.

## Cobertura y dictámenes

Todo se ejecutó con Node 24.19.0 explícito:
`C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.

| Check | Resultado | Evidencia |
|---|---|---|
| Harness: update y delete, rollback/fallback/retry | PASS, 2 escenarios | `run-01/output.log`, dos JSON completos |
| Test nuevo aislado | PASS, 2/2 | `unit-01/output.log` |
| Motor completo, incluido test nuevo final | PASS, 144/144 en 12 archivos | `unit-02/output.log` |
| Mutante: retener promesa rechazada | FAIL esperado, 2/2; impide nueva apertura | `mutant-retain-failed-promise-02/output.log` |
| Mutante: cancelar errores de update/delete | FAIL esperado, 2/2; apertura confirma migración parcial | `mutant-commit-partial-upgrade-01/output.log` |
| TypeScript global sin emisión ni incremental | PASS, exit 0 | `types-01/output.log` |
| ESLint del test nuevo | PASS, exit 0 | `lint-01/output.log` |
| `git diff --check` | PASS | `diff-check.log` |

Los mutantes sólo transforman `db.ts` en memoria durante Vitest: no se escriben en las
fuentes ni se ejecutan contra una base real. Las pruebas son sensibles tanto al
reintento roto como a la pérdida de atomicidad.

Se conserva el primer intento del mutante de promesa: **FAIL del harness**, ancla no
encontrada por CRLF y cero tests ejecutados, en `mutant-retain-failed-promise-01`.
No cuenta como rechazo causal; el intento corregido usa una ruta nueva. `classification.json`
explica esa distinción. No existe un RED de defecto de producto en el original:
los errores provocados son el estímulo de la prueba y su manejo correcto ya pasa.

Comandos reproducibles desde el checkout:

```text
<node24> node_modules/vitest/vitest.mjs run src/lib/play/core/db-upgrade.test.ts --maxWorkers=1 --no-file-parallelism
<node24> node_modules/vitest/vitest.mjs run src/lib/play/core --maxWorkers=1 --no-file-parallelism
<node24> node_modules/typescript/bin/tsc --noEmit --incremental false
<node24> node_modules/eslint/bin/eslint.js src/lib/play/core/db-upgrade.test.ts
```

## Entrega y frontera de revisión

Única fuente añadida: `src/lib/play/core/db-upgrade.test.ts`; único informe: este archivo.
`src/lib/play/core/db.ts` permanece idéntico a la base. La integración, el comentario de
rectificación y el cierre de #977 corresponden a Root. No se reclama una reparación de
producto ficticia; la propuesta es cerrar con diagnóstico rectificado y cobertura.

Censo, comandos, issue real, logs completos y hashes en:
`C:/Users/jasc9/Documents/Proyectos-Codex/Biblioshare/.scratch/diagnosis977-20261004/`.
Los artefactos ignorados anteriores de #1353 y QA se conservan. No se toca otro worktree,
central docs, dependencias, servicios ni configuración de producción.