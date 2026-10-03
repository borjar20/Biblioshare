# #1306 — Speed Insights en un build local de producción

[Histórico · congelado el 2026-10-02 · unitarios y navegador sobre build de producción local]

El layout conserva el SDK original de Speed Insights en dominios de Vercel, dominios personalizados y otros hosts que no sean loopback. En loopback, el nuevo componente cliente no monta el SDK. Las pruebas con el paquete real pasan: **19 PASS**. La misma cobertura frente al montaje incondicional produce **10 FAIL / 9 PASS**, incluidos los fallos locales durante la hidratación. El caso nativo contra `next start` también pasa: setup hidratado, cero scripts, colas y solicitudes SDK. No se ha comprobado la recepción de métricas de un despliegue real.

## Diagnóstico y decisión

En el build local original, `SpeedInsights` se montaba siempre. El SDK instalado, `@vercel/speed-insights` **2.0.0**, elige `/_vercel/speed-insights/script.js` cuando `NODE_ENV` es `production` y no recibe una configuración alternativa. El servidor local no ofrece ese recurso: el baseline registra 404 y rechazo MIME. No se ha confirmado un fallo de analítica en un despliegue.

Vercel incorpora sus endpoints de Speed Insights a los despliegues. Su configuración dinámica puede cambiar las rutas del script y de ingesta, y el SDK debe conservarla. `beforeSend` filtra eventos y no evita la carga del script. Fuentes: [quickstart oficial](https://vercel.com/docs/speed-insights/quickstart), [configuración del paquete](https://vercel.com/docs/speed-insights/package), implementación instalada en `node_modules/@vercel/speed-insights/dist/next/index.mjs`.

No se condiciona el montaje a `VERCEL === "1"`: la documentación vincula esa variable a la exposición de las variables de sistema; no tenemos evidencia de que esté habilitada en este proyecto. Se evita depender de ese ajuste o de una lista de dominios. [Variables de sistema de Vercel](https://vercel.com/docs/environment-variables/system-environment-variables).

`src/components/local-aware-speed-insights.tsx` usa `useSyncExternalStore` con un snapshot de servidor/hidratación `false`. Tras hidratar, lee el hostname del documento. El hostname no cambia sin cargar otro documento, de modo que la suscripción estable no necesita listeners ni un efecto que modifique estado. Así el layout sigue siendo un componente servidor, no necesita `headers()`/`cookies()` y la lectura del navegador no impide el prerender. La coincidencia del snapshot inicial sigue el contrato de [SSR de React](https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering) y las guías locales instaladas de Next sobre componentes servidor/cliente y `use client`.

La exclusión cubre `localhost`, sus subdominios `.localhost` y su forma con punto final; IPv4 `127.0.0.0/8`; e IPv6 `::1`. Las formas abreviadas de IPv4 y expandida de IPv6 se normalizan como hostname de URL. Nombres como `localhost.example.com` o `127.analytics.example.com` conservan el SDK. **Una dirección privada de LAN, como `192.168.1.80`, no es loopback y mantiene el comportamiento anterior**; esta corrección no promete servir el endpoint de Vercel en un alojamiento ajeno a Vercel.

## Archivos y cobertura

- `src/app/layout.tsx`: sustituye solo el import y el montaje final por `LocalAwareSpeedInsights`.
- `src/components/local-aware-speed-insights.tsx`: wrapper cliente; monta el componente original sin modificar sus props, configuración ni seguimiento de rutas.
- `src/components/local-aware-speed-insights.test.tsx`: usa el SDK real y sus contextos de navegación de Next; no simula el SDK, no exporta el predicado para probarlo y no compara el texto del código.
- `e2e/ci/local-speed-insights.spec.ts`: prueba durable incluida en el recorrido de CI; confirma hidratación mediante una interacción real y conserva las observaciones de consola y red.

Los 19 casos comprueban nueve orígenes locales sin script ni inicialización de la cola, seis orígenes conservados con script/ruta del SDK y `VERCEL` ausente, configuración dinámica y cambios de ruta sin duplicados, SSR sin `window`, e hidratación de prerender en local y en dominio Vercel. Se usan valores sintéticos de entorno dentro de Vitest, sin leer ni modificar archivos de entorno del proyecto.

## Evidencia preservada

El FAIL global original queda intacto. Sus copias de evidencia están en `.scratch/local-speed-insights-1306/red-r1/`:

| Artefacto original | SHA-256 |
|---|---|
| `qa-evidence/integration-1790939949423/result.json` → `original-qa-result.json` | `bf9cf39c20d1c0981558056fbc67163c17b63292207d2859816e946404e2c460` |
| `qa-evidence/integration-1790939949423/manifest.sha256.json` → `original-qa-manifest.sha256.json` | `34203790fb74b20c259913fe4f9a0f75e8df1c7cd310e6fa4a37fc2ee704465f` |

La raíz original es `.scratch/ticket-campaign/20261002-resolve-all/`, build `3vVLat3xvkVOXhUZ7q3XJ`. Los flujos de producto y las mediciones de contraste del baseline pasaron, pero su gate global fue FAIL por consola/red. La pasada auxiliar que sustituyó el recurso opcional sirve para acotar la causa; no convierte el baseline en PASS ni valida este cambio. La clasificación de cancelaciones de prefetch es un asunto separado y no se altera aquí.

El RED interpretable del cambio está en `.scratch/local-speed-insights-1306/red-r2/`: `wrapper.source.txt` contiene el montaje incondicional, `tests.source.txt` la cobertura final y `unit-red.txt` el resultado **10 FAIL / 9 PASS** (1,45 s). Los fallos son las nueve inyecciones locales y la hidratación local; los controles de conservación y SSR pasan. `red-r1` también conserva la primera pasada y sus fuentes, sin sobrescribirla.

## Checks y límite de entrega

Todos los comandos usan Node **24.19.0** en `C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.

| Check | Resultado |
|---|---|
| `node_modules/vitest/vitest.mjs run src/components/local-aware-speed-insights.test.tsx --maxWorkers=1 --no-file-parallelism` | **19 PASS**, 1 fichero, 2,56 s; `.scratch/local-speed-insights-1306/green-r1/unit.txt` |
| `node_modules/eslint/bin/eslint.js src/app/layout.tsx src/components/local-aware-speed-insights.tsx src/components/local-aware-speed-insights.test.tsx` | **PASS**, sin diagnósticos |
| `node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` | **PASS**, sin diagnósticos |
| `git diff --check` | **PASS** |
| Playwright inicial con configuración de scratch y `--list` | **DISCOVERED**, 1 caso; JSON de descubrimiento: 1 skipped / 0 ejecutados, sin atribuirle un PASS |
| Build local de producción, Turbopack | **PASS**, 37,317 s; build `1ZoZ14Zb9TbyLBvQW8yRJ`, base `f7c0ac25`, candidato conjunto de #1306/#1311/#965 |
| Navegador contra `next start` | Caso SDK **PASS** en recuperación: cero scripts/colas/solicitudes SDK, errores de consola/página/HTTP; sin sustitución del recurso ni mocks de producto |
| Auditoría global de navegación | **FAIL** preservado, seguimiento #1301; el PASS del caso SDK no convierte en PASS toda la campaña |

## Resultado nativo y conservación del FAIL

El caso definitivo abre el setup Commander con seis jugadores y pulsa 20/40 vidas para demostrar hidratación. Exige ausencia del script y de `si`/`siq`, cero peticiones SDK y cero errores de consola, página y HTTP. Conserva todos los fallos de red en un adjunto.

La pasada original encontró **cero scripts, colas y solicitudes SDK**, pero el assert de peticiones fallidas falló por un GET RSC de `/login` cancelado con marcador de prefetch. Se conserva ese FAIL. Se añadió a la observación método, tipo de recurso, navegación, RSC y marcador; solo se distingue la firma completa `net::ERR_ABORTED` + GET/fetch + no navegación + RSC=1 + `Next-Router-Prefetch`=1/2/3 + mismo origen + query `_rsc`, excluyendo siempre el SDK. POST, navegación o fallos sin marcador siguen fallando el caso. No se descartan todas las cancelaciones por analogía.

La recuperación ejecutó solo el caso SDK y el caso negativo de score que necesitaba corregir su glifo: **2 PASS / 0 FAIL / 0 SKIP / 0 retries**, 4,879 s, sobre el mismo build, sin rebuild ni cambios de producto. Los siete score restantes, saga y el reloj no se repitieron. El test SDK final tiene SHA-256 `3bbe3dcc017d8c9a7b9c352668e1d570ca6890ae28538ba298edb83894bae25a`.

La auditoría conjunta original queda **FAIL** por 13 cancelaciones sin clasificar, además de 33 con la firma de prefetch. La recuperación conserva su audit global **FAIL** por un GET RSC de `/partidas/puntuacion` sin marcador en el otro recorrido, además de tres con firma completa. No hubo errores de Next, consola, página o HTTP ni solicitudes SDK. Los desconocidos siguen en #1301; el problema de stream de Server Actions observado en pasadas anteriores sigue separado en #1263. No se afirma una causa común.

Las copias públicas verificadas viven en el checkout principal bajo `.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/`:

| Pasada | Resultado SHA-256 | Manifiesto SHA-256 |
|---|---|---|
| `integration-1790944752297` | `d424cdb7bafa40c9933476838ff0f6a2d71f65cadfa7e4e32195112105883931` | `2dec9fd2d7ef6c58f575fd600a3142f26cded0b792a54c1d253f89a80557c02e` |
| `recovery-1790945845299` | `c8f6e68f15ec0190ca820066961fe5dfd10fc6849c47683812891d7e2d4d0792` | `6f43f480db328b4cda1a6ef1d54b1343784d9182a6d43951e5d660f115ddd367` |

El manifiesto del servidor es `e2c6b91cac181c68f0b2d848826c3f012153c926d31be60a1091790a02aae5b7`; permaneció idéntico. La recuperación cambió exactamente los dos tests autorizados respecto al snapshot original, sin cambios de producto. Sus 38 artefactos públicos se archivaron con hash y tamaño verificados. La limpieza confirma cero actores, fixtures, escrituras, sesiones y cuotas, servicios detenidos con backup y puerto 3000 libre.

El scratch estático inicial se preserva en `.scratch/ticket-campaign/20261002-resolve-all/static-evidence/analytics1306/`. Sus manifiestos congelan aquella ejecución; el informe actualizado no reescribe los RED. El caso de scratch `.mjs` y su descubrimiento inicial permanecen como historia; el recorrido durable es el `.spec.ts` de CI.

Después de la QA se actualizó la base a `888da33e` preservando los hashes de los cinco archivos propios. CI corresponde a la PR publicada, no a este informe histórico. No se ha accedido a configuración remota, secretos, dependencias, esquema o datos remotos. El comportamiento conservado en dominios no locales está probado con el SDK real en jsdom; no acredita ingesta de métricas en Vercel.
