# Controles de formulario visibles en CI — #1368

> Informe focal verificado el 2026-10-04. PASS local: 20/20 casos de navegador,
> revisión estática 32/32 y comprobaciones TypeScript/ESLint/diff. La CI final y
> la publicación conservan su gate propio.

La corrección de [#1368](https://github.com/borjar20/Biblioshare/issues/1368)
acota login y búsqueda al formulario que contiene el campo visible. Los campos
email/password y submit se restringen a controles visibles; Buscar queda dentro
del mismo formulario. El helper conserva **todos** los candidatos visibles:
dos formularios, campos o botones visibles siguen produciendo un error estricto.
No se añadieron `first`/`nth`, esperas, ampliaciones de timeout ni excepciones a
las aserciones existentes.

La base ejecutada es `1a72253c3631b3db9db5e61fdeb2b3cc6537eda0`, rama
`codex/ci-visible-form-controls-1368`, checkout `pushhealth1329`. Sólo cambian
los dos drivers, `e2e/support/visible-form.ts`, su spec durable y este informe.
Los 1.940 archivos de producto inventariados conservaron sus SHA-256 durante
build y ejecución.

## Diagnóstico y prueba causal

La entrada es el run CI `37218345996`, HEAD
`cc9c565496faf561aa6486e5a8e1558218b230b5`. Cuatro snapshots completos de
training contienen un email visible en el formulario principal y otro bajo
`div[hidden]#S:3/form`. Los dos errores de cuota encuentran dos `q`, pero el
snapshot accesible y la captura muestran una sola caja de búsqueda. Google no
retuvo trace: **no se atribuye un ancestro concreto al segundo `q` original**.

El control privado `run04-legacy-controlled-dom` comprueba el patrón de locator
original contra Chromium y el helper de la fuente actual: seis FAIL estrictos
esperados con el locator global, seis PASS del formulario visible y seis FAIL
estrictos esperados al hacer visibles ambos formularios. Los campos ocultos no
se rellenan ni reciben submit. Es DOM sintético, separado de los seis recorridos
reales de la aplicación; para Google su ancestro oculto es únicamente una
precondición del control.

## Ejecución acreditada

Node explícito 24.19.0, Next 16.3.8, Chromium y Supabase local existente
`biblioshare-local-eeaa203e` (`127.0.0.1:54321`). Build de producción nueva con
Turbopack: exit 0 en 38,318 s, ID **`MownzIux0PQ2cinakXLwK`**. Se reutiliza esa
misma build después de verificar identidad y fuentes; un único `next start`
escucha en 3000. `run03-native` ejecuta 20 tests con un worker en 42,440 s
(43,108 s del proceso CLI), cero retry, skip o flaky.

| Superficie | Resultado y alcance |
| --- | --- |
| 14 regresiones durables | PASS. Segmento oculto delante/detrás; controles ocultos dentro del form activo; duplicados visibles de form, email/q, password y submit; cambio del formulario visible sin congelar la selección. |
| 4 training naturales | PASS a 320/1280 px, authentication y resolution-authentication. Reentrada por teclado, retorno al entrenamiento, decisiones/checkpoint retenidos y resolución del mismo intent tras un Continue. Digest/replay coinciden en ambos casos terminales. |
| 2 cuota naturales | PASS a 320/1280 px. Búsqueda de la segunda pestaña, 60 altas autenticadas reales, rechazo de la 61 sin alta, reintento tras caducidad scoped, reutilización de la fila existente y apertura por enlace con ambas cuotas a 60 sin consumir más. |
| TypeScript, ESLint, diff | PASS: `tsc --noEmit --incremental false`, ESLint de los cuatro archivos de pruebas y `git diff --check`. No se repitieron unitarios de producto. |
| Revisión independiente | PASS estático, 32/32, cero hallazgos, sobre los cuatro SHA congelados. No sustituye la ejecución nativa ni la CI final. |

Los proveedores externos se sustituyen **sólo para ISBN/volúmenes sintéticos
registrados por el fixture existente de cuota**. Auth, navegación, acciones
Next, RPC y persistencia/limpieza local siguen siendo reales. Las contraseñas y
claves locales se gestionan en RAM; trace desactivado. El escaneo no encuentra
la service key en los artefactos propios ni en `.next`, ni contraseñas/JWT de
actores en los artefactos de texto. No se le pasa la service key al build.

## FAIL conservados y límites

`run01-build-native` conserva un FAIL de preparación: llave omitida al generar
la configuración privada de Playwright, antes de colección y sin actores.
`run02-native` conserva otro FAIL previo a colección: el manifiesto de la build
con junction identifica el recurso como
`.claude/worktrees/pushhealth1329/src/app/buscar/actions.ts`, mientras el driver
CI espera `src/app/buscar/actions.ts`. Ninguno acredita un bug de producto.

Root autoriza el puente privado **sólo de lectura en RAM del runner** para ese
filename exacto. Rechaza export ambiguo, recurso/prefijo distinto, workers
distintos o manifiesto cambiado. Conserva el único ID real `openCatalogItem`,
worker `app/buscar/page`, contenido restante y fichero físico. SHA-256 físico
antes/después: `9685e0169209696523cae24e93e08596fa8d1c51baab2943b912dc73e8f652c5`.
Dos recibos acreditan esas lecturas. El resolver CI, el manifiesto y las
respuestas/RPC del producto no se editan. Este puente y la corrección privada
de raíces Turbopack/tracing para el junction son un **LIMIT de portabilidad de
esta ejecución local**; configuración fuente y aliases permanecen intactos.

El primer extractor propio de evidencia asumía que toda observación de cuota
era un snapshot SQL y falló al encontrar el recibo de rechazo nativo. Se conserva
su fuente y recibo de error; el extractor final admite ambos tipos y conserva
las nueve observaciones por recorrido, sin cambiar tests ni sus resultados.

Las seis capturas de training se inspeccionaron: feedback y Volver a entrar;
combate terminal retenido; victoria y Ver repetición después de la reentrada.
Los dos casos terminales instrumentados registran cero errores de consola y
12 `net::ERR_ABORTED` (5 móvil, 7 escritorio), conservados con sus rutas. El log
de servidor contiene sólo mensajes de arranque en esta pasada. Esto no acredita
una auditoría global de red limpia, toda la suite CI ni la resolución de
[#754/#1369](https://github.com/borjar20/Biblioshare/issues/1369).

## Limpieza y recibos

Los tres actores propios terminan con Auth 404 y ocho superficies a cero por
actor. Se borraron los 122 libros propios; cuotas, ediciones y claves de edición
quedan a cero para ambos actores de cuota. No se usó ni borró `codex_qa`.
Next, workers y Chromium propios están cerrados; puerto 3000 libre, sin procesos
propios vivos en la lectura de `2026-10-04T18:05:43.6491113Z`. El stack compartido
cold-r2 permanece funcionando. No había caché anterior en este checkout.

Evidencia propia, bajo
`.scratch/ticket-campaign/20261002-resolve-all/ci-visible-form-controls1368-20261004/`:

- `run01-build-native/build.log`, `build-result.json`, `build-identity.json` y
  `execution-receipt.json`; FAIL de configuración preservado en `native.log`.
- `run02-native/native.log`, `execution-receipt.json` y copia del harness ejecutado.
- `run03-native/results.json`, `native.log`, `execution-receipt.json`,
  `manifest-alias-receipts.ndjson`, `server.log`, inventarios producto antes/después,
  cleanup y seis PNG en `results/`.
- `run04-legacy-controlled-dom/receipt.json`: seis controles causales completos.
- `analysis-final.json`: casos, estados/RPC, cleanup, rutas de red, SHA/dimensiones
  de las seis capturas inspeccionadas y escaneo de secretos; manifiesto/handoff
  final propios acompañan la entrega.

Entrada externa sellada: `celebrations1334-critical-ci-diagnosis-20261004/visible-input-fixtures-v001.json`,
SHA `3a19dbad4243d775ab787db59b2210254ae822b60f061911670af2804dd7130b`.
Revisión: `ci-visible-form-controls1368-review-20261004/verdict-v001.json`, SHA
`d1099e88960694d93c32e9a70e4008a8ad2842889c1088448928030fb8714578`.
