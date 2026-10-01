# #1116 — resultados históricos de combate

> **[Canónico · verificado contra código y pruebas locales el 2026-10-01]**

## Resultado y alcance

`BattleRelease.replay` y `replayBattle` comparten una unión explícita de
éxito/error. `ReplayBattleResult` mantiene los campos comunes del resultado
y declara `fight?: number`: r2.2/r3.1 no lo tenían, mientras que r4.1/r4.2
lo incorporaron para las cadenas. `TrainingBattle.result` y
`Adventure ResolveInput.result` usan el mismo contrato.

Los adaptadores r2.2/r3.1 devuelven directamente sus resultados. Se eliminan
los casts de retorno que prometían un campo posterior; permanecen los casts
de entrada necesarios para seleccionar los tipos de cada motor conservado.
El input almacenado admite el mismo resultado histórico opcional/nulo.

No se fabrica `fight`, no se transforma ningún registro ni payload y no se
cambian eventos, snapshots, digest, código congelado o manifiestos. El
resultado actual dentro de los motores sigue exigiendo su propio campo.
La selección por versión y hash, la validación y la ausencia de fallback
permanecen iguales. La corrección elimina una promesa falsa de TypeScript;
no se ha observado un daño de usuario causado por una lectura de ese campo.

## Reproducción y regresiones

Dos assertions exigen que `fight` del éxito de `replayBattle` y de
`TrainingBattle.result` sea `number | undefined`. Antes de la corrección,
`tsc --noEmit` devuelve dos errores TS2344 porque ambos contratos lo
declaraban obligatorio. Vitest transpila TypeScript: pasar los unitarios
por sí solo no verifica esas assertions, por eso el typecheck es separado.

Los nuevos casos normativos r2.2/r3.1 comprueban exactamente resultado,
eventos y digest, y la ausencia de `fight`. El caso r4.2 comprueba el mismo
registro firmado con su campo presente. Las regresiones existentes cubren
payload no vacío de r2.2, snapshots inválidos, versión/hash desconocidos,
selección del motor original tras añadir contenido nuevo y contenido inmutable.

`releases.test.ts` verifica los hashes de todos los ficheros de las cuatro
versiones y sus imports ejecutables aislados. `training/historical.test.ts`
resuelve/repite R2 sin recurrir al validador actual. Los servicios de
entrenamiento y aventuras verifican sus contratos de resolución/reintentos.
Los digests normativos usan la repetición y SHA-256 reales, no un stub.

## Entorno y controles

Node 24.19.0, Vitest 4.1.11 y Next 16.3.8. Base integrada:
`762e6aef98fd2a386ffc6b0ab7c83b25028da778`.

| Control | Dictamen | Evidencia |
|---|---|---|
| Baseline de tipos | FAIL esperado | Dos assertions de `fight` opcional, exit 2 |
| Primera corrección | PASS | 38 casos de cuatro ficheros; types/lint exit 0 |
| Integración con servicio de aventuras | PASS | 46 PASS / 0 FAIL / 0 SKIPPED / 0 TODO en cinco ficheros; reporte nativo, 2.795 ms de proceso |
| Lint de cuatro fuentes modificadas | PASS | 0 errores / 0 avisos; 2.084 ms |
| TypeScript completo | PASS | Exit 0; 3.750 ms |

El lote final ejecuta:

- `node node_modules/vitest/vitest.mjs run src/lib/pet/battle/replay.test.ts src/lib/pet/battle/releases.test.ts src/lib/pet/training/historical.test.ts src/lib/pet/training/service.test.ts src/lib/pet/adventure/service.test.ts --maxWorkers=1 --no-file-parallelism --reporter=json --outputFile=<salida>/vitest.json`.
- `node node_modules/eslint/bin/eslint.js src/lib/pet/battle/replay.ts src/lib/pet/battle/replay.test.ts src/lib/pet/training/types.ts src/lib/pet/adventure/types.ts --format=json`.
- `node node_modules/typescript/bin/tsc --noEmit`.

## Artefactos y límites

Raíz local ignorada `.scratch/ticket-campaign/qa1116/`:

- `red-1790873393127/`: `result.json` y `tsc.log` con las dos assertions fallidas.
- `green-1790873551637/`: resultado, log de los 38 casos y logs de lint/types.
- `final-1790874540735/`: `vitest.json`, `eslint.json`, tres logs y
  `results.json` con comandos, duración y recuentos nativos. Los logs se
  conservan también cuando un control correcto no produce salida.
- `check.mjs`: ejecutor del lote final con el Node seleccionado.
- `evidence-final.json`: SHA-256 de fuentes, documentos y resultados.

El lote final amplía el inicial para cubrir el servicio de aventuras, cuyo
input también recibía el resultado del replay. La revisión independiente
comprueba esta propagación y la ausencia de cambios en releases congelados.
La documentación registra sólo el RED conservado: el diagnóstico intermedio
de integración de aventuras no tiene un log persistido separado.

No se levantó servidor, no se crearon actores o filas y no hubo cambios en
Supabase, dependencias o producción para verificar esta corrección de tipos.
No se atribuye a este lote una prueba nueva de navegador ni de red/CDN.
