# #1281 — recuperar un combate ya terminado

> **[Canónico · verificado contra código y build/start local el 2026-10-01]**

## Resultado y alcance

El adaptador local guarda `ended` junto a `inputs`, `tick` y
`awaitingContinue`. Los motores dejan el tick T al marcar su final, antes
de incrementarlo; el checkpoint marcado como terminado reproduce también
esa frontera y entra en resolución sin pedir otro paso de juego.

La marca debe ser booleana y, si es true, la reproducción debe alcanzar
un final real. De lo contrario se conserva la recuperación LOCAL_RECOVERY.
Los abiertos e interludios de aventura mantienen la pausa. Los motores,
manifiestos, almacenamiento remoto y copia de interfaz no cambian.

Los logs del formato anterior, sin marca, siguen válidos y pausados:
no distinguen un final pendiente de la vista abierta justo anterior.
Una regresión con habilidad real conserva intento/inputs y demuestra
que un «Continuar» aún reconstruye su final. El tratamiento explícito de
ese límite queda abierto en [#1284](https://github.com/borjar20/Biblioshare/issues/1284).
No se presenta como solucionado para los checkpoints antiguos.

## Verificación local

Node 24.19.0, Next 16.3.8, Vitest 4.1.11 y Playwright 1.61.1/Chromium.
Base main `128db008bab57162b84d32afb49e32b468dcba06`; Supabase desechable
`http://127.0.0.1:54321`, con claves sólo en memoria. Baseline sobre build
`Tdr0cRN-uPSRb23R4K0TF`; candidato `anXbXwrsAUwKALk10uz3K`.

| Control | Dictamen | Evidencia |
|---|---|---|
| RED de sesión | FAIL: 41 PASS / 5 FAIL | Marca ausente en checkpoint abierto/interludio/final y marcador no booleano no rechazado |
| GREEN de sesión | PASS: 51 PASS / 0 FAIL | KO/límite, cuatro versiones, corrupción e interludio |
| Lote final de sesión/panel/errores | PASS: 79 PASS / 0 FAIL / 0 SKIPPED | 7.349 ms; incluye compatibilidad de un final antiguo con inputs no vacíos |
| Lint final | PASS | Exit 0; 2.178 ms; un aviso preexistente `_equipment` en el test |
| TypeScript final | PASS | Exit 0; 4.013 ms |
| Navegador baseline estricto | FAIL: 0 PASS / 2 FAIL | Ausencia de resultado tras una pulsación, fila open y último tick en pausa |
| Build candidato | PASS | 18,957 s; TypeScript y 73/73 páginas |
| Navegador candidato | PASS: 2 PASS / 0 FAIL / 0 SKIPPED / 0 flaky | 20,830 s de Playwright; final por límite y KO |
| Repetición para captura completa | PASS: 2 PASS / 0 FAIL / 0 SKIPPED / 0 flaky | 20,901 s; mismos dos casos, sin otro build |
| Limpieza agregada | PASS | Cuatro actores Auth 404, ocho superficies a cero, puerto 3000 libre |

Los primeros RED incluyen aserciones sobre el formato, antes de comprobar
la fase recuperada, y una aserción inicial incorrecta sobre BattleView que
se corrigió. Se conservan las tres rutas RED. Los tests finales exigen
igualdad de toda la vista final recuperada, en vez de quedarse en comprobar
la presencia de la marca. El baseline de navegador reproduce directamente
el fallo funcional y se conserva íntegro.

Las pruebas de sesión ejecutan `save → nueva TrainingSession → restore`
para KO T=214 y límite T=600, luego resuelven con la respuesta autoritativa
controlada. Comprueban intent/seed/inputs y aceptación del digest; el digest
unitario es un valor de prueba. Las cuatro versiones r2.2/r3.1/r4.1/r4.2
reconstruyen la vista final. La comprobación criptográfica real pertenece
a los recorridos de navegador descritos a continuación.

## Navegador, capturas y limpieza

Se fortalece `e2e/ci/training-errors.spec.ts` en sus dos casos
`resolution-authentication`, 320×844 y 1280×900. Se mantienen cookies y
Server Actions reales, caducidad después de una habilidad y Clock instalado
antes del login. Después de volver y pulsar el primer «Continuar» se exige
resultado sin otra pulsación de playback ni avanzar de nuevo el reloj.

La fila sigue siendo única, con el mismo id/intent e inputs. El resultado
y digest guardados coinciden exactamente con `replayBattle` sobre esa fila.
El primer candidato cubre límite T=600 y KO T=585. La repetición se limita
a exponer el resultado completo en la captura full-page; las capturas de
móvil/escritorio muestran resultado y acciones legibles.

Hay cero `pageerror` y desbordamiento. Se conserva ruido local de Speed
Insights 404/MIME y abortos de navegación, también presentes en baseline;
no se afirma cero errores de consola. Gzip/destination-stream a cero no
cierra #1251/#1263. No se ejecutan por costumbre los otros diez casos del
spec, verificados anteriormente en #1171; CI sí recoge el spec completo.

Se limpia antes y después por REST. El barrido recursivo de los cuatro
actores de todas las pasadas comprueba Auth 404 y cero filas en `profiles`,
`pet_state`, `pet_battles`, `passes`, `pet_acorn_ledger`, `pet_cosmetics`,
`pet_daily_missions` y `user_celebrations`. No se utilizan ni eliminan
cuentas persistentes. Tracing desactivado en el harness; no se conservan
cookies, claves ni credenciales. El servidor propio termina y 3000 queda libre.

## Comandos y artefactos

- `node node_modules/vitest/vitest.mjs run src/components/pet/training/training-session.test.ts src/components/pet/training/training-panel.test.tsx src/components/pet/training/training-errors.test.tsx --maxWorkers=1 --no-file-parallelism --reporter=json --outputFile=<salida>/vitest.json`.
- `node node_modules/eslint/bin/eslint.js src/components/pet/training/training-session.ts src/components/pet/training/training-session.test.ts e2e/ci/training-errors.spec.ts`.
- `node node_modules/typescript/bin/tsc --noEmit`.
- `node .scratch/ticket-campaign/qa1281/run.mjs baseline|build|prod`.

Raíz ignorada `.scratch/ticket-campaign/qa1281/`: RED
`red-1790869001000/`, `red-revised-1790869002000/` y
`red-final-1790869003000/`; GREEN ampliado hasta
`green-final3-1790869010000/`. Sus sufijos son identificadores fijos, no
fechas; las horas reales están en los logs. Lote final
`final-units-1790872134980/`; el anterior 78 PASS se conserva separado.

Baseline `baseline-1790871564869/`, build `build-1790871738618/`,
candidato `prod-1790871791231/` y capturas finales
`prod-1790871922046/`. Seis ejecuciones de navegador en total: cuatro PASS
y dos FAIL esperados, cero omitidos/flaky. `evidence-final.json` recoge la
QA, `evidence-sha256.json` sus hashes, `cleanup-all.json` la limpieza, y
`evidence-integrated.json` las fuentes, documentación y evidencia integrada.
No se atribuye aceptación en producción remota ni otros navegadores.

## Continuidad posterior: formato anterior (#1284)

El límite indicado en el alcance de esta entrega recibe después un
tratamiento explícito en #1284: aviso de recuperación y continuación con
la acción existente, manteniendo pausa, intento e inputs. Salir/volver antes
de continuar conserva el aviso; no se adivina el final de un tick ambiguo.
El paso adicional del formato antiguo sigue siendo una elección necesaria
por la información ausente, ahora explicado al usuario.

La entrega posterior verifica 81 unitarios y diez recorridos reales contra
un build nuevo, incluidos final r2.2 y resultado/digest de la misma fila.
Estos resultados no sustituyen los 79 unitarios, baseline FAIL ni capturas
de #1281 conservados arriba. Evidencia:
[recuperación del formato anterior](2026-10-01-legacy-checkpoint-recovery-1284.md).
