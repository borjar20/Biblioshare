# #1369 — verificación nativa focal de #754

[Histórico · congelado 2026-10-04]

**PASS focal, con límite causal.** Una ejecución natural de #754 pasa en Chromium
contra una build nueva de producción del candidato
`a9e7a19dbdbc81b627af187c8fdd2f1a97c64fd4`. Se observa un `claim` real cancelado
al navegar de Inicio al primer detalle, sin errores de consola ni `pageerror`.
No se observa el estado del consumidor en el `catch`: este resultado no demuestra
que los guardas de #1369 sean la causa del PASS ni que curen el fallo original de
CI. No se ejecutó de nuevo la suite general.

La issue es [#1369](https://github.com/borjar20/Biblioshare/issues/1369). Su revisión
de fuentes y sus unitarios están documentados por separado en
[el informe del candidato](2026-10-04-celebrations-stale-diagnostics-1369.md).
Este informe acredita exclusivamente la ejecución nativa descrita aquí.

## Candidato, entorno y comandos

Se comprobó la rama `codex/celebrations-stale-diagnostics-1369`, el HEAD exacto
anterior y el estado tracked limpio antes de empezar. No existía una `.next`
previa. El puerto 3000 estaba libre. Node fue `v24.19.0`, Next `16.3.8` y el
bundler real fue Turbopack. La build tardó 37,155 s; el proceso Playwright tardó
6,366 s y su reporter registró 5,584 s para **1 caso, 0 reintentos, 0 omitidos y
0 flaky**.

La ejecución usó el único stack local ya restaurado por Root,
`biblioshare-local-eeaa203e`, API `http://127.0.0.1:54321`, mediante
`SUPABASE_LOCAL_WORKDIR` explícito:

```text
.scratch/ticket-campaign/20261002-resolve-all/celebrations1334-bootstrap-local-r2-20261003
```

El backend tenía el recibo SQL previo de Root de 285 pasos; esta QA no lo repitió,
no creó otro stack, no ejecutó DDL y no detuvo Docker/Supabase. El runner obtuvo
las claves mediante `supabase.exe v2.116.0 status --workdir <ruta> --output json`,
capturando la respuesta únicamente en RAM. La contraseña aleatoria del actor
también se mantuvo en RAM. No se leyó, escribió ni copió ningún `.env`.

El comando supervisor, desde `coverage1307`, fue:

```powershell
$env:SUPABASE_LOCAL_WORKDIR = 'C:/Users/jasc9/Documents/Proyectos-Codex/Biblioshare/.scratch/ticket-campaign/20261002-resolve-all/celebrations1334-bootstrap-local-r2-20261003'
& 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' 'C:/Users/jasc9/Documents/Proyectos-Codex/Biblioshare/.scratch/ticket-campaign/20261002-resolve-all/celebrations-stale-diagnostics1369-native-20261004/run.mjs' run01-natural
```

El supervisor ejecutó `node_modules/next/dist/bin/next build`, después
`next start --hostname 127.0.0.1 --port 3000` y finalmente el CLI real de
Playwright con `run01-natural/native.config.ts`. Todos los procesos persistentes
se lanzaron ocultos. Hubo un solo servidor.

## Frontera de la preparación privada

Se ejecutó una copia privada de `e2e/ci/detail-notes-streaming.spec.ts`, conservando
el recorrido, las aserciones, los tiempos máximos originales y el check
`expect(browserErrors, browserErrors.join("\n")).toEqual([])`. Las únicas
adaptaciones del driver fueron una contraseña generada en RAM, un observador de
eventos de lectura, el UUID del actor para comprobar su limpieza y dos capturas.
No se añadió ninguna allowlist ni se alteraron respuestas, RPC o ACK.

La configuración privada reutilizó `playwright.ci.config.ts`: Chromium Desktop,
un worker, ningún retry y service workers bloqueados. Se desactivó la traza para
evitar persistir credenciales y se cambiaron únicamente las rutas de resultados,
reporters y la gestión del servidor ya arrancado por el supervisor. Esta diferencia
frente a la traza original de CI limita cualquier comparación de temporización.

El preloader privado impidió lecturas de `.env` y ajustó en RAM únicamente
`turbopack.root` y `outputFileTracingRoot` para resolver la junction existente de
dependencias del worktree. Los aliases permanecieron idénticos; no se escribió la
configuración fuente. No hubo puente de nombres ni modificación del manifest
físico de Server Actions.

Se conservó el provider sintético existente de #754: dos libros propios,
OpenLibrary/ediciones y los retardos ya declarados en
`e2e/support/detail-notes-provider.cjs`. También se conservó el masking original
del único asset local `/_vercel/speed-insights/script.js`. Auth, las tablas,
la hidratación persistida y las acciones de celebraciones siguieron siendo reales.
Esto acredita la app de producción con ese fixture de proveedores, sin acreditar
disponibilidad de los proveedores externos o de Speed Insights.

Un inventario de **1924 archivos** de producto, configuración, dependencias
declaradas y driver/provider originales coincide antes y después. No se modificó
producto ni los tests tracked. No se hicieron commits, pushes o escrituras remotas.

## Resultado observado

| Superficie | Dictamen | Evidencia |
| --- | --- | --- |
| Build/start reales del HEAD | PASS | Build nueva, puerto 3000 único, Next listo |
| Caso natural #754 | PASS 1/1 | `results.json`, `native.log`, flags private/stable/abandon |
| Privacidad | PASS, dentro del caso | REST anónimo devuelve `[]`; el propietario ve el cuerpo exacto de su nota |
| Nota durante streaming | PASS, dentro del caso | Aserción visible y captura del detalle con título shell y nota |
| Abandono temprano e hidratación | PASS, dentro del caso | Salida tras commit/shell hacia `/coleccion`; ambos libros acaban con `hydrated_at` mediante la aserción REST original |
| `pageerror` y `console.error` | PASS | `browserErrors=[]`, cero eventos de esos tipos, check íntegro |
| Error servidor de API de petición en `after()` | PASS focal | Cero coincidencias de la misma superficie comprobada por CI en `server.log` |
| Red completa | LIMIT | 17 `net::ERR_ABORTED` conservados; no se declara PASS global |
| Estado de generación/actor/active en el catch | LIMIT | No observado; no se infiere a partir de un aborto de red |
| Cura causal del fallo CI | LIMIT | Sin comparación antes/después y sin catch instrumentado |
| Limpieza | PASS | Auth 404, nueve tablas vacías para el actor, dos libros ausentes y puerto libre |

El observador identifica los tres exports reales mediante el manifest físico,
exigiendo unicidad y el filename exacto
`.claude/worktrees/coverage1307/src/lib/celebrations/pull-actions.ts`. Guarda hashes
de actor/action y metadatos, nunca cabeceras, cookies o cuerpos de las peticiones.
La cohorte crítica de este run contiene:

| Evento | Tiempo Unix ms | Relación |
| --- | ---: | --- |
| Claim 1 desde `/` | 1791138478213 | `expectedActorId` coincide por SHA256 con el actor propio |
| Claim 1 falla con `net::ERR_ABORTED` | 1791138478227 | No se observa respuesta para esta petición |
| Navegación al primer `/libro/...01` | 1791138478228 | Mismo tramo Inicio → primer detalle que acota el diagnóstico CI |

Después se observan otros dos claims, en el primer libro y en `/coleccion`, con
status 200 y también un evento `ERR_ABORTED`. Por tanto, un aborto por sí solo
no demuestra ausencia de respuesta, fallo SQL o fallo de ACK. En ninguno se
registra el error de celebraciones. Son **31 eventos** y **3 claims** conservados.

El CI original analizado por Root, run `37218345996` de PR1364, sí tenía el error
`celebrations {operation: claim, kind: unavailable}` en el primer tramo. Ni esa
traza ni este run observan generación, `active` y actor actual en el catch.
Los valores de `expectedActorId` de la petición no acreditan esos estados internos.
No hubo un FAIL nativo en esta QA que justificase una segunda ejecución
instrumentada; se cierra el alcance focal con esa incertidumbre explícita.

## Capturas inspeccionadas

Ambas imágenes se abrieron mediante `view_image` y se inspeccionaron realmente.
Se tomaron después del primer tramo crítico de navegación.

| Captura | Tamaño | Observación y límite | SHA256 |
| --- | --- | --- | --- |
| `stable-private-note.png` | 1280 × 1547 | Detalle, «Mi registro» y «Tu cuaderno» con el cuerpo privado QA754 visible y título shell | `339b0e135060a585ef66e00f7a7bbd0fff3c5c392979178f27233d468abd81b5` |
| `collection-after-abandon.png` | 1280 × 720 | Skeleton inicial de `/coleccion`; no acredita la lista final renderizada | `3951557922cfd8c797204e169440ec669025e8f332c5ac5601c5615bfb353402` |

Las rutas completas y las observaciones están en `visual-inspection.json`.
La aserción de URL y la hidratación persistida acreditan sus pasos respectivos;
no se usa la segunda imagen como prueba de contenido asentado de la biblioteca.

## Limpieza y recibos

Actor propio: `c36104db-f5d8-4648-b482-c9084b2422bb`. La limpieza del driver se
comprobó después por lectura real: Auth 404; cero filas de ese actor en `profiles`,
`pet_state`, `pet_battles`, `passes`, `notes`, `pet_acorn_ledger`, `pet_cosmetics`,
`pet_daily_missions` y `user_celebrations`; los dos libros propios ausentes.
No se modificó ni borró `codex_qa`.

El servidor y supervisor propios terminaron. El recibo de procesos de
2026-10-04T18:35:23.6238466Z acredita cero procesos propios restantes, cero
Chromium headless y cero listeners en 3000. Supabase quedó funcionando para Root.
La build ignorada se conserva para trazabilidad. El escaneo de todos los archivos
de `.next` y de evidencia encontró **0 presencias de la clave service local**;
la contraseña aleatoria del actor tiene **0 presencias en los artefactos**.
La clave service nunca pasó a build ni a `NEXT_PUBLIC_*`.

Toda la evidencia propia vive en:

```text
.scratch/ticket-campaign/20261002-resolve-all/celebrations-stale-diagnostics1369-native-20261004/
```

| Identidad | Valor |
| --- | --- |
| HEAD | `a9e7a19dbdbc81b627af187c8fdd2f1a97c64fd4` |
| BUILD_ID | `8sxvNW_X867i_zZrkoS3w` |
| SHA256 del fichero BUILD_ID | `c8aef3324c2b1ac87c442e54dbc158feabb6e4f1ed8d440c1f81c4a572482180` |
| Inventario de 2523 artefactos de build, excluye `.next/cache/**` | `bcbf7235003155fa4509eb073ad6263feea9a71c7cdfbd9a21ad5a4e54005505` |
| Manifest físico de Server Actions | `871121dba962c4861d866959c221d9cc76136a5fc243e2129a7c7bf1b942364e` |
| Inventario de fuentes antes/después | `23a4a792de79bebd3d5f6e0862fd959722c7c5391bf89c7aa90428a41e30cad9` |
| Driver original | `517d0b33d51f7b41e52016cf33a0fa29f3bd1a3bd3b8f7558d5a7050e4a0a3a3` |
| Driver privado ejecutado | `3a2b7b52220b40446a0c556b69e437c96d4033f6581b7f1612a2f74caded0d43` |

Los recibos principales son `run01-natural/execution-receipt.json`,
`native-analysis.json`, `build-artifacts.json`, `visual-inspection.json`,
`process-cleanup.json` y `run01-natural/cleanup-verification.json`.
El manifiesto final incluye únicamente artefactos propios y una copia congelada
de este informe: no incluye archivos vivos que Root modifica. Root conserva
la responsabilidad de integrar/publicar el candidato y actualizar los canónicos.
