# Guardado frente a una partida adoptada — #959

> **[Histórico · evidencia congelada el 2026-10-03]**

La guarda de rancidez de `PlayStore.save()` ya conservaba la partida adoptada
durante `await saveFinished`. Se añade cobertura determinista para `anon` y
`uid-959`, sin cambiar ese comportamiento, y se aclara el contrato del boolean:
`true` confirma el guardado y la liberación de la activa; `false` también puede
significar que la partida anterior se guardó pero el snapshot cambió y la activa
actual se conservó.

Base examinada: `14ad944ed48302c9f36a4165f6e8cf19d19bcdaa`.
Rama de trabajo: `codex/play-save-staleness-959`. Runtime explícito: Node
`v24.19.0`, desde
`C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.

## Prueba causal

El nuevo caso vive en `src/lib/play/core/store.test.ts` y sigue esta secuencia:

1. Crea y termina una partida; espera a que su escritura en `active` termine.
2. Retiene exclusivamente el callback `oncomplete` de la transacción
   `saved/readwrite`. El `put` y el commit de fake-indexeddb ocurren; la promesa de
   `saveFinished` sigue pendiente. `db.ts` y `store.ts` conservan sus implementaciones.
3. Escribe por `writeActive` otra partida con revisión 10 y anuncia esa revisión
   mediante un canal controlado. Drena dos veces la cola del store y comprueba la
   adopción antes de liberar el guardado.
4. Libera el callback y comprueba `false`, la misma referencia de snapshot
   adoptado, ninguna notificación adicional y el registro ajeno intacto en `active`.
   Comprueba además que `saved` contiene exclusivamente la partida terminada
   anterior, con su log, resumen, identidad y estado `pending` correctos.

Las promesas fijan el orden de guardado, adopción y continuación. El caso no usa
retardos, avances de reloj ni dos escritores compitiendo por el mismo CAS. La
espera de hidratación reutiliza el helper existente; la carrera comprobada se
coordina con las promesas y la cola. Su `finally` libera cualquier espera, restaura
el stub, drena las escrituras y destruye el store y su canal.

## Verificación

Evidencia local, fuera de Git:
`.scratch/ticket-campaign/20261002-resolve-all/play-save959-20261003/`.
Cada ejecución tiene log y recibo con comando, resultado y hashes de las fuentes.

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Baseline `store.test.ts` + `db.test.ts` | PASS: 74/74 | `baseline-unit-v001` |
| Nuevo caso focal | PASS: 2/2; otros 58 excluidos por filtro | `focal-unit-v001` |
| Control negativo: retirar solo la guarda de snapshot | FAIL esperado: 2/2; otros 58 excluidos por filtro | `negative-guard-v001` |
| Suite final `store.test.ts` + `db.test.ts` | PASS: 76/76, sin skips ni reintentos; 5,04 s | `final-unit-v001` |
| Tipos, primera ejecución | FAIL: TS2683 en el `this` del stub nuevo | `types-v001` |
| Tipos tras anotar `this` | PASS: sin errores | `types-v002` |
| Lint de los dos archivos cambiados | PASS: sin errores | `lint-v002` |
| Integridad del diff | PASS | `diff-check-v001` |

Comandos finales ejecutados desde el worktree asignado con el runtime anterior:

```powershell
& $ticketNode node_modules/vitest/vitest.mjs run src/lib/play/core/store.test.ts src/lib/play/core/db.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
& $ticketNode node_modules/typescript/bin/tsc --noEmit --incremental false
& $ticketNode node_modules/eslint/bin/eslint.js src/lib/play/core/store.ts src/lib/play/core/store.test.ts
git diff --check
```

El control negativo conservado falla porque el snapshot adoptado pasa a
`{ status: "ready", game: null }`. Antes de la suite final se restauró `store.ts`
byte a byte, con SHA-256 anterior y posterior idénticos. No se entrega la mutación.

| Fuente final | SHA-256 |
| --- | --- |
| `src/lib/play/core/store.ts` | `14A7C310F61DF793F325604B27AC6C4ECD02C40845E002E6A468B6BB85C6F4BA` |
| `src/lib/play/core/store.test.ts` | `9715CD5B5C1BFE969C50BEB7BF40DDD6AC69E1C4B1D8AA32E9B945BE3A3155B0` |

## Callers y límites

La lectura de `game-summary.tsx` y `score/score-summary.tsx` confirma que los
callers actuales solo navegan a `/partidas` cuando `save()` devuelve `true`; no
muestran un error ni afirman que la partida no se haya guardado cuando devuelve
`false`. `game-screen.tsx` deriva la pantalla del snapshot suscrito, por lo que
la adopción actualiza la partida visible. La premisa de un mensaje falso de
«no guardado» no está presente en estas implementaciones y no requiere un cambio
de UI.

Esta evidencia cubre adaptadores reales sobre fake-indexeddb y la continuación
asíncrona del store. El canal se entrega manualmente. No acredita IndexedDB ni
BroadcastChannel de un navegador real, navegación observada, nube, RLS, backend,
Android o sincronización remota. No se han levantado servicios ni modificado
dependencias, esquema, credenciales o configuración. Los documentos canónicos y
el cierre de la issue quedan a cargo de la integración de la campaña.
