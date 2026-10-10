# Entre nosotros — verificación integrada

> [Canónico · evidencia de ejecución local del 2026-10-10; candidato sobre cd43ce9bffbbcdceca92c22509794f1f3044fca0. Gates finalizados sobre build AzNCV4SAaUJ6YTFacyCNy; mediciones previas identificadas por ronda; revisión independiente pendiente.]

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

La configuración aislada no ejecuta el globalSetup/sweep ni lanza un dev server. Se reutiliza exclusivamente el `next start` de la build nueva. El caller debe tener port3000 libre y comprobar PID/identidad de su servidor. La service key sólo siembra, controla cambios de fixture y limpia; nunca se envía al navegador. La fixture permite únicamente el origin local54321 o biblioshare-dev exacto, y el caso de volumen exige local.

## Fixture y oráculos

Diez identidades exactas `qa_comp_motion_[a-j]@example.invalid`; Ana, Beatriz, Carlos, Diana Ana, Eva, Felipe, Gloria, Hugo, Irene y Luis QA. La dueña sigue aceptadamente a las otras nueve, sin reciprocidad. Beatriz es privada. Tres personas tienen treinta libros, una película y una serie con cuarenta episodios: completed para Ana y dropped para Beatriz/Carlos; las otras siete tienen tres libros. El último terminado de Ana del primer libro carece de nota y no rescata el nueve previo. Pases y episodios llevan texto marcador privado que debe desaparecer del DTO.

El volumen añade 1.175 libros/pases históricos a Beatriz: **1.205 pases históricos de libro de esa persona**, más la fixture compartida y dos pases de otros formatos. Catálogo y filas se crean por REST sólo con ids/títulos propios; no se usa SQL global ni producción. La limpieza pre/finalmente pagina los libros y elimina por lotes de100, conserva errores de test y cleanup mediante AggregateError y también encuentra auth creados antes de profiles. No apunta a devtest ni codex_qa.

La portada procede del catálogo dev, `https://covers.openlibrary.org/b/id/13540548-L.jpg`, descargada una vez (49.909 bytes). Los tests usan los bytes almacenados en `e2e/fixtures/comparisons/catalog-cover.jpg` mediante una ruta **sólo de imagen**; no interceptan lecturas de producto, autenticación o permisos. En el caso asíncrono se retiene y suelta la respuesta auténtica de detalle, sin reemplazar su cuerpo.

Los oráculos combinan pantalla, resultado Flight real de Server Action, petición real de participantes, identidad del nodo original, geometría DOM/rAF, scroll/foco nativos y journal de consola/red. La prueba ajena reproduce el action real con cookies de una segunda cuenta; no basta con comprobar que no aparece una opción en UI.

## Unidades, tipos, lint y build

