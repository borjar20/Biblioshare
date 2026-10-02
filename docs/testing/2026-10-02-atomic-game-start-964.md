# Arranque de Partidas sin descarte previo (#964)

> **[Verificado contra código, unitarios, estáticos y build/start local el 2026-10-02]**
>
> Base de implementación: `030426a953a62f61edd53e4c6f3c204e08236477`.
> La QA conjunta verifica fuentes de `f5963e20d7da57d4041ad7034378fce5bce08646`.

Al rechazar el reducer la configuración nueva, los cinco puntos de entrada
descartaban primero la partida activa y después llamaban a `start()`. El
rechazo dejaba el slot vacío. La guarda de límites de Puntuación ya evitaba
algunos candidatos inválidos, pero el contrato compartido seguía siendo
destructivo.

## Contrato y cambio

`PlayStore.start(event, { replaceActive: true })` deriva por replay el estado
candidato antes de tocar la partida anterior. Si el reducer lanza
`PlayEventError`, devuelve `false` y conserva la referencia del snapshot,
el log, la revisión, la cola de escritura y el plazo de sellado pendiente.
Una excepción de programación sigue propagándose y también conserva la
activa.

Al aceptar, cancela el timer anterior antes de emitir, asigna el candidato,
incrementa la revisión una vez y encola su escritura con el CAS existente.
Hay una sola notificación y ningún snapshot vacío entre ambas partidas.
`start(event)` conserva su contrato estricto: con una activa lanza; mientras
hidrata devuelve `false`. Sin activa, ambas formas arrancan normalmente.

Los cinco consumidores usan la misma operación:

- `src/components/play/setup-form.tsx`.
- `src/components/play/mtg-mode-chooser.tsx`.
- `src/components/play/remembered-table-card.tsx`.
- `src/components/play/score/score-preset-chooser.tsx`.
- `src/components/play/score/score-setup-form.tsx`.

Los tres consumidores de Magic recuerdan la mesa después de la aceptación.
Todos navegan al tablero después de la aceptación. El rechazo conserva
también las preferencias y los registros guardados, incluidos sus campos
`syncStatus`, `deletedAt`, `savedAt` y resumen.

## Reproducción y pruebas duraderas

`src/components/play/game-start.test.tsx` monta los cinco componentes con
su hook y store reales. Introduce un setup sin participantes en la frontera
`playTools.init`, conservando el inicializador real; el reducer real produce
el rechazo. Cada consumidor se verifica con `anon` y un UID sintético,
rechazando y aceptando: 20 casos. Comprueba memoria, IndexedDB, revisión,
notificaciones, navegación, mesa recordada, preferencias e historial previo.
Las llamadas de habituales remotos y la navegación están aisladas de red.

`src/lib/play/core/store.test.ts` añade 12 casos del contrato: Magic con un
participante, Puntuación con target cero y evento distinto de `game_started`,
en ambas identidades; preservación del plazo de ráfaga original; reemplazo
entre herramientas; arranque estricto; slot vacío; hidratación; excepción de
programación y aislamiento de otra identidad con partida propia. IndexedDB
se verifica mediante `fake-indexeddb`; estos casos no requieren Auth ni datos
remotos.

`e2e/ci/atomic-game-start.spec.ts` aporta dos recorridos anónimos sin mocks,
uno con «Jugar ya» y otro con «Empezar» de Puntuación. Parte de Magic con una
vida modificada, verifica la conservación al configurar y volver, sustituye
con un solo incremento de revisión y comprueba la recuperación al recargar.
Cada caso usa el contexto propio de Playwright. La configuración CI recoge
el spec automáticamente y ejecuta contra build/start. **Los dos recorridos
pasan en la QA local conjunta**, sin reintentos.

## Evidencia

