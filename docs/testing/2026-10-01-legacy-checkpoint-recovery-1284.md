# #1284 — recuperación explícita de checkpoints anteriores

> **[Canónico · verificado contra código, unitarios y build/start local el 2026-10-01]**

## Comportamiento

Un checkpoint válido del formato anterior carece de `ended`. Si su
reproducción sigue abierta, se recupera en pausa y muestra: «Hemos recuperado
tu combate guardado. Tus decisiones se conservan. Pulsa Continuar para
retomarlo o completar el resultado».

Salir o recargar antes de continuar conserva la ausencia de la marca y el
aviso en la siguiente recuperación. La acción existente «Continuar» consume
ese estado y guarda inmediatamente el formato actual, con el mismo intento,
tick e inputs. No se crea otra partida ni se elimina el historial. En un
interludio se mantiene su botón existente para continuar al siguiente tramo.

No se infiere un final a partir del tick ambiguo. Si la reproducción antigua
ya demuestra un final, sigue el camino de resolución existente. Los nuevos
checkpoints con `ended` y los logs corruptos conservan sus contratos; la
ausencia de la marca por sí sola no constituye LOCAL_RECOVERY.

El aviso vive fuera de la fila flex de playback, para que el texto no compita
con «Continuar» y el selector de velocidad en móvil. El cambio no requiere
migración: la información ausente está en localStorage del navegador. Los
motores y manifiestos históricos permanecen congelados.

## Verificación comprobada

Base main `2990bf1f19d7d0c75f80dde0f50339ff53e7c6a5`. El lote final y el
build usan el ejecutable explícito de Node 24.19.0 del runtime de Codex,
Next 16.3.8 y Vitest 4.1.11. Supabase de QA es el entorno local desechable;
las claves y credenciales no se guardan en los artefactos.

| Control | Resultado |
|---|---|
| RED de sesión | 52 PASS / 1 FAIL: `legacyCheckpoint` era undefined antes del cambio |
| GREEN final de sesión/panel/errores | 81 PASS / 0 FAIL / 0 SKIPPED, tres archivos reales |
| TypeScript | PASS, exit 0 |
| Lint focalizado | PASS, exit 0; un aviso preexistente `_equipment` en el test |
| Build local de producción | PASS, 20,201 s; BUILD_ID `5zWQcIib40_Fv0qONCEcw` |
| Navegador candidato | PASS: 10 PASS / 0 FAIL / 0 SKIPPED / 0 flaky; 44,445 s de Playwright, sin retries |
| E2E durable final | PASS: 2 PASS / 0 FAIL / 0 SKIPPED / 0 flaky; 7,681 s de Playwright, sin retries; lint/TypeScript PASS |
| Auditoría agregada de limpieza | PASS: nueve actores Auth 404 y ocho superficies a cero; servidor propio cerrado |

Los unitarios comprueban recuperación abierta sin avance automático,
persistencia del aviso tras guardar y restaurar otra vez, normalización al
continuar, un final real r2.2 con inputs no vacíos e intento/vista conservados,
interludio, marcas modernas true/false y corrupción. El panel real comprueba
el texto del aviso y su desaparición al continuar. Las siete suites que
declara Vitest incluyen bloques describe; no son siete archivos.

Se conservan el RED y un GREEN intermedio anterior a dos ajustes finales:
guardar al reanudar únicamente un checkpoint antiguo y sacar el aviso de la
fila rígida de playback. El lote final corresponde a las cinco huellas
indicadas debajo. No se suman las pasadas intermedias al total final.

## Navegador, regresión y límites

La primera ejecución `prod-1790880312645/` queda preservada como FAIL de
preparación: el reloj pausado antes del login bloqueó la visibilidad del
formulario. Hay cinco contextos móviles de timeout de login; la ejecución
se interrumpió y no produjo un JSON nativo final. No se inventa un total
global PASS/FAIL/SKIP ni se usa `cases: 0` del wrapper como recuento de tests
realmente ejecutados. No acredita un fallo de recuperación ni una prueba
funcional correcta. Se conserva también el spec original y se ajusta sólo
el Clock del harness para pausar después de mostrar el panel.

La pasada final `prod-1790880859644/` ejecuta cinco escenarios en 375×844 y
1280×900: abierto antiguo, final r2.2 antiguo, abierto moderno, final moderno
y LOCAL_RECOVERY. Su JSON nativo confirma diez casos completos, sin omitidos,
flaky ni retries. Build y fuentes son idénticos antes/después.

El abierto antiguo conserva tick e input de habilidad, incluso al salir y
volver al Campamento y al recargar. El aviso permanece y no hay avance en
tres segundos de reloj. Continuar consume el aviso, escribe el formato
moderno inmediatamente y sólo entonces permite el siguiente tick, con la
misma fila remota abierta. El final antiguo r2.2 se juega en navegador con
una habilidad real; se pierde la sesión al resolver, se elimina únicamente
`ended` del log propio y se vuelve a autenticar. Tras restaurar y continuar,
un tick normal completa el final, sin otra pulsación ni otra intención.

