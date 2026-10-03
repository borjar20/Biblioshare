# Cobertura de puntuación por rondas (#965)

> **[Histórico · congelado el 2026-10-02]**

Base de trabajo: `e4d65dd`, con #964, #995 y #999 integrados. Se añaden
13 casos unitarios y se refuerza el recorrido existente de editar/deshacer.
No se modifica el producto, el esquema ni la configuración.

El gate nativo posterior usó el candidato `f7c0ac25` y el build descrito más
abajo. Antes de publicar, la rama se actualizó por fast-forward a
`888da33e031c9050a93425625236ee7174809f38`; los siete archivos de cobertura
conservaron sus hashes. Se repitieron únicamente lint y tipos sobre esa base,
sin repetir unitarios, mutantes ni navegador.

## Contrato cubierto

| Hueco de #965 | Prueba permanente |
|---|---|
| Registro de score ante un evento ajeno/desconocido | `src/lib/play/tools.test.ts`: `life_changed` y un evento futuro devuelven la misma referencia `UNKNOWN_EVENT_DESCRIPTION`. |
| Empate en `lowest` | `src/lib/play/score/selectors.test.ts`: dos rondas producen ranking completo por asiento, totales 4/4/11 y posiciones 1/1/3. |
| Éxito en los límites de jugadores | `src/lib/play/score/reducer.test.ts`: exactamente 2 y 8 jugadores pueden iniciar, puntuar y terminar. |
| Target negativo | Mismo fichero: rechaza -1 tanto en rondas como en puntos. |
| Prefill de revancha | `src/components/play/score/score-setup-form.test.tsx`: snapshot `loading` en el primer render y `ready` después; la mesa terminada reemplaza los valores de la URL. Se comprueban nombres, dirección, target y etiqueta en los controles reales y en el setup enviado al motor. |
| Simetría al editar/deshacer | `e2e/partidas-puntuacion.spec.ts`: edita R2 a `[14, -4, 7, 0]`, exige totales `[22, 1, 14, 2]` y, tras deshacer, `[12, 11, 8, 4]`. Cambian los cuatro asientos. |

El test de componente también cubre la reconfiguración de una partida activa
ya hidratada y la edición posterior de nombre/dirección/target/etiqueta;
revancha sin target ni etiqueta; snapshot vacío o de Magic; y configuración
nueva sin flag de revancha. Conserva las identidades de usuario y habitual,
y una edición del nombre de un habitual lo convierte en invitado.

La cobertura previa ya comprobaba reconfigurar un nombre en el navegador.
Ese caso no comprobaba la revancha terminada, la hidratación posterior al
primer render ni las demás opciones de la mesa.

## Fronteras de la prueba de componente

Se simulan router, snapshot del store y lecturas/escrituras locales. Son reales
`ScoreSetupForm`, `useActiveGame` (incluida la suscripción externa), `usePlayers`,
los controles de asiento/límite, traducciones, creación de eventos y replay.
El snapshot se publica después del montaje; no se remonta el formulario para
simular hidratación. El comando emitido se acepta además con
`initialScoreState`, que comienza sin las rondas anteriores.

Las pruebas no validan persistencia en IndexedDB, sincronización, auth ni
enrutado real. No crean usuarios ni modifican las cuentas persistentes.

## Ejecuciones locales

Node explícito: `C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`,
versión `v24.19.0`. Todos los comandos completos, salidas, JSON de Vitest y
hashes están en `.scratch/score965/`, indexados por `public-manifest.json`.
`check.mjs` lanza el mismo ejecutable de Node y conserva código de salida,
duración y log de cada pasada.

| Check | Resultado |
|---|---|
| Baseline unitario de registro/reducer/selectores | PASS: 42 pruebas, 3 ficheros. |
| Unitarios focales finales, incluido el componente | PASS: 55 pruebas, 4 ficheros; 0 FAIL, 0 SKIP. |
| ESLint de los cinco ficheros de tests modificados/añadidos | PASS: 0 diagnósticos. |
| `tsc --noEmit --incremental false` final | PASS: 0 diagnósticos. |
| Playwright `test e2e/partidas-puntuacion.spec.ts --list` | PASS de descubrimiento: 8 tests. No ejecuta el navegador. |
| Punto de entrada `e2e/ci/score-coverage.spec.ts` | Importa la misma suite; configuración CI descubre los 8 casos, sin duplicar assertions. El gate nativo posterior ejecutó esos 8 casos; resultados separados abajo. |
| ESLint previo a publicación, incluidos los seis ficheros de tests | PASS: 0 diagnósticos tras corregir el glifo negativo del helper. |
| `tsc --noEmit --incremental false` previo a publicación | PASS: 0 diagnósticos sobre la base `888da33e`. |
| `git diff --check` | PASS. |
| Hashes de ficheros de producto bajo `src/`, excluidos tests | PASS: 1.274 comprobados, 0 cambios. |