Runtime: Node **24.19.0**, ejecutable
`C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.
Todos los comandos se ejecutaron en el worktree `start964`, con ese Node.

| Check | Resultado observado | Evidencia |
|---|---|---|
| Rechazo antes del arreglo, filtrado a `conserva anon` | **FAIL: 5 fallos / 15 casos fuera del filtro**, 2,51 s. Los cinco reciben `game: null` en lugar de la activa anterior | `.scratch/atomic-start-964/red-callers.log` |
| Store + cinco consumidores + test existente de SetupForm | **PASS: 79/79, 3 archivos, 0 FAIL / 0 SKIP**, 10,16 s | `.scratch/atomic-start-964/green-final.log` |
| Tipos iniciales | **FAIL**: dos usos del argumento `exact`, no admitido por `getByRole` en el test nuevo. Se retiraron; la coincidencia por nombre es exacta por defecto | `.scratch/atomic-start-964/typecheck.log` |
| Tipos finales, incluido el traslado del spec a CI | **PASS**, `tsc --noEmit --incremental false`, exit 0 | `.scratch/atomic-start-964/typecheck-final.log` |
| ESLint de los nueve archivos TS/TSX modificados o nuevos | **PASS: 0 errores; 2 warnings preexistentes** de `_playerId` / `_userId` en `score-setup-form.tsx:137`, confirmados en la base | `.scratch/atomic-start-964/lint-final.log` |
| Whitespace del diff | **PASS**, `git diff --check`, exit 0 | Inspección del diff local |
| Chromium contra build/start | **PASS: 2/2** recorridos permanentes de #964, dentro de 14 native PASS / 0 FAIL / 0 SKIP / 0 flaky / 0 reintentos | `integration-1790939949423/playwright.json`, copia sellada de la QA conjunta |

Comando de los unitarios:

```text
node node_modules/vitest/vitest.mjs run src/lib/play/core/store.test.ts src/components/play/game-start.test.tsx src/components/play/setup-form.test.tsx --maxWorkers=1 --no-file-parallelism
```

Comando para reproducir los recorridos, con el entorno local ya provisionado para CI:

```text
node node_modules/@playwright/test/cli.js test --config playwright.ci.config.ts e2e/ci/atomic-game-start.spec.ts --workers=1 --retries=0
```

Artefactos interpretables conservados en scratch ignorado:

| Artefacto | SHA-256 |
|---|---|
| RED del comportamiento anterior | `3C71698C886F3FC785E8171FB09F1C6494ED231253E7C8321039476FF4D6385F` |
| Copia del test de reproducción anterior al arreglo | `7D0FB8C2DA28A810AC0436481E5E49D57A2AD1A7D4E1A55183CC4F2D2504C8DA` |
| PASS final de unitarios | `42D186A097F701B6436FA6EE739ADE9C0F01F664AAB293006182A746D527957A` |
| FAIL inicial de tipos | `6F42AF1D59876FAEB0FABE0E2FE51B611AD37CFB7560F0AFD96A51B85BE08353` |

### QA conjunta

`integration-1790939949423` ejecutó los dos recorridos de #964 y los doce de
#995 sobre el build nuevo `3vVLat3xvkVOXhUZ7q3XJ`, de las fuentes indicadas
arriba: **14 native PASS**, en **19,838 s**. Pasan también los **245 unitarios
en 11 archivos**, TypeScript y ESLint de 19 archivos (dos warnings preexistentes).
La revisión independiente del store no encontró hallazgos.

El resultado global de esa tanda conserva **FAIL** por el helper suplementario
de contraste. La recuperación ejecutó sólo ese helper sobre el mismo build;
no repitió estos recorridos ni los unitarios. La identidad del build, los
hashes sellados y el límite local de analítica se detallan en el
[reporte de #999](2026-10-02-seat-text-contrast-999.md#verificación-integrada-y-recuperación).

## Límites y entrega

El UID de unitarios comprueba el aislamiento por clave, sin iniciar sesión
real. El navegador verifica el actor anónimo; no hay prueba de login en este
lote. La persistencia mantiene su degradación a memoria cuando
IndexedDB no está disponible y su arbitraje CAS entre pestañas. La aceptación
sincrónica del candidato no implica que una escritura asíncrona ya haya
aterrizado.

La QA de este alcance está completada en local. El spec pertenece a `e2e/ci/`,
pero esta evidencia no acredita una ejecución remota de CI ni entrega mediante
PR. La aceptación del candidato y esos gates pertenecen a la entrega principal;
este informe no afirma que se haya reconstruido ni verificado un commit posterior.
