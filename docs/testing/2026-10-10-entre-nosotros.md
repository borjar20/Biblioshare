# Entre nosotros — verificación integrada

> [Canónico · evidencia local y revisión final del 2026-10-10; esquema aplicado y verificado en producción. Corte previo sobre cd43ce9bffbbcdceca92c22509794f1f3044fca0/build AzNCV4SAaUJ6YTFacyCNy conservado; ronda final sobre base a481da32/build pOmDFAzwjVIeNxwlt6Cex al final. Entrega de código y CI: PR #1474 (estado en GitHub).]

## Fronteras y reproducción

La aplicación se compila y arranca con el backend Supabase desechable **biblioshare-local-5e2cc809**, API `http://127.0.0.1:54321`. No hay mutaciones de producción ni lecturas de producto con privilegios administrativos. Login real, cookies SSR, Server Actions y RLS reales conducen los recorridos. El cliente del navegador y el fixture reciben el mismo backend que `NEXT_PUBLIC_*` fija en build. `.env.local` remoto se conserva intacto.

Preparación, sin imprimir claves:

```powershell
$taskStatus = npx --offline --yes supabase@2.116.0 --workdir .superpowers/supabase-local status -o json 2>$null | ConvertFrom-Json
if ($taskStatus.API_URL -ne 'http://127.0.0.1:54321') { throw 'Wrong local backend' }
$taskLines = @()
$taskLines += 'NEXT_PUBLIC_SUPABASE_URL='+$taskStatus.API_URL
$taskLines += 'NEXT_PUBLIC_SUPABASE_ANON_KEY='+$taskStatus.ANON_KEY
$taskLines += 'SUPABASE_SERVICE_ROLE_KEY='+$taskStatus.SERVICE_ROLE_KEY
$taskLines | Set-Content -LiteralPath .env.comparison.local
# Repetir esta carga en cada terminal de build, start y Playwright:
Get-Content .env.comparison.local | ForEach-Object {
  $taskPair = $_ -split '=',2
  [Environment]::SetEnvironmentVariable($taskPair[0],$taskPair[1],'Process')
}
if ($env:NEXT_PUBLIC_SUPABASE_URL -ne 'http://127.0.0.1:54321') { throw 'Host guard' }
npm run build
npm run start -- --port 3000
# Segunda terminal, misma carga de .env.comparison.local:
npm run test:e2e -- e2e/entre-nosotros.spec.ts e2e/entre-nosotros-motion.spec.ts --config playwright.comparisons.config.ts --workers=1 --retries=0
```

El runner general excluye explícitamente `entre-nosotros.spec.ts` y `entre-nosotros-motion.spec.ts` en `testIgnore`; se ejecutan sólo mediante la configuración dedicada del comando anterior. `playwright.comparisons.config.ts` conserva `testMatch` de ambos specs y sobrescribe `testIgnore: []` después del spread de base, de modo que las exclusiones generales actuales o futuras no oculten este gate. La aserción LOCAL ONLY sigue exigiendo 127.0.0.1:54321 dentro de la prueba y el guard de fixture permanece intacto.

Revisión I1, verificación no ejecutante de descubrimiento:

```powershell
npm run test:e2e -- --list
# RED anterior:440 tests in143 files;12 casos de comparisons incluidos.
# GREEN:428 tests in141 files;0 entradas de comparisons;exit0.
npm run test:e2e -- --config playwright.comparisons.config.ts --list
# GREEN:12 tests in2 files, incluido LOCAL ONLY;exit0.
```

[`testMatch`/`testIgnore`](https://github.com/microsoft/playwright/blob/main/docs/src/test-api/class-testconfig.md) filtran rutas absolutas por glob; [`--list`](https://github.com/microsoft/playwright/blob/main/packages/playwright/src/runner/testRunner.ts) carga/reporta los tests sin tareas de ejecución ni globalSetup. Documentación actual consultada vía Context7. Esta corrección sólo selecciona archivos: no arranca app/navegador, no siembra fixtures y no repite suite general/build/gates de producto.

La configuración aislada no ejecuta el globalSetup/sweep ni lanza un dev server. Se reutiliza exclusivamente el `next start` de la build nueva. La ejecución debe tener port 3000 libre y comprobar PID/identidad de su servidor. La service key solo siembra, controla cambios de fixture y limpia; nunca se envía al navegador. La fixture permite únicamente el origin local 54321 o biblioshare-dev exacto, y el caso de volumen exige local.

## Fixture y oráculos

Diez identidades exactas `qa_comp_motion_[a-j]@example.invalid`; Ana, Beatriz, Carlos, Diana Ana, Eva, Felipe, Gloria, Hugo, Irene y Luis QA. La dueña sigue aceptadamente a las otras nueve, sin reciprocidad. Beatriz es privada. Tres personas tienen treinta libros, una película y una serie con cuarenta episodios: completed para Ana y dropped para Beatriz/Carlos; las otras siete tienen tres libros. El último terminado de Ana del primer libro carece de nota y no rescata el nueve previo. Pases y episodios llevan texto marcador privado que debe desaparecer del DTO.

El volumen añade 1.175 libros/pases históricos a Beatriz: **1.205 pases históricos de libro de esa persona**, más la fixture compartida y dos pases de otros formatos. Catálogo y filas se crean por REST sólo con ids/títulos propios; no se usa SQL global ni producción. La limpieza pre/finalmente pagina los libros y elimina por lotes de 100, conserva errores de test y cleanup mediante AggregateError y también encuentra auth creados antes de profiles. No apunta a devtest ni codex_qa.

La portada procede del catálogo dev, `https://covers.openlibrary.org/b/id/13540548-L.jpg`, descargada una vez (49.909 bytes). Los tests sustituyen bytes únicamente de imágenes con `e2e/fixtures/comparisons/catalog-cover.jpg`. Auth y acciones pueden interceptarse exclusivamente para retener o reenviar el HTTP original con su cuerpo, estado y cabeceras intactos, por temporización o medición; no hay sesiones simuladas ni DTO sustituidos. El detalle asíncrono retiene y libera su respuesta auténtica. El DNS de otra imagen placeholder de fixture permanece registrado y pendiente de revisión final (M3).

Los oráculos combinan pantalla, resultado Flight real de Server Action, petición real de participantes, identidad del nodo original, geometría DOM/rAF, scroll/foco nativos y journal de consola/red. La prueba ajena reproduce el action real con cookies de una segunda cuenta; no basta con comprobar que no aparece una opción en UI.

## Unidades, tipos, lint y build

- `npm test -- src/lib/comparisons/normalize.test.ts src/lib/comparisons/derive.test.ts`: 38/38 PASS.
- `npm test -- src/lib/comparisons src/components/comparisons`: 12 archivos/150 pruebas PASS, 5,13 s.
- Mutante temporal: sustituir episodios únicos por número bruto de visionados del pase activo. Los casos completed/dropped fallan ambos con progreso esperado 1/recibido 2. Restauración en finally antes de la suite global; 38/38 GREEN posterior. No delta de producto. Se conserva un fallo de impresión Python cp1252; la salida causal UTF8 guardada y leída confirma los dos fallos de aserción.
- **Suite general anterior a los fixes** `npm test`: 560 archivos/5.594 pruebas PASS, 96,66 s. Cinco avisos jsdom de navegación a otro Document, ya en [#1463](https://github.com/borjar20/Biblioshare/issues/1463).
- `npx tsc --noEmit --pretty false`: PASS. Se corrigió exclusivamente un predicado nuevo que devolvía boolean|string, antes del build.
- `npm run test:ci:lint`: 2.287 fuentes/0 errores/**31 advertencias**. Lint focal de tests/fixture/config: 0 errores/0 advertencias. Baseline histórico de 31 advertencias en `2026-10-06-wrap-ups.md`; seguimiento vivo [#1464](https://github.com/borjar20/Biblioshare/issues/1464). No se atribuye limpieza total de lint.
- Primer build FAIL de preparación: red sandbox impide descargar Fraunces, Geist, GeistMono, Tiny5. Mismo comando/entorno con red aprobada: build PASS, Next 16.3.8, compilación 4,3 s, TypeScript 44 s, 89 páginas. BUILD_ID `0axv6uxSeb71na7zfwFW2`. No se sustituyen fuentes ni se cambia producto.

### Advertencias de lint fuera de esta feature

Todas son `@typescript-eslint/no-unused-vars`, excepto la de barcode indicada.

| Archivo | Líneas (cantidad) |
| --- | --- |
| `e2e/registrar-sesion-v2.spec.ts` | 275,317,438,516 (4) |
| scripts/pet-pixellab/pack-strip.mjs | 25 (1) |
| src/app/buscar/barcode-scanner.tsx | 48 (1),`@next/next/no-location-assign-relative-destination` |
| src/app/club/[slug]/miembros/page.tsx | 33 (1) |
| src/app/club/[slug]/page.tsx | 61 (1) |
| src/app/importar/actions.ts | 207 (1) |
| src/components/avatar-upload.tsx | 15 (1) |
| src/components/clubs/club-cover-upload.tsx | 15 (1) |
| src/components/pet/training/training-session.test.ts | 343 (1) |
| src/components/play/score/score-setup-form.tsx | 137 (2) |
| src/components/sagas/regenerate-route-button.tsx | 23 (2) |
| src/lib/clubs/activities/core.ts | 6 (1) |
| src/lib/library/manage-actions.ts | 11 (1) |
| src/lib/people/get-person.ts | 6 (1) |
| src/lib/pet/battle/equipment.test.ts | 29,84 (2) |
| src/lib/pet/training/service.test.ts | 115 (1) |
| src/lib/play/ui/setup-draft.ts | 96 (2) |
| src/lib/social/voice-note-actions.test.ts | 31 (2) |
| src/lib/stats/period.test.ts | 8,10,12 (3) |
| src/lib/voice/voice-note-limits.test.ts | 4 (1) |

## Resultados de navegador

R1: 12 recorridos, un worker y cero reintentos; 4 motion PASS (35,5 s / 17,2 s / 5,7 s / 11,6 s), 8 FAIL de preparación en la semilla de pases mixtos. El diagnóstico focal conserva HTTP 400 / PGRST102 `All object keys must match`: `review` estaba solo en la fila de película. Se añade `review: null` a serie, sin alterar datos ni lecturas de producto. Limpieza en cada intento.

| Ronda / build | Resultado y diagnóstico |
| --- | --- |
| R1 / `0axv6uxSeb71na7zfwFW2` | Motion 4 PASS; 8 integrados fallan preparación PGRST102, sin resultado de producto. |
| R2 / misma build | Privacidad 10,6 s y error/retry 7,6 s PASS; 6 fallos de harness: label exacto Formato, texto UTF8 de retorno, alert no acotada y body CDP ausente. Se corrigen selectores según DOM real. Los journals de dos PASS no se persistieron por attachments body-only; no se repitieron sólo para recuperarlos. |
| R3 / `WaTVIDrFWDkb9lEF3xWrX` | Parcial: DTO no promete orden interno; oráculo corregido a ids ordenados con longitud/duplicados y lookup por userId. Título de episodio real reemplaza locator inventado. Runner 42032 detenido antes de repetir la causa en restantes; cleanupREST PASS. No crédito two-tabs/volumen. |
| R4 / misma build | 5 PASS: CRUD 18,5 s; Gustos a 320 px: 11,4 s; a 768 px: 11,4 s; a 1280 px: 10,8 s; volumen 27,0 s. Dos pestañas falla lectura de cuerpo CDP. Se almacena solo la respuesta de la acción real de guardar, conservando cuerpo/estado/cabeceras originales. |
| R5–R6 / misma build | Harness esperaba `/login` tras logout pero producto redirige `/`; después esperaba navegación automática a B. NULL durante logout desmonta correctamente: no se clasifica como bug. Se explicita frontera y navegación soportada. |
| R7 / misma build | Login streamed trae formulario oculto duplicado: se reutiliza visibleFormContaining, conserva unicidad visible. |
| R8 / misma build | Formulario /login anterior a login en otra pestaña produce POST HTTP 307 por proxy autenticado y error React. Fuera de alcance: [#1465](https://github.com/borjar20/Biblioshare/issues/1465). |
| R9 / misma build | RED causal de privacidad: getUser A auténtico iniciado/retardado antes de logout/login B, RSC auténtico retenido; cookies/actor B comprobados antes de entregar A. 32/35 frames reabren evidencia A. Corrección acotada del gate asignada y cubierta. |
| Título RED / misma build | 320 px: h3 (41,194,238,165,56), cover (109,197,252,998,101,599,147,319), intersección 10.826,909 px²; scrollWidth 351 > client 238. |
| Mapa RED / misma build | stage 254×360; Ana/Beatriz 78,03 px² de colisión, sharedcount coincide con Felipe; Carlos estrecha y envuelve 3 líneas. |

Estas tandas anteriores no forman un 12/12 sobre la build final. La corrección aislada de estados conservaba la cobertura anterior de privacidad/error porque solo cambiaba la etiqueta de serie, pero los cambios posteriores de gate y layout compartido justifican una nueva suite general y todos los recorridos de navegador.

### Correcciones acotadas con regresión causal

- Estados canónicos: `completed`→Terminada; `dropped`→Abandonada; `in_progress`→En curso. WorkDetail RED 3 FAIL / 3 PASS → GREEN 6; no normalizador/esquema nuevo.
- Frontera de sesión: un nuevo focus/visibility durante getUser invalida el resultado en vuelo, mantiene evidencia oculta y agrupa una comprobación fresca después de terminar la petición. Máximo una petición auth activa; resolve/error/reject antiguos no validan; mismo actor conserva contexto, mismatch/null desmonta; unmount/authinvalidate no crea petición en cola. RED 4 FAIL / 29 PASS → GREEN 33. Sin cambios de provider/proxy/SDK/esquema.
- Título: wrapper completo bajo la portada original, h3 envuelve texto entero; ResizeObserver mide wrapper completo. Cover/camera/Scene/720 ms intactos; espacio mediante scroll normal. Oráculo DOM exige título/portada sin intersección, texto sin clipping y glyph rects dentro del stage.
- Mapa denso<=360 px, >=5: mismo punto radial para nombres, líneas SVG y piles; mundo/SVG 3400 unidades evita letterbox. centerY 1700/radiusY 1600 y giroπ/(2 count) para impares; ancho intrínseco de chip. Los nombres 68×47 a stage 254 de grupos 5–10 están dentro/sin intersecciones; RED 9 personas 256,214 px²→GREEN 19 geometría. No tweak de fixture/nth-child, Venn/wide/pair/trio sin cambio. Commit de producto `5c2019176a354dee51a18a5d4c2b9b1e17ac0946`.

### Instrumentación y mediciones anteriores

`route.fetch` reenvía la misma petición una vez con cookies/headers del navegador; `route.fulfill({response})` devuelve body/status/headers originales. [Documentación Playwright](https://playwright.dev/docs/api/class-route#route-fetch) y [fulfill](https://playwright.dev/docs/api/class-route#route-fulfill) consultadas mediante Context7. Sólo se retarda transporte auténtico para probar carreras/asincronía; no se sustituyen sesiones ni DTO. Los casos volumen/guardar bufferizan HTTP real para evitar el fallo CDP `No data found for resource with given identifier`. Se miden bytes del body recibido y tiempo con esa instrumentación, sin afirmación de benchmark publicado.

R4: 10 personas, 1.205 pases de libro de Beatriz, 1.207 obras de catálogo, 1.292 PersonWork y 1.293 pases brutos (incluye el terminado antiguo reemplazado); login/create/load: 14.764 ms; actualización: 4.435 ms; Flight sin comprimir: 361.166 bytes. Movimiento rAF: 718,2 / 716,9 / 718,1 ms para 320 / 768 / 1280 px; 99 / 96 / 68 frames; stage: 5547 / 5384 / 5384; ancho de documento: 320 / 768 / 1280 px; scroll: 5776 / 3005 / 2316 restaurado. Todos los pageErrors: 0; peticiones: 200. Se conservan DNS de portada placeholder y abortos de RSC/actions, sin declarar logs limpios.

[Mediciones R4](assets/2026-10-10-entre-nosotros/measurements.json), [título RED](assets/2026-10-10-entre-nosotros/series-320-title-red.png), [título bBoxes RED](assets/2026-10-10-entre-nosotros/work-title-red.json), [auth RED](assets/2026-10-10-entre-nosotros/stale-auth-red.json), [mapa RED](assets/2026-10-10-entre-nosotros/ten-person-mobile-map-red.png) y [bBoxes RED](assets/2026-10-10-entre-nosotros/ten-person-mobile-map-red.json). La [captura intermedia R3](assets/2026-10-10-entre-nosotros/series-1280-during.jpeg) es un frame real click+357,826 ms previo al nuevo layout; [provenance](assets/2026-10-10-entre-nosotros/intermediate-frame-provenance.json), no se presenta como captura final.

### Verificación final

Suite general final única tras estabilizar gate/layout: `npm test`, 560 archivos / **5.610 pruebas PASS**, 88,84 s, código de salida 0; los mismos 5 avisos jsdom de #1463. La anterior tanda de 5594 PASS cubría el estado previo a la corrección; el cambio material de privacidad/layout justifica esta ejecución adicional. Cobertura focal final: 166 PASS; geometría: 19 PASS; TypeScript y ESLint focal: salida 0. Build final PASS `AzNCV4SAaUJ6YTFacyCNy` (compilación: 11,8 s; tipos: 7,8 s). Se detuvo solo el viejo next start 46900 y se arrancó el nuevo 32352 (sesión 1770), listo en 329 ms; todos los procesos usan variables locales antes de leer `.env.local`. Ningún runner estaba activo al cambiar servidor.

Tanda final de 12 casos: **11 PASS / 1 FAIL de captura CDP**, 2,4 min. Trayectoria: 15,0 s; rueda: 13,1 s; movimiento reducido: 4,7 s; táctil móvil: 9,5 s; CRUD: 17,1 s; Gustos a 320 px: 11,4 s; a 768 px: 10,4 s; dos pestañas: 14,3 s; privacidad: 9,5 s; error: 7,2 s; volumen: PASS. El fallo a 1280 px es `response.text: Network.getResponseBody No data found for resource with given identifier` en la lectura de cuerpo, antes del oráculo de producto. Se lee el cuerpo de la respuesta original ya almacenada por `route.fetch` antes de retener/liberar, sin segunda petición ni reemplazo. **Repetición focal únicamente a 1280 px: PASS, 10,8 s (11,9 s total)** en la misma build; no se repite global/build. Los 12 recorridos quedan cubiertos por esa tanda más la repetición; no se presentan como una tanda única de 12/12.

[Mediciones finales y journals resumidos](assets/2026-10-10-entre-nosotros/final-measurements.json) y [trayectorias DOM finales](assets/2026-10-10-entre-nosotros/cover-trajectories-final.json). Journals de 8 integrados más el focal de 1280 px: pageErrors 0; bodyState complete/unavailable conserva los fallos CDP; los cuerpos de privacidad/revocación/bloqueo/borrado y reintento se leen realmente y los oráculos pasan. Peticiones abortadas en navegación/cambio de auth y DNS del asset placeholder permanecen registrados. El error de lectura produce ERR_FAILED deliberado. No se declara consola/red totalmente limpias.

| Viewport | Movimiento medido | Frames | Stage final | Título scroll/client | Intersección h3/cover | Scroll restaurado |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 320 | 734,3 ms | 98 | 5771 px | 238/238 | 0 px² | 5776 px |
| 768 | 717,5 ms | 95 | 5528 px | 654/654 | 0 px² | 3005 px |
| 1280 | 718,7 ms | 68 | 5500 px | 1150/1150 | 0 px² | 2316 px |

La captura 320 final coloca h3 (41,502,238,165,5625) por debajo de cover (109,197,252,998,101,599,147,319): el hero no cambia. Texto entero/glyph rects dentro, serie 40 episodios y Terminada/Abandonada reales; último episodio accesible por scroll nativo y retorno al mismo nodo/foco. [320claro](assets/2026-10-10-entre-nosotros/series-320-light.png), [320oscuro](assets/2026-10-10-entre-nosotros/series-320-dark.png), [768claro](assets/2026-10-10-entre-nosotros/series-768-light.png), [768oscuro](assets/2026-10-10-entre-nosotros/series-768-dark.png), [1280claro](assets/2026-10-10-entre-nosotros/series-1280-light.png), [1280oscuro](assets/2026-10-10-entre-nosotros/series-1280-dark.png), [detalle libro móvil](assets/2026-10-10-entre-nosotros/mobile-book-final.png).

Auth [GREEN duradero](assets/2026-10-10-entre-nosotros/stale-auth-green.json): A forward 1791637610876, retenido 0941; logout 1921; RSC auténtico 200 retenido 2213; login B / perfil verificado 2500; focus 2518; A liberado 2518 / entregado 2521. Dos getUser, 33 frames, 0 oldVisible; boundarymounted=true después de liberar A. El componente antiguo sigue montado mientras las respuestas RSC originales están retenidas; el gate mantiene evidencia oculta y la comprobación fresca desmonta el contexto A. RSC se entrega intacto después; la navegación explícita a comparación con query A verifica B sin grupo A, sin Stage y con perfil B. No se exige navegación automática ni se fuerza el estado de sesión.

Volumen final: **10 personas, 1.205 pases de libro de Beatriz, 1.207 catalogWorks, 1.292 PersonWork** y 1.293 pases brutos; login/create/load: 10.740 ms; refresh instrumentado: 4.007 ms; Flight original: 361.170 bytes. El tamaño varía 4 bytes respecto a R4 por serialización/ids; no se infiere cambio de rendimiento. [Mapa de 320 px de página completa](assets/2026-10-10-entre-nosotros/ten-person-mobile-map-full-page.png) y [bBoxes](assets/2026-10-10-entre-nosotros/ten-person-mobile-map.json): stage (33,1043,254,1019), diez nombres dentro en x/y, scrollWidth <= client+1, 0 intersecciones de nombres entre pares ni con summary/cover; Diana Ana QA de 68 × 47 prueba dos líneas. Summary (96,5,1921,1875,127,95), borde inferior de Felipe 1896,44 deja 24,75 px de separación. La etapa crece y usa scroll normal.

## Límites y limpieza

Sólo Chromium local con backend desechable. No acredita CI del HEAD integrado, Android ni producción. El servidor registra `The destination stream closed early` (digest 3204442879) durante el bloque motion/login-navegación de R1; se conserva en [#1263](https://github.com/borjar20/Biblioshare/issues/1263), sin inferir causa común ni declarar logs globales limpios.

M1 de tarea 5 observado con teclado en CRUD R4: al abrir la confirmación de eliminación mediante Enter en «Eliminar grupo», activeElement=BODY. Se mide antes de activar «Confirmar eliminación» (`e2e/entre-nosotros.spec.ts:149–153`); el disparador se desmonta al abrir la confirmación inline. El valor duradero es `final-measurements.json.keyboardFocus.focusAfterConfirm`; no existe un JSON separado ni se acredita un resultado de foco posterior al borrado. El controlador mantiene su revisión final pendiente, sin corrección incidental. Los avisos jsdom siguen en #1463 y las 31 advertencias en #1464.

Reproducción fuera de alcance #1465: abrir /login anónimo en pestaña 1; completar login A en pestaña 2; enviar el formulario antiguo de pestaña 1 para B. `src/lib/supabase/proxy.ts:7` AUTH_PATHS y líneas 140–141 redirigen cuando hasProfile, independientemente del método; POST /login con 307 produce “No se pudo cargar”. El login soportado tras logout funciona. No se versionan traces con credenciales.

Suplemento visual separado: el recorte del stage alto colocaba header/nav sticky encima de nombres/recuento por composición de la captura. Se conserva [ese recorte](assets/2026-10-10-entre-nosotros/ten-person-mobile-map.png) con esa limitación; la [captura de página completa real](assets/2026-10-10-entre-nosotros/ten-person-mobile-map-full-page.png) se toma desde scroll 0 sin ocultar UI. Solo se repite volumen: 20,3 s (21,2 s total), misma build, sin global/build/otros tests nuevos. Los diez nombres, nombre de dos líneas, recuento y controles se leen sin intersección propia; header/nav quedan fuera del mapa en la captura completa. [bBoxes del suplemento](assets/2026-10-10-entre-nosotros/map-supplement-bboxes.json), [métricas propias](assets/2026-10-10-entre-nosotros/map-supplement-measurement.json): 9.858 ms login/create/load; 3.247 ms refresh; 361.170 bytes, mismos 10 / 1205 / 1207 / 1292. Estas cifras no sustituyen silenciosamente las de la tanda final.

Limpieza final [audit real](assets/2026-10-10-entre-nosotros/cleanup-audit.json): exactAuthFixtureUsers/profiles/books/movies/series: 0; grupos/pases/episode_watches totales locales: 0, tras finally de todas las tandas y suplemento. Las cuentas persistentes devtest/codex_qa remotas no se mutaron: todas las operaciones de fixture recibieron el host local 54321; globalSetup/sweep deshabilitados. Instancia/Docker local del controlador preservada. Servidores propios 13984 / 46900 / 32352 detenidos; último árbol 32352 cerrado con taskkill, puerto 3000 libre; salida 1 de sesión 1770 es terminación esperada, no un gate fallido. Archivo ignorado propio `.env.comparison.local` eliminado; `.env.local` preservado. Ningún worktree/servidor/watcher nuevo pendiente. El start final solo registra el PT409 deliberado del conflicto de pestañas; #1263 stream-close se observó en R1, no se atribuye al conflicto ni se declara limpieza global de logs. Todos los JSON duraderos revisados no contienen headers Authorization/Set-Cookie, passwords, tokens/JWT/service key; solo identidades de fixture, estados, tiempos y evidencia. Los traces temporales no se copian al repo.


Observación M2 para revisión final del controlador: el selector Grupo a 320 px queda estrecho (solo flecha) junto a Crear/Editar; el heading mantiene el nombre del grupo. El controlador lo inspeccionó en la captura completa y lo dejó pendiente junto con M1, sin cambio incidental ni nueva afirmación de defecto bloqueante.


Corrección de revisión I1 de tarea 9: tipos y ESLint de ambas configuraciones PASS, sin errores/advertencias; diff focal limpio. M1/M2/M3 permanecen pendientes para revisión de toda la rama: el DNS de imagen placeholder de fixture se conserva explícito junto con los otros avisos, sin arreglo incidental. La deriva del rol Codex backlog-scribe queda fuera de la feature y registrada en #1466; no se cambia configuración de agentes.


## Ronda única final de correcciones — 2026-10-10

Los apartados anteriores conservan el corte previo: **5.610 unitarios/560 archivos
y 12 recorridos únicos de la build AzNCV4SAaUJ6YTFacyCNy**. Esa suite general no se
ha repetido ni se atribuye al nuevo candidato. La presente ronda corrige únicamente
I1/I2/M1–M5 del informe completo, sobre base `a481da32c9280e43ec5fc38d11197d69492adaaa`.
Producción, integración/CI y la re-revisión acotada siguen pendientes.

| Hallazgo | Resultado actual |
| --- | --- |
| I1 | Aviso compartido de historiales persona/serie del grupo cargado, incluso sin obras elegibles, sin selección en Gustos o con participante no disponible. Aclara que no cuenta series únicas ni sólo la pareja activa. Snapshot vacío real conserva3; tras borrar Carlos conserva2. |
| I2 | Tamaño de nombre y geometría dependen del mismo ancho de stage; reserva de etiqueta de dos líneas/portada rotada, ajuste de bordes y crecimiento vertical con scroll normal. Coordenadas únicas y relojes anteriores intactos. |
| M1 | Confirmación inline enfoca Cancelar; cancelar devuelve a Eliminar. Enter/Cancelar/Enter/Shift+Tab/Confirmar se prueba sin reparar foco. Observación actual BUTTON/Cancelar. |
| M2 | Selector320 px, vacío y nombre largo, mide288 px; botones envuelven en otra fila. |
| M3 | Sospecha de harness abierta y etiquetada en [#1471](https://github.com/borjar20/Biblioshare/issues/1471); diagnóstico y contraevidencia preservados. Política dedicada bloquea workers como límite del gate, no como cierre causal ni promesa de entrega universal. |
| M4 | Muestra de episodios valorados por todas las personas, cero veraz cuando B deja notas nulas; región individual explica que no hay comparación conjunta. Notas generales/episodio separadas. |
| M5 | Retorno a pareja no inicial/región exacta y categoría original desde el padre Gustos; control superviviente al desaparecer origen. Nodo/scroll del cover y movimiento reversible conservados. |

RED significativo: ocho fallos UI/69 PASS y11 geometría/74 PASS; añadido oráculo de
huella rotada:12 FAIL/127 PASS. GREEN actual: **350/350 en13 archivos**,7,27s, mediante
`npm test -- src/components/comparisons src/lib/comparisons src/components/route-messages.test.tsx --reporter=dot`.
Tras alinear un fixture antiguo de detalle con el contrato real de notas de todas
las personas, `npm test -- src/components/comparisons/work-detail.test.tsx --reporter=dot`
pasa10/10,2,76s. Sólo cambio de test. Tipos `npx tsc --noEmit --pretty false` PASS;
lint focal de comparisons/spec/fixture/config0 errores/0 advertencias. Consistencia:
82 claves directas de comparisons presentes, familias dinámicas sin cambios; suite
de mensajes de ruta incluida. No suite general repetida.

Build fresca `npm run build` PASS, Next16.3.8, **BUILD_ID
`pOmDFAzwjVIeNxwlt6Cex`**. Supabase local desechable54321 preloaded para build,
start y browser; `.env.local` dev intacto. Servidor propio único3000/PID37936.
Ningún cambio de producto posterior a esa build, sólo tests/docs/informe.
El servidor conserva un mensaje «destination stream closed early» ya seguido en
[#1263](https://github.com/borjar20/Biblioshare/issues/1263); no se declara log limpio.

Browser con `playwright.comparisons.config.ts`, workers1/retries0:

- Tanda `--grep 'final fixes|ten-person CRUD|Gustos restores A/B'`:5 PASS/1 FAIL,
  4,3min. CRUD/teclado natural y Gustos320/768/1280 PASS; mapa intermedio PASS.
  El caso combinado falló por asumir orden Ana,Beatriz cuando el origen no inicial
  conservaba Beatriz,Ana y la intersección real correcta tenía1serie. Se conserva
  el fallo: no era un defecto de selección ni de producto.
- Una repetición focal encontró strictness en un selector de **registro** innerText
  (slot y canvas tenían data-view=work),18,8s. Las muestras40/0 ya habían pasado.
  Selector de captura acotado al host de cámara; sin cambio de producto.
- `--grep 'final fixes' --output test-results/final-fix-acceptance`:**2/2 PASS**,
  55,5s. Copia/muestras/región individual/exclusiones y retornos naturales28,8s;
  DOM responsive25,3s, incluidos nuevos bordes stage959/960/961.
- `e2e/entre-nosotros-motion.spec.ts --output test-results/final-fix-motion`:
  **4/4 PASS**,41,4s: cover original ambos sentidos/interrupción, wheel real,
  movimiento reducido y320 px touch/scroll/batch/foco.

Son **10 casos relevantes distintos en la build nueva**, acreditados por cuatro
CRUD/Gustos de la tanda +dos aceptación corregidos +cuatro motion; no se presenta
la tanda6 como íntegramente verde ni se inventa una repetición actual de los12 anteriores.
Los comandos completos, fracasos intermedios y capturas están en el
[informe completo de esta ronda](assets/2026-10-10-entre-nosotros/final-fix/final-fix-report.md).

DOM real10 personas, nombres de dos líneas Diana A0–A9 García y una pila periférica
real:18viewport widths365/366/367,425/426/427,430,466,665/666/667,
1041/1042/1043,1073/1074/1075,1280. Sus stages299/300/301,359/360/361,364,
400,567/568/569,927/928/929,959/960/961,1166 tienen cero intersecciones
nombre/nombre, nombre/pila y nombre/resumen, bordes dentro del stage y sin overflow.
Altura de etiquetas compactas40,375 px/11 px; ordinarias47,59375 px/14 px. Oráculo puro
cubre5–10 personas y ambos lados de umbrales,187/187 PASS. Se conservan18 JSON de
bounds y fullPage366/430/666/667/1074/1075/1280, además de selector 320vacío/largo,
serie por temas y aviso de exclusión sin obras/con participante no disponible.
Capturas430y selector largo inspeccionadas visualmente. No se copian traces con
cookies/headers/tokens a los assets durables.

### M3: diagnóstico acotado y contraevidencia

En build previa de esta ronda `iJy-2j8v-ua6py5Ep4y0F`, un solo caso crea contexts
allow/block. Conserva origen/ruta completa sanitizada del placeholder, tipo image,
frame, Request.serviceWorker y CDP initiator. allow:un fallo DNS en frame `/`,
worker del request null, initiator other y /sw.js registrado/controller al final;
block:sin fallo en ese caso. **Después, dos fallos DNS aparecen también con
workers bloqueados** en Inicio durante los recorridos Gustos de pOm. Se añaden a
#1471; no hay causa confirmada, ni fallo atribuido a proveedor externo o producción.
`serviceWorkers: 'block'` en la configuración dedicada expresa el límite del gate
de intercepción y no acredita PWA/offline ni una corrección universal del fixture.
El worker de producto y HTTP original de sesión/acciones permanecen intactos.

Aceptación2 casos:0 errores JS no capturados,0fallos de cover,21fallos de red
ERR_ABORTED conservados y4 mensajes esperados de registro de worker bloqueado.
Tanda original6:0 errores JS no capturados,58fallos de red incluidos2DNS,
15 mensajes de consola (incluye el caso de harness fallido). Motion no tiene auto
journal: no se inventa un conteo global para sus4 PASS. Los errores no se ocultan.
Datos sanitizados en [journal resumen](assets/2026-10-10-entre-nosotros/final-fix/browser-journal-summary.json)
y [diagnóstico M3](assets/2026-10-10-entre-nosotros/final-fix/M3-cover-ownership.json).

### Limpieza y límites de esta ronda

Cleanup exacto por finally en todos los fixtures, también tras fallos. Audit
final read-only del proyecto inicialmente vacío: profiles/books/movies/series/
comparison_groups/passes/episode_watches y auth qa_comp_motion_[a-j] todos0,
[recibo](assets/2026-10-10-entre-nosotros/final-fix/final-fix-cleanup.json).
Primer import del helper de auditoría falló por Node userInfo ENOMEM antes de
mutar; auditoría REST de sólo lectura con Node plain pasa. Servidores propios
35524/37936 y contexts/runners cerrados,3000libre, sin watchers; override temporal
eliminado, .env.local dev preservado. Supabase local padre queda en marcha para la
auditoría/parada final del coordinador. Sin cambios/fixtures productivos,
nuevos worktrees, cleanup de procesos ajenos, push ni merge.

Límites siguen rastreados en #1462 integración/despliegue,
[#1468](https://github.com/borjar20/Biblioshare/issues/1468) plataformas/screen-reader,
[#1469](https://github.com/borjar20/Biblioshare/issues/1469) facetas/listas grandes,
[#1470](https://github.com/borjar20/Biblioshare/issues/1470) acta offline/polling/realtime,
y #1471 M3. Deuda #1263/#1463–#1467 conservada. No se atribuyen CI, producción,
Android, Firefox, WebKit ni lector de pantalla a estas pruebas Chromium locales.

## Cierre de revisión y entorno — 2026-10-10

Las diez tareas tienen revisión independiente. La revisión de la rama completa
dio lugar a una única ronda de corrección y una re-revisión acotada del rango
`a481da32..4f6c2fd0`. I1, I2, M1, M2 y M4 están corregidos; M3 tiene la disposición
explícita de investigación pendiente en [#1471](https://github.com/borjar20/Biblioshare/issues/1471).
No se encontraron nuevos problemas Critical/Important en la corrección.

M5 quedó parcialmente corregido: pareja, categoría, portada y región vacía
restauran foco, pero una región poblada enfoca su primera portada en vez del
control de región. Una reproducción de solo lectura del componente real en
JSDOM confirma el selector ambiguo. Sigue en
[#1472](https://github.com/borjar20/Biblioshare/issues/1472); no se presenta como una
nueva prueba de navegador ni como un retorno completamente resuelto. Las dos
claves ajenas copiadas a `margin` quedan en
[#1473](https://github.com/borjar20/Biblioshare/issues/1473). Son restos menores
registrados al adjudicar el límite de una sola ronda final; no una certificación
de que todos los hallazgos hayan desaparecido.

La evidencia de producto actual es la build `pOmDFAzwjVIeNxwlt6Cex`, 350 pruebas
focales en 13 archivos, la posterior comprobación de detalle 10/10, tipos/lint y
diez recorridos de navegador relevantes pasando en sus tandas documentadas.
La suite general de 5.610 pruebas pertenece al candidato anterior a esta ronda.
Los fallos intermedios, abortos, errores de imagen y límites de plataforma siguen
en el informe. La revisión no repitió las suites: ejecutó solo la reproducción
focal de M5. [Re-revisión completa](assets/2026-10-10-entre-nosotros/final-fix/root-final-review.md).

El coordinador comprobó directamente el contenedor local propio: cero usuarios
Auth, perfiles, libros, películas, series, grupos, miembros, pases y episodios
registrados; sin recuperación de reloj pendiente.
[Auditoría de cierre](assets/2026-10-10-entre-nosotros/final-fix/root-closing-db-audit.json).
La instancia `biblioshare-local-5e2cc809` está apagada, sin contenedores propios
restantes. Puerto 3000 libre, servidores y fixtures propios cerrados, override
local temporal eliminado; `.env.local` dev y worktree se conservan. Producción,
push y merge no se realizaron. La rama se entrega como candidata local revisada
con los restos anteriores explícitos; integración/publicación continúa en #1462.

## Integración con main y producción — 2026-10-10

PR de entrega: [#1474](https://github.com/borjar20/Biblioshare/pull/1474).
Los checks y el despliegue asociados al commit integrado se consultan en esa PR;
esta sección conserva la evidencia obtenida antes del merge.

- Main integrado: 46c52724ccdfbbca411f8f62d7b106532aeea28a; ambos conflictos
  documentales conservan las secciones y decisiones de las dos ramas.
- Remates #1472/#1473 y nuevo gate CI revisados independientemente, sin hallazgos
  abiertos. Regresión del foco poblado RED/GREEN y comprobación de claves de mensajes.
- Ejecución fresca: Canvas/motion/Tastes, 36/36 PASS; typecheck sin incremental PASS.
- Config CI: discovery 15 pruebas/2 specs; rechazos de backend/web remotos y ausencia
  de clave local. HTTP/RLS del cableado completo se verifica en CI, no se deduce de discovery.
- Migración 20261010084120 aplicada en producción, sin fixtures: tablas/RLS, funciones,
  hashes, políticas, constraints, triggers y grants coinciden exactamente con dev.
  Advisors seguridad: seis antes/seis después, sin nuevos hallazgos. Recibo en
  [schema-production.json](assets/2026-10-10-entre-nosotros/integration/schema-production.json).
- Imagen editorial en [docs/marketing](../marketing/entre-nosotros-promocion.png).
  Ilustra el concepto; no acredita una captura de producto ni cuentas reales.

La evidencia SQL previa de roles/rollback/concurrencia sigue siendo local/dev;
la lectura del catálogo productivo no sustituye esas pruebas ni ejecuta DML de usuarios.
Las limitaciones de plataformas, escala y DNS conservan sus issues existentes.