Los dos finales antiguos y los dos modernos conservan una única fila,
intención e inputs. Resultado y digest coinciden con `replayBattle` real.
La comparación de resultados es estructural: JSONB puede reordenar claves,
por lo que comparar dos strings JSON no demuestra diferencia semántica.
El control independiente `root-native-check-1790881491032.json` verifica los
cuatro resultados reales, diez casos nativos y las cinco fuentes del lote.

Las capturas muestran aviso y controles legibles en ambos tamaños; siete
PNG fueron revisados por QA y el coordinador comprobó los dos avisos abiertos.
Los diez casos tienen cero errores de página y cero desbordamiento. Se
conservan 54 mensajes locales de consola (27 pares 404/MIME de Speed Insights)
y 54 abortos de navegación, no se afirma cero errores de consola. Gzip y
destination-stream a cero no cierran #1251/#1263.

La auditoría local acotada a los markers propios recupera seis UUID de
workers de preparación, uno del lote de diez casos y dos de las ejecuciones
durables: nueve ausentes de Auth y ocho superficies vacías. No modifica
cuentas persistentes. Tracing desactivado, claves sólo en memoria y puerto
3000 libre después de cada ejecución.

La regresión durable añade a `e2e/ci/training-errors.spec.ts` un caso por
viewport, 320/1280, sin alterar los doce anteriores. Restaura una fixture
r2.2 normativa en el tick terminal ambiguo; exige aviso/pausa, conservación
tras recargar y el resultado/digest real de la misma intención después de
la acción existente. Instala Clock antes del login, lo congela al mostrar
la interfaz y lo reanuda antes de cada recarga. La pasada final
`durable-1790881992031/` confirma dos casos completos, 320/1280 px, sobre
el mismo build, fuentes y SHA del spec antes/después. Son dos ejecuciones
adicionales de esa regresión, no diez casos atribuibles al spec durable.

Se conserva `durable-1790881735096/`: 0 PASS / 1 FAIL / 1 SKIP, con
`maxFailures=1`, sin retries. `pauseAt` recibía la hora de Node tras avanzar
500 ms el reloj virtual y rechazaba viajar al pasado. Las tres llamadas
usan ahora `page.evaluate(() => Date.now() + 100)`; no se cambia el producto
ni se debilitan las aserciones. El snapshot 7e37 del spec fallido se conserva.

El interludio está cubierto por unitarios; no se atribuye un recorrido
completo de navegador de aventuras. No se afirma aceptación en producción
remota ni en otros navegadores.

## Evidencia y huellas

Raíz ignorada `.scratch/ticket-campaign/qa1284/`:

- `author/red-1790878736975/{result.json,output.log}`: RED nativo conservado.
- `author/green-1790878884120/`: GREEN intermedio conservado.
- `author/green-1790879366194/`: `vitest.json`, lint, tsc y manifiesto final.
- `qa/build-1790879987439/`: build, salidas, BUILD_ID y fuentes antes/después.
- `qa/prod-1790880312645/`: FAIL de preparación, contexto y limpieza propios.
- `qa/prod-1790880312645/legacy-checkpoint.source.ts`: spec original, SHA
  `df698126b7f29a17a5f7c26174bd5f45b1ff71785580a4c1b2bd020764d331fe`.
- `qa/prod-1790880859644/`: JSON nativo, observaciones, capturas y limpieza final.
- `qa/evidence-final.json`, `qa/evidence-sha256.json`: cierre de QA y 67 huellas.
- `qa/evidence-with-durable.json`, `qa/evidence-sha256-with-durable.json`:
  cierre conjunto, nueve actores y 95 huellas, conservando el anterior.
- `durable/1790881206092/`: primera preparación estática del E2E, conservada.
- `durable/1790881374853/`: lint/typecheck de la versión anterior del E2E.
- `durable/1790881913040/`: lint/typecheck del E2E con el reloj corregido.
- `qa/durable-1790881735096/`: FAIL nativo y snapshot del spec anterior.
- `qa/durable-1790881992031/`: dos casos durables finales, nativos y limpieza.

El spec durable final tiene SHA-256
`d75ab52f57025f23ab584b889e62c68a362a34c28f2d18002ba4527f42deaca9`.
`evidence-integrated.json` sella las fuentes, documentación y evidencia de
la entrega; los dos FAIL y el manifiesto original permanecen separados.

Las fuentes del build coinciden antes y después con el lote final:

| Archivo | SHA-256 |
|---|---|
| `src/components/pet/training/training-session.ts` | `3187dc92d6a860065e3f96b40059ed233360fb5fa1fb31ec7c1956484709ccfb` |
| `src/components/pet/training/training-session.test.ts` | `93244516dff1118511728137a2ef64f5f80f4ec153ab58c6a03ed2793c7ad209` |
| `src/components/pet/training/training-panel.tsx` | `ffe9d683b42f5950ea6fcc8c04c57d5436df424b936a0cff81e73ac5064a87a4` |
| `src/components/pet/training/training-panel.test.tsx` | `c8fd3f32133a5b746b11610678425c145013f8396de93286183e829a469677e3` |
| `messages/es.json` | `9092e82bcf43f216406f1cd4374728b642f509976fdd7e1ce01ab308ab8c921f` |