Comandos para reproducir los checks permanentes, anteponiendo el Node indicado:

```text
node_modules/vitest/vitest.mjs run src/lib/play/tools.test.ts src/lib/play/score/reducer.test.ts src/lib/play/score/selectors.test.ts src/components/play/score/score-setup-form.test.tsx --maxWorkers=1 --no-file-parallelism
node_modules/eslint/bin/eslint.js src/lib/play/tools.test.ts src/lib/play/score/reducer.test.ts src/lib/play/score/selectors.test.ts src/components/play/score/score-setup-form.test.tsx e2e/partidas-puntuacion.spec.ts e2e/ci/score-coverage.spec.ts
node_modules/typescript/bin/tsc --noEmit --incremental false
node_modules/@playwright/test/cli.js test e2e/partidas-puntuacion.spec.ts --list
```

La primera pasada de tipos encontró cuatro usos de `exact` en selectores
`getByRole` de Testing Library: esa opción pertenece al locator de Playwright.
Se retiró de los tests, manteniendo el nombre exacto por defecto, y la pasada
final pasó. El FAIL interpretable se conserva en `typecheck.log` y
`typecheck.command.json`; no era un fallo de la aplicación.

Los checks de publicación se conservan en
`lint-publication-1790946338063.{command.json,log}` y
`typecheck-publication-1790946338063.{command.json,log}`. La copia previa de
los siete archivos y `files-before.json` están en
`.scratch/score965/publication-1790946338063/`; no se sobrescriben las
evidencias anteriores.

## Gate nativo contra build/start local

La campaña conjunta de #1306, #1311 y #965 ejecutó los specs permanentes en
Chromium contra un único build de producción con Turbopack y Supabase local
desechable. El build es `1ZoZ14Zb9TbyLBvQW8yRJ`, creado desde `f7c0ac25`;
el hash de `server-reference-manifest.json` es
`e2c6b91cac181c68f0b2d848826c3f012153c926d31be60a1091790a02aae5b7`.
La recuperación reutilizó ese mismo build, sin reconstruirlo.

El runner conserva las assertions de los specs nativos. Las copias ajustan
solo los imports del fixture de observación y la ruta del soporte de
IndexedDB; `spec-copy-proof.json` registra cada sustitución y sus hashes.
No hay interceptación de rutas, mocks ni aislamiento de Speed Insights.
Un override de root/tracing acomoda la junction de dependencias; mantiene
el candidato, los alias y Turbopack.

| Pasada | Resultado de puntuación | Resultado conjunto |
|---|---|---|
| Original, `integration-1790944752297` | 8 descubiertos y ejecutados: 7 PASS, 1 FAIL; 0 SKIP, 0 retry. | 11 casos: 9 PASS y 2 FAIL. El otro FAIL corresponde al guard de #1306. |
| Recuperación, `recovery-1790945845299` | Solo el caso «partida completa: preset, 3 rondas, editar, deshacer, finalizar, guardar»: PASS. Los otros siete casos de score no se repiten. | 2 PASS, 0 FAIL, 0 SKIP, 0 retry: un score y el guard de #1306. `nativeStatus=PASS`, `globalAuditStatus=FAIL`. |

El FAIL original de score esperaba `-4` (signo ASCII) mientras el control
real mostraba `−4` (U+2212). Se corrigió únicamente el texto esperado del
helper `ponerPuntos`: los valores negativos usan `−` y la comparación sigue
siendo exacta. El spec original tenía SHA-256
`013d25f99393cbad10084b19e124ca74cdbdc30379e0b9f3a1e40efc98f76075`;
el spec corregido y recuperado tiene
`022db7b57b766db1cb6539cb44d78d28e5eab2deecdbfefbc705b3a4faef9141`.
No se cambió el producto ni se debilitó la aserción de los cuatro totales.

