# #1110 — lecturas previas al guardar pases

> **[Canónico · verificado contra código y unitarios locales el 2026-10-01]**

## Resultado

Si falla la lectura de fechas de `savePassFields`, el cierre/edición devuelve
`{ error: "generic" }` antes de escribir. Si falla la lectura de la reseña
previa de `updatePass`, se devuelve el mismo estado antes de leer las fechas,
guardar o calcular menciones. No se notifica ni se revalida en ninguno de
esos caminos.

La reseña permanece antes del guardado para comparar sus menciones con las
nuevas. Las reglas de fechas, reseña spoiler, ausencia de fila y lectura
correcta se conservan. Un resultado vacío sin error tiene su contrato previo;
el guard distingue el fallo de consulta, no cambia el tratamiento de ausencia.
La API de [maybeSingle](https://supabase.com/docs/reference/javascript/maybesingle)
admite cero o una fila y devuelve `data` y `error` por separado.

Los consumidores `ClosePassSheet` y `PassDiary` ya mantienen el formulario
abierto cuando existe `state.error` y muestran `passes.errors.generic`.
Esto se comprobó leyendo sus ramas de cierre y presentación, sin añadir
copia, modificar componentes ni afirmar una prueba nueva de navegador.
No hay cambios de esquema, dependencias, caché ni datos productivos.

## Reproducción y regresiones

El cliente de prueba distingue el `select` de fechas del de reseña y del
`update`. Cada caso inyecta un error en una lectura concreta y exige estado
`generic`, cero actualizaciones, cero llamadas a `notifyMentions` y cero
llamadas a `revalidateReadingLog`. El caso de reseña exige además que sólo
se haya solicitado esa lectura.

Antes de añadir los guards, ambos casos devolvían `{}`: 14 pruebas pasaban
y 2 fallaban. Después pasan las 16 de acciones. El lote final añade los
11 casos de `get-passes.test.ts`, incluidos los errores/ausencia de #657.
Los casos existentes de acciones verifican la cronología de #729, reseña
spoiler y menciones nuevas/repetidas de #317.

## Entorno y controles

Node 24.19.0, Next 16.3.8 y Vitest 4.1.11. Base integrada:
`68b579707b8ec7191be9ced87568cae9e4752029`.

| Control | Dictamen | Evidencia |
|---|---|---|
| Baseline de acciones | FAIL: 14 PASS / 2 FAIL | Ambos fallos devuelven éxito pese al error de lectura |
| Acciones corregidas | PASS: 16 PASS / 0 FAIL | Mismos dos casos y regresiones existentes |
| Lote final acciones + lecturas | PASS: 27 PASS / 0 FAIL / 0 SKIPPED | 971 ms del proceso, un worker y sin paralelismo de ficheros |
| Lint de los dos ficheros | PASS | Exit 0, sin avisos; 2.089 ms |
| TypeScript completo | PASS | Exit 0; 3.680 ms |

Comandos del lote final:

- `node node_modules/vitest/vitest.mjs run src/lib/passes/actions.test.ts src/lib/passes/get-passes.test.ts --maxWorkers=1 --no-file-parallelism --reporter=json --outputFile=<salida>/vitest.json`.
- `node node_modules/eslint/bin/eslint.js src/lib/passes/actions.ts src/lib/passes/actions.test.ts`.
- `node node_modules/typescript/bin/tsc --noEmit`.

## Artefactos y límites

Raíz local ignorada: `.scratch/ticket-campaign/qa1110/`. El baseline y la
primera corrección viven en `red-1790869000000/` y `green-1790869000000/`,
con sus logs y resultados. Ese sufijo es un identificador fijo de ejecución;
las fechas reales constan en los logs y JSON. Los primeros controles estáticos
sólo tienen JSON con el exit code; el lote final captura también su salida.

`final-1790870432395/` conserva `vitest.json`, los tres logs y `results.json`,
incluidos los recuentos reales. `evidence-final.json` registra SHA-256 de
fuentes, documentos y resultados. Se conserva el FAIL interpretable inicial.

La reproducción confirma la sospecha de #1110 con un cliente controlado.
No demuestra una avería real del servicio ni daño previo en producción.
No se levantó servidor ni se crearon usuarios o filas para estas pruebas.