- `npm test -- src/lib/comparisons/normalize.test.ts src/lib/comparisons/derive.test.ts`:38/38PASS.
- `npm test -- src/lib/comparisons src/components/comparisons`:12archivos/150pruebasPASS,5,13s.
- Mutante temporal: sustituir episodios únicos por número bruto de visionados del pase activo. Los casos completed/dropped fallan ambos con progreso esperado1/recibido2. Restauración en finally antes de la suite global;38/38GREEN posterior. No delta de producto. Se conserva un fallo de impresión Python cp1252; la salida causal UTF8 guardada y leída confirma los dos fallos de aserción.
- **Suite general anterior a los fixes** `npm test`:560archivos/5.594pruebasPASS,96,66s. Cinco notices jsdom de navegación a otro Document, ya en [#1463](https://github.com/borjar20/Biblioshare/issues/1463).
- `npx tsc --noEmit --pretty false`:PASS. Se corrigió exclusivamente un predicate nuevo que devolvía boolean|string, antes del build.
- `npm run test:ci:lint`:2.287fuentes/0errores/**31advertencias**. Lint focal de tests/fixture/config:0errores/0advertencias. Baseline histórico de31 advertencias en `2026-10-06-wrap-ups.md`; seguimiento vivo [#1464](https://github.com/borjar20/Biblioshare/issues/1464). No se atribuye limpieza total de lint.
- Primer build FAIL de preparación: red sandbox impide descargar Fraunces,Geist,GeistMono,Tiny5. Mismo comando/env con red aprobada:buildPASS,Next16.3.8,compilación4,3s,TypeScript44s,89páginas. BUILD_ID`0axv6uxSeb71na7zfwFW2`. No se sustituyen fonts ni se cambia producto.

### Advertencias de lint fuera de esta feature

Todas son `@typescript-eslint/no-unused-vars`, excepto la de barcode indicada.

| Archivo | Líneas (cantidad) |
|---|---|
| e2e/registrar-sesion-v2.spec.ts |275,317,438,516(4)|
| scripts/pet-pixellab/pack-strip.mjs |25(1)|
| src/app/buscar/barcode-scanner.tsx |48(1),`@next/next/no-location-assign-relative-destination`|
| src/app/club/[slug]/miembros/page.tsx |33(1)|
| src/app/club/[slug]/page.tsx |61(1)|
| src/app/importar/actions.ts |207(1)|
| src/components/avatar-upload.tsx |15(1)|
| src/components/clubs/club-cover-upload.tsx |15(1)|
| src/components/pet/training/training-session.test.ts |343(1)|
| src/components/play/score/score-setup-form.tsx |137(2)|
| src/components/sagas/regenerate-route-button.tsx |23(2)|
| src/lib/clubs/activities/core.ts |6(1)|
| src/lib/library/manage-actions.ts |11(1)|
| src/lib/people/get-person.ts |6(1)|
| src/lib/pet/battle/equipment.test.ts |29,84(2)|
| src/lib/pet/training/service.test.ts |115(1)|
| src/lib/play/ui/setup-draft.ts |96(2)|
| src/lib/social/voice-note-actions.test.ts |31(2)|
| src/lib/stats/period.test.ts |8,10,12(3)|
| src/lib/voice/voice-note-limits.test.ts |4(1)|

## Resultados de navegador

R1:12recorridos,worker1/retry0;4motionPASS(35,5s/17,2s/5,7s/11,6s),8FAILde preparación en la semilla de pases mixtos. Diagnóstico focal conserva HTTP400/PGRST102`All object keys must match`:review estaba sólo en la fila de película. Se añade review:null a serie, sin alterar dato/lectura de producto. Cleanup en cada intento.

| Ronda / build | Resultado y diagnóstico |
|---|---|
| R1 / `0axv6uxSeb71na7zfwFW2` | Motion4PASS;8integrados fallan preparación PGRST102, sin resultado de producto. |
| R2 / misma build | Privacidad10,6s y error/retry7,6s PASS;6 fallos de harness: label exacto Formato, texto UTF8 de retorno, alert no acotada y body CDP ausente. Se corrigen selectores según DOM real. Los journals de dos PASS no se persistieron por attachments body-only; no se repitieron sólo para recuperarlos. |
| R3 / `WaTVIDrFWDkb9lEF3xWrX` | Parcial: DTO no promete orden interno; oráculo corregido a ids ordenados con longitud/duplicados y lookup por userId. Título de episodio real reemplaza locator inventado. Runner42032 detenido antes de repetir la causa en restantes; cleanupREST PASS. No crédito two-tabs/volumen. |
| R4 / misma build |5PASS: CRUD18,5s; Gustos32011,4s/76811,4s/128010,8s; volumen27,0s. Two-tabs falla lectura body CDP. Se bufferiza sólo la acción real de guardar, conservando cuerpo/status/headers originales. |
| R5–R6 / misma build | Harness esperaba `/login` tras logout pero producto redirige `/`; después esperaba navegación automática a B. NULL durante logout desmonta correctamente: no se clasifica como bug. Se explicita frontera y navegación soportada. |
| R7 / misma build | Login streamed trae formulario oculto duplicado: se reutiliza visibleFormContaining, conserva unicidad visible. |
| R8 / misma build | Formulario /login anterior a login en otra pestaña produce POST HTTP307 por proxy autenticado y error React. Fuera de alcance: [#1465](https://github.com/borjar20/Biblioshare/issues/1465). |
| R9 / misma build | RED causal de privacidad: getUserA auténtico iniciado/retardado antes de logout/login B, RSC auténtico retenido; cookies/actor B comprobados antes de entregar A.32/35frames reabren evidenciaA. Corrección acotada del gate asignada y cubierta. |
| Título RED / misma build |320px: h3(41,194,238,165,56), cover(109,197,252,998,101,599,147,319), intersección10.826,909px²; scrollWidth351>client238. |
| Mapa RED / misma build | stage254×360; Ana/Beatriz78,03px² de colisión, sharedcount coincide con Felipe; Carlos estrecha y envuelve3líneas. |

Estas tandas anteriores no forman un12/12 sobre la build final. La corrección de estados aislada conservaba la cobertura anterior de privacidad/error porque sólo cambiaba la etiqueta de serie, pero los cambios posteriores de gate y layout compartido justifican nueva suite general y todos los recorridos de navegador.

### Correcciones acotadas con regresión causal

- Estados canónicos: `completed`→Terminada; `dropped`→Abandonada; `in_progress`→En curso. WorkDetailRED3FAIL/3PASS→GREEN6; no normalizador/esquema nuevo.
- Gate: un nuevo focus/visibility durante getUser invalida el resultado en vuelo, mantiene evidencia oculta y coalesce una comprobación fresca tras settle. Máximo una petición auth activa; resolve/error/reject antiguos no validan; mismo actor conserva contexto, mismatch/null desmonta; unmount/authinvalidate no crea petición en cola. RED4FAIL/29PASS→GREEN33. Sin provider/proxy/SDK/schema changes.
- Título: wrapper completo bajo la portada original, h3 envuelve texto entero; ResizeObserver mide wrapper completo. Cover/camera/Scene/720ms intactos; espacio mediante scroll normal. Oráculo DOM exige título/portada sin intersección, texto sin clipping y glyph rects dentro del stage.
- Mapa denso<=360px,>=5: mismo punto radial para nombres, líneas SVG y piles; mundo/SVG3400unidades evita letterbox. centerY1700/radiusY1600 y giroπ/(2count) para impares; ancho intrínseco de chip. Los nombres68×47 a stage254 de grupos5–10 están dentro/sin intersecciones; RED9personas256,214px²→GREEN19geometría. No tweak de fixture/nth-child, Venn/wide/pair/trio sin cambio. Commit de producto `5c2019176a354dee51a18a5d4c2b9b1e17ac0946`.

### Instrumentación y mediciones anteriores

`route.fetch` reenvía la misma petición una vez con cookies/headers del navegador; `route.fulfill({response})` devuelve body/status/headers originales. [Documentación Playwright](https://playwright.dev/docs/api/class-route#route-fetch) y [fulfill](https://playwright.dev/docs/api/class-route#route-fulfill) consultadas mediante Context7. Sólo se retarda transporte auténtico para probar carreras/asincronía; no se sustituyen sesiones ni DTO. Los casos volumen/guardar bufferizan HTTP real para evitar el fallo CDP `No data found for resource with given identifier`. Se miden bytes del body recibido y tiempo con esa instrumentación, sin afirmación de benchmark publicado.

R4:10personas,1.205pases de libro de Beatriz,1.207obras de catálogo,1.292PersonWork,1.293pases brutos (incluye terminado antiguo reemplazado); login/create/load14.764ms; actualización4.435ms; Flight sin comprimir361.166bytes. rAF movimiento718,2/716,9/718,1ms para320/768/1280;99/96/68frames; stage5547/5384/5384; ancho documento320/768/1280; scroll5776/3005/2316 restaurado. Todos pageErrors0; requests200; DNS de portada placeholder y aborts de RSC/actions se conservan, sin claim de logs limpios.

[Mediciones R4](assets/2026-10-10-entre-nosotros/measurements.json), [título RED](assets/2026-10-10-entre-nosotros/series-320-title-red.png), [título bBoxes RED](assets/2026-10-10-entre-nosotros/work-title-red.json), [auth RED](assets/2026-10-10-entre-nosotros/stale-auth-red.json), [mapa RED](assets/2026-10-10-entre-nosotros/ten-person-mobile-map-red.png) y [bBoxes RED](assets/2026-10-10-entre-nosotros/ten-person-mobile-map-red.json). La [captura intermedia R3](assets/2026-10-10-entre-nosotros/series-1280-during.jpeg) es un frame real click+357,826ms previo al nuevo layout; [provenance](assets/2026-10-10-entre-nosotros/intermediate-frame-provenance.json), no se presenta como captura final.

### Gate final

Suite general final única tras estabilizar gate/layout: `npm test`,560archivos/**5.610testsPASS**,88,84s,exit0; mismas5notices#1463. La anterior5594PASS cubría el estado pre-fix; el cambio material de privacidad/layout justifica esta ejecución adicional. Covering final166PASS,geometry19PASS; TypeScript y eslint scoped exit0. Build finalPASS `AzNCV4SAaUJ6YTFacyCNy` (compile11,8s/types7,8s). Se detuvo sólo el viejo next start46900 y se arrancó el nuevo32352 (session1770),ready329ms; todos los procesos usan overrides locales antes de leer.env.local. Ningún runner estaba activo al cambiar servidor.

Tanda final12: **11PASS/1FAIL de captura CDP**,2,4min. Trayectoria15,0s/wheel13,1s/reducedmotion4,7s/mobiletouch9,5s/CRUD17,1s/Gustos32011,4s/76810,4s/two-tabs14,3s/privacy9,5s/error7,2s/volumenPASS. El fallo1280 es `response.text: Network.getResponseBody No data found for resource with given identifier` en la lectura de cuerpo, antes del oráculo de producto. Se lee el cuerpo de la respuesta original ya bufferizada por route.fetch antes de hold/fulfill, sin segunda petición ni reemplazo. **Repetición focal únicamente1280PASS10,8s (11,9s total)** en la misma build; no se repite global/build. Los12recorridos quedan cubiertos por esta tanda más esa repetición, sin presentarlos como una tanda única12/12.

[Mediciones finales y journals resumidos](assets/2026-10-10-entre-nosotros/final-measurements.json) y [trayectorias DOM finales](assets/2026-10-10-entre-nosotros/cover-trajectories-final.json). Journals de8integrados más1280focal: pageErrors0; bodyState complete/unavailable conserva los fallos CDP; cuerpos de privacy/revoke/block/delete y retry se leen realmente y los oráculos pasan. Requests abortados en navegación/cambio auth y DNS del asset placeholder permanecen registrados. Readerror produce ERR_FAILED deliberado. No claim de consola/red totalmente limpias.

| Viewport | Movimiento medido | Frames | Stage final | Título scroll/client | Intersección h3/cover | Scroll restaurado |
|---|---:|---:|---:|---:|---:|---:|
|320|734,3ms|98|5771px|238/238|0px²|5776px|
|768|717,5ms|95|5528px|654/654|0px²|3005px|
|1280|718,7ms|68|5500px|1150/1150|0px²|2316px|

La captura320 final coloca h3(41,502,238,165,5625) por debajo de cover(109,197,252,998,101,599,147,319): el hero no cambia. Texto entero/glyph rects dentro, serie40episodios y Terminada/Abandonada reales; último episodio accesible por scroll nativo y retorno al mismo nodo/foco. [320claro](assets/2026-10-10-entre-nosotros/series-320-light.png), [320oscuro](assets/2026-10-10-entre-nosotros/series-320-dark.png), [768claro](assets/2026-10-10-entre-nosotros/series-768-light.png), [768oscuro](assets/2026-10-10-entre-nosotros/series-768-dark.png), [1280claro](assets/2026-10-10-entre-nosotros/series-1280-light.png), [1280oscuro](assets/2026-10-10-entre-nosotros/series-1280-dark.png), [detalle libro móvil](assets/2026-10-10-entre-nosotros/mobile-book-final.png).

Auth [GREEN durable](assets/2026-10-10-entre-nosotros/stale-auth-green.json): Aforward1791637610876, held0941; logout1921; RSC auténtico200 held2213; loginB/profileverificado2500; focus2518; A released2518/delivered2521. DosgetUser,33frames,0oldVisible; boundarymounted=true después de liberarA. Oldcomponent sigue montado mientras responses RSC originales están retenidas; gate mantiene evidencia oculta y el check fresco desmonta contextoA. RSC se entrega intacto después; navegación explícita a comparación con queryA verifica B sin grupoA, sin Stage, perfilB. No se exige navegación automática ni se fuerza estado de sesión.

Volumen final: **10personas,1.205pases de libro de Beatriz,1.207catalogWorks,1.292PersonWork**,1.293pases brutos; login/create/load10.740ms; refreshinstrumentado4.007ms; originalFlight361.170bytes. El tamaño varía4bytes respecto R4 por serialización/ids, no se infiere cambio de rendimiento. [Mapa320 página completa](assets/2026-10-10-entre-nosotros/ten-person-mobile-map-full-page.png) y [bBoxes](assets/2026-10-10-entre-nosotros/ten-person-mobile-map.json): stage(33,1043,254,1019), diez nombres dentro en x/y, scrollWidth<=client+1,0intersecciones de nombres pares ni con summary/cover; Diana Ana QA68×47 prueba dos líneas. Summary(96,5,1921,1875,127,95), Felipebottom1896,44 deja24,75px de separación. La etapa crece y usa scroll normal.

## Límites y limpieza

Sólo Chromium local con backend desechable. No acredita CI del HEAD integrado, Android ni producción. El servidor registra `The destination stream closed early`(digest3204442879) durante el bloque motion/login-navegación de R1;se conserva en [#1263](https://github.com/borjar20/Biblioshare/issues/1263),sin inferir causa común ni declarar logs globales limpios.

Task5M1 observado en keyboard CRUD R4: tras confirmar borrado, activeElement=BODY. El control de confirmación se elimina; root hará triage final, sin corrección incidental. Los notices jsdom siguen #1463 y las31advertencias #1464.

Repro fuera de alcance #1465: abrir /login anónimo en tab1; completar loginA en tab2; enviar formulario antiguo tab1 paraB. `src/lib/supabase/proxy.ts:7` AUTH_PATHS y140–141 redirigen cuando hasProfile, independientemente del método; POST/login307 produce “No se pudo cargar”. Login soportado tras logout funciona. No se versionan traces con credenciales.

Suplemento visual separado: el recorte de stage alto colocaba header/nav sticky encima de nombres/recuento por stitching. Se conserva [ese recorte](assets/2026-10-10-entre-nosotros/ten-person-mobile-map.png) con esa limitación; la captura de [página completa real](assets/2026-10-10-entre-nosotros/ten-person-mobile-map-full-page.png) se toma desde scroll0 sin ocultar UI. Sólo se repite volumen,20,3s(21,2s total),misma build, sin global/build/otros tests nuevos. Los diez nombres, nombre de dos líneas, recuento y controles se leen sin intersección propia; header/nav quedan fuera del mapa en la captura completa. [bBoxes suplemento](assets/2026-10-10-entre-nosotros/map-supplement-bboxes.json), [métricas propias](assets/2026-10-10-entre-nosotros/map-supplement-measurement.json):9.858ms login/create/load;3.247ms refresh;361.170bytes, mismos10/1205/1207/1292. Estas cifras no sustituyen silenciosamente las de la tanda final.

Cleanup final [audit real](assets/2026-10-10-entre-nosotros/cleanup-audit.json): exactAuthFixtureUsers/profiles/books/movies/series0; grupos/pases/episode_watches totales locales0, tras finally de todas las tandas y suplemento. Persistentes devtest/codex_qa remotos no se mutaron: todas las operaciones de fixture recibieron el host local54321; globalSetup/sweep deshabilitados. Instancia/Docker local del controlador preservada. Servers propios13984/46900/32352 detenidos; último32352 tree taskkill correcto, port3000 libre; exit1 de session1770 es terminación esperada, no un gate fallido. Archivo ignorado propio.env.comparison.local eliminado; .env.local preservado. Ningún worktree/servidor/watcher nuevo pendiente. El start final sólo registra el PT409 deliberado del conflicto de pestañas; #1263 stream-close se observó en R1, no se atribuye al conflicto ni se declara limpieza global de logs. Todos los JSON duraderos revisados no contienen headers Authorization/Set-Cookie, passwords, tokens/JWT/servicekey; sólo identidades de fixture, estados, tiempos y evidencia. Los traces temporales no se copian al repo.


Observación M2 para revisión final del controlador: selectGrupo a320px queda estrecho (sólo flecha) junto Crear/Editar; heading mantiene el nombre del grupo. Root lo inspeccionó en fullPage y dejó deferred junto M1, sin cambio incidental ni nueva afirmación de defecto bloqueante.