La recuperación no convierte el gate global en verde. Su auditoría observa
un GET RSC a `/partidas/puntuacion` abortado con `net::ERR_ABORTED`, sin
marcador de prefetch, clasificado `UNCLASSIFIED`. Conserva ese FAIL sin
atribuirlo a una cancelación inocua; su seguimiento vive en [#1301](https://github.com/borjar20/Biblioshare/issues/1301).
Registra cero errores de página,
consola y HTTP; las peticiones abortadas siguen visibles en
`browser-summary.json`. No se afirma que los ocho casos pasaran juntos
después de la corrección ni que toda la red esté limpia.

La limpieza de ambas pasadas es PASS. En la recuperación no se crearon
actores, fixtures ni escrituras de base de datos; los recuentos globales de
Auth, sesiones, cuotas y tablas verificadas coinciden antes y después.
Las cuentas persistentes de desarrollo quedan fuera de estas pruebas.

Los artefactos públicos están archivados desde la raíz del repo en
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/`, bajo las dos
carpetas indicadas. El FAIL original se conserva además sellado en
`native-fail-seal.json` antes de la corrección del helper.

| Evidencia archivada | SHA-256 |
|---|---|
| Original `manifest.sha256.json` | `2dec9fd2d7ef6c58f575fd600a3142f26cded0b792a54c1d253f89a80557c02e` |
| Original `result.json` | `d424cdb7bafa40c9933476838ff0f6a2d71f65cadfa7e4e32195112105883931` |
| Recuperación `manifest.sha256.json` | `6f43f480db328b4cda1a6ef1d54b1343784d9182a6d43951e5d660f115ddd367` |
| Recuperación `result.json` | `c8f6e68f15ec0190ca820066961fe5dfd10fc6849c47683812891d7e2d4d0792` |

## Sensibilidad y conservación del producto

11 mutaciones independientes de carga produjeron los FAIL esperados en los
casos nuevos. Un plugin de Vite sustituye en memoria un único módulo por
pasada, partiendo siempre de su fuente original. No escribe el producto.
Cada artefacto `mutation-final-*.applied.json` guarda los hashes del original,
del mutante y del test; cada `.vitest.json` conserva la aserción que falla.

| Mutación | Detección |
|---|---|
| Omitir la guarda del evento desconocido de score | 2 FAIL: fallback indefinido. |
| Dar posición distinta a los empates de `lowest` | 1 FAIL: ranking 1/2/3 en vez de 1/1/3. |
| Excluir 2 jugadores | 1 FAIL: rechaza un setup admisible. |
| Excluir 8 jugadores | 1 FAIL: rechaza un setup admisible. |
| Admitir target -1 al rechazar solo cero | 2 FAIL: rondas y puntos. |
| Quitar el snapshot de las dependencias del prefill | 1 FAIL: conserva los 8 asientos del primer render en vez de los 3 hidratados. |
| Perder identidad de usuario | 1 FAIL: el setup emitido convierte usuario en invitado. |
| Perder identidad de habitual | 1 FAIL: el setup emitido convierte habitual en invitado. |
| Forzar dirección `highest` | 1 FAIL: dirección visible incorrecta. |
| Quitar el target de la revancha | 1 FAIL: selección visible incorrecta. |
| Quitar la etiqueta de la revancha | 1 FAIL: desaparece el juego prefijado. |

Resumen final: `mutation-final-summary.json`, 11/11 KILLED por fallos
interpretables de las pruebas previstas. Los SKIP en esas pasadas corresponden
al filtro `-t`; no cuentan como ejecución de la suite completa. El control
unitario verde se ejecuta sin ese filtro. No se atribuye sensibilidad de
navegador a estas mutaciones.

## Límites de entrega

El navegador verifica build/start local y Supabase desechable, sin validar
producción ni las cuentas persistentes de dev. La revancha tras hidratación
se cubre con el componente y el motor reales, dentro de las fronteras
simuladas descritas arriba. No se atribuye a los mutantes sensibilidad del
navegador. El fallo global de auditoría conserva su evidencia y queda fuera
de la corrección del helper de #965. La CI remota y la integración del PR
son gates posteriores; no forman parte de estas pasadas históricas.
Los checks de cobertura no descubrieron un bug del producto.
