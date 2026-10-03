# Testing manual / con agentes

> **[Canónico · verificado contra código el 2026-08-19; arranque, Ajustes, retorno administrativo, recursos y contrato de pruebas del hero, zoom, errores y checkpoints finales/anteriores del entrenamiento, lecturas previas de pases y contrato histórico de replay verificados el 2026-10-01 (#1073/#1274/#1271/#1208/#1278/#1287/#1171/#1281/#1284/#1110/#1116); frontera de endpoints de OpenLibrary verificada localmente y en CI/CodeQL el 2026-10-02 (#1292); filtros de tipo verificados contra código y navegador local el 2026-10-02 (#1295); cuota de altas Google Books verificada en local/dev, SQL en prod y CI el 2026-10-02 (#1237); cobertura del pipeline de abandonos #773 y alias del perfil propio #1325 verificados el 2026-10-03 (38 unitarios focales y ocho casos nativos, respectivamente); edición de pases por la vista autorizada #1345 verificada el 2026-10-03 (55 unitarios focales, 29 comprobaciones SQL con rollback, navegador dev, TypeScript y ESLint)]**

## Cuenta de desarrollo persistente

En vez de hacer signup + onboarding cada vez que hay que probar algo en el
navegador, usa la cuenta ya creada y con onboarding completo:

- Credenciales en `.env.local`: `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `TEST_USER_USERNAME`.
- Login directo en `/login` — sin pasos previos.
- **No borrar nunca esta cuenta** como parte de la limpieza de un test. Es
  persistente para todo el proyecto.

### Cuenta persistente de Codex

Creada y verificada el 2026-09-06 por petición de José Ángel:

- Proyecto: **biblioshare-dev** (`tyvzpuhxfwxrnkcpzxyg`).
- Usuario: `codex_qa`; correo ficticio: `codex_qa@biblioshare.test`.
- Credenciales e ID en **`.env.codex-test.local`**, excluido de Git. Cargarlo
  explícitamente cuando una prueba use esta cuenta; no sustituye `.env.local`
  ni cambia la cuenta de desarrollo existente.
- Rol `user`, onboarding completado e inicio de sesión con contraseña verificado.
- Cuenta persistente: conservarla entre pruebas. El dominio `.test` la separa
  del barrido de cuentas desechables `@example.com` de `sweep-disposable.ts`.
- Guardar la contraseña únicamente en el archivo local; en documentación,
  issues y memoria usar esta referencia.

### Qué limpiar y qué no, tras probar algo

- Si la prueba añade ítems a la biblioteca de `devtest` (`passes` —la tabla
  `diary_entries` ya no existe, se renombró en la migración del hub—,
  `library_entries` si tocara, filas nuevas en `books`/`movies`/`series`):
  bórralas por SQL al terminar, igual que se hacía con los usuarios de un solo
  uso.
- Si la prueba requiere un **segundo usuario** (p. ej. verificar cómo ve otro
  visitante un perfil público/privado), crea uno nuevo desechable con el
  patrón habitual (`signup` → username único → probar → borrar el usuario
  completo, incluida la fila de `auth.users`, al terminar). Esos sí se crean
  y destruyen por test.
- Deja `devtest.is_public = true` al terminar (es su estado por defecto);
  si una prueba lo cambia a privado, reviértelo antes de acabar.

### Un e2e que escribe limpia por REST, ANTES y DESPUÉS, nunca por la UI

Convención obligatoria para los specs de `e2e/` (issues #180, #182, #215, #228):

1. **Antes y después, no solo después.** Limpiar solo en un `finally` no basta:
   el día que una pasada muera por timeout, Playwright derriba el contexto, el
   `finally` no termina y la suciedad queda puesta *para siempre* — la pasada
   siguiente la lee como su estado de partida. Limpiar también **al principio**
   (dentro del `try`) es lo que rompe ese ciclo de auto-envenenamiento.
2. **Por REST con la service key, no por la UI.** Un `finally` que necesita
   navegar y pulsar «Guardar» no se ejecuta si el navegador ya no está. Un
   `DELETE`/`PATCH` a PostgREST no depende de nada del navegador.
3. **Las precondiciones van DENTRO del `try`.** Si la aserción que comprueba el
   estado de partida vive fuera, una pasada sucia muere ahí y el `finally` ni se
   ejecuta.
4. **Siembra tu propia precondición; no la asumas del entorno.** Si el test
   necesita que exista un dato (un pendiente para que el sorteo tenga pool, una
   ruta sin adoptar…), créalo por REST con UUID fijo y bórralo al acabar. Dar
   por bueno lo que hubiera en dev es lo que dejó `happy-path` en rojo
   permanente cuando esos datos se evaporaron (#228).
5. **No claves datos que sean de una API externa.** Un locator que fija el
   número de ediciones que devuelve OpenLibrary convierte un cambio de ranking
   suyo en un rojo tuyo — pasó en `busqueda-hidratacion` (#228). Comprueba la
   FORMA (`/\d+ ediciones/`, «es un enlace y no un botón»), no la cifra.
6. **Nada de fechas atrasadas al sembrar para el feed** (#731). La primera
   página de Inicio son los **21 posts más recientes** de `devtest` ∪ sus
   seguidos (`pageSize + 1`, orden `created_at desc`, recorte ANTES de agrupar:
   `src/lib/social/feed.ts:571-578` y `:610`). Un post sembrado con
   `created_at` de hace unos días compite contra la actividad real de la cuenta
   compartida —36 posts más nuevos que 2 días en la medición del 2026-08-25— y
   **no llega a la página**, así que el test depende de cuánto se haya usado
   `dev` esa semana. Siembra con fechas de AHORA, separadas por minutos si
   necesitas orden entre ellas. Costó un `fixme` y dos diagnósticos falsos.
7. **Si un test depende de otro, que lo imponga un assert, no un comentario**
   (#744). `pase-hub.spec.ts` encadena tres reglas sobre un `bookId` que fija la
   primera, dentro de un `describe.serial`. Correr una suelta con `-g` deja fuera
   a su predecesora y el fallo sale 20 s después como «no encuentro el botón
   Leyendo»: un síntoma que no nombra la causa y que hizo abrir una issue contra
   el producto. Una guarda al entrar (`expect(bookId, "…").not.toBe("")`) lo
   convierte en 124 ms y un mensaje que se explica solo.

Ejemplos vivos: `e2e/sagas-v2.spec.ts` (`adminHeaders`/`deleteSagaFollow`,
limpieza antes y después), `e2e/sagas-itinerarios.spec.ts` (`clearRouteChoice`),
`e2e/happy-path.spec.ts` (`seedPendingPass`/`clearPendingPass`) y el
`globalSetup` de `e2e/support/qa-seed.ts`, que reimpone la línea base de la
semilla QA de sagas antes de toda la suite.

**Semillas QA que hay que crear ANTES de correr los e2e de sagas** (issue #177).
`qa-seed.ts` solo RE-NORMALIZA filas que ya existen; NO crea el universo. Los
specs de itinerarios (`sagas-itinerarios.spec.ts`) navegan contra un universo QA
dedicado que, hasta la #177, solo vivía sembrado a mano en dev — quien no lo
tuviera veía timeouts de Playwright ("heading not visible") sin pista de qué
falta. Ese escenario está ahora versionado e idempotente en
`e2e/fixtures/seed-sagas-itinerarios.sql`; córrelo una vez contra dev antes de
esa suite (SQL editor, MCP `supabase-dev`, o `psql "$DEV_DB_URL" -f
e2e/fixtures/seed-sagas-itinerarios.sql`). El resto de universos QA de sagas
(p. ej. `[QA Sagas v2] Era Uno`) siguen sin script de creación versionado: es
deuda de cobertura conocida, no la introdujo la #177.

## Verificación de UI: E2E automático con Playwright (por defecto desde 2026-07-15)

**Metodología actual**: tras implementar algo con UI, el camino por defecto
es verificarlo de forma automática — **E2E con Playwright** (`npm run
test:e2e`, specs bajo `e2e/`, ver el agente `test-author`) y/o un agente
conduciendo el navegador (`qa-verifier`, o cualquier subagente usando
Playwright/Preview MCP). Ya no hace falta pedirlo explícitamente por
nombre: es el camino por defecto para "verifica esto" / "pruébalo en el
navegador" tras implementar una feature de UI.

- Si la feature necesita cobertura duradera, escribe o actualiza un spec en
  `e2e/` (de eso se encarga `test-author`) y corre `npm run test:e2e`.
- Para una verificación puntual de principio a fin en el navegador (login,
  ejercitar el flujo, revisar consola/red, limpiar datos), usa
  `qa-verifier`.
- Verificación no-UI (tsc/eslint, consultas SQL de solo lectura, lectura de
  archivos) la sigue haciendo el agente directamente, como siempre.

### Arranque automático en Windows (#1073)

`playwright.config.ts` reutiliza el servidor que ya escuche en 3000 y, si no
hay ninguno, ejecuta `npm run dev` con un límite de 120 s. Para uno o dos
specs no es obligatorio arrancarlo a mano. Conserva un único servidor y el
Node admitido por `package.json`/`.nvmrc`; comprueba el ejecutable del proceso
de Next, porque el shim de npm de Windows puede usar otro Node.

El incidente aislado de #1073 no se reprodujo el 2026-10-01: seis arranques
automáticos, tres con caché previa y tres sin `.next`, escucharon en
1,71–1,94 s y sirvieron `/login` con HTTP 200 en 3,16–8,55 s. Cada pasada
comprobó en Chromium el formulario visible y terminó su servidor. La caché
previa se apartó y restauró; no se aumentó el timeout.

Esto verifica el arranque actual, no toda la suite ni la causa del incidente
de septiembre. El control inicial de los cinco tests dio un PASS y cuatro
FAIL; con `localhost` y onboarding completo dio cuatro PASS y un FAIL de
redirección (#1271). Las sospechas #1272/#1273 se descartan bajo esas
precondiciones. El flujo de Ajustes pasó incluso cuando registraba el error
de prerender de #1274; su corrección posterior aporta una frontera de carga
propia y pasa seis recorridos en dev y seis contra build/start local, sin ese
error. La redirección de #1271 no formó parte de ese lote de seis: su arreglo
posterior conserva subruta/filtros y pasa ocho recorridos en dev y ocho en
build/start local, incluidos los rechazos del usuario sin rol admin.
Entorno, controles y evidencia: [verificación de #1073](testing/2026-10-01-playwright-startup-1073.md).
Corrección y límites: [Ajustes con Suspense](testing/2026-10-01-ajustes-suspense-1274.md).
Retorno tras login: [destino administrativo](testing/2026-10-01-admin-login-return-1271.md).

### Cuota de altas nuevas de Google Books (#1237)

`e2e/ci/google-volume-quota.spec.ts` cubre el rechazo de la alta 61,
reintento tras vencer la hora, reutilización de una fila existente y el
mensaje distinto de la cuota de peticiones, a 320/1280 px. Sólo se simulan
proveedores para ISBN sintéticos registrados por el caso; login, acciones,
RPC y contadores son reales. El aviso comparte celda con la tarjeta y queda
asociado mediante `aria-describedby`. Las credenciales no se guardan en traces; cada actor y sus
filas se limpian por REST y SQL, con Auth 404 y residuos a cero.

El SQL añade 41 checks y un comprobador de dos carreras con bloqueos reales
a `scripts/db/verify.mjs`. En el head integrado `b94d0dad`, la última tanda
local pasa los cuatro casos permanentes contra un build nuevo Node24 en
24,814 s, sin FAIL/SKIP/flaky/reintentos: 28 fuentes estables y cuatro actores
Auth 404, ocho tablas y cuotas/catálogo propios a cero. Las tandas anteriores
de ocho y cuatro casos se conservan como historia, sin sumarlas a esta.

La CI de ese head pasa 3956 unitarios en 407 archivos y 75 casos de navegador,
incluidos los cuatro de cuota. Tanto critical-flows como el bootstrap
independiente pasan 41 checks SQL, dos carreras y 272 pasos, con cleanup
correcto; el generador pasa 7/7 y CodeQL tiene cero resultados en la ref de
la PR. Los ocho checks son SUCCESS. El SQL está aplicado y sus objetos,
permisos y RLS verificados en prod. La entrega mediante PR #1291 exige
los checks obligatorios del commit de entrega antes del merge. La prueba no
valida la existencia del ID remoto ni su hidratación canónica (#1290),
y el componente de añadir sin consumidor publicado sólo queda cubierto por unitarios.
Evidencia, fallos conservados y límites:
[cuota de Google Books](testing/2026-10-02-google-books-creation-quota-1237.md).

### Imágenes del hero (#1208)

`e2e/ci/hero-images.spec.ts` crea cinco obras propias en Supabase local y
comprueba las peticiones de imágenes de película/serie, libro Google Books,
OpenLibrary y portada TMDB. Usa 375px/DPR 1, 2 y 3, y 640/1024/1600px/DPR 1.
El contrato es: una prioridad explícita alta, bucket de backdrop suficiente,
identidad independiente de portada y fondo para película/serie, misma URL
efectiva para portada/fondo del libro y dimensiones sin desbordar. El conjunto
de URLs solicitadas debe coincidir con esos recursos: una URL adicional falla.
Los 30 casos pasan contra build/start, sin reintentos, y borran sus cinco filas.

Las imágenes sintéticas se interceptan por la marca propia; esto verifica
URL y selección responsive. `page.route()` desactiva la caché HTTP; varias
peticiones de la misma URL quedan en el adjunto y no prueban un fallo de
reutilización. No se miden caché real, ahorro de bytes ni LCP del CDN.
Los tamaños w300/w780/w1280 también respondieron HTTP 200 en un HEAD público
acotado. El original de `ImageZoom` es una superficie distinta de las dos
imágenes visibles; #1278 difiere su montaje hasta abrir el visor. Evidencia
del hero, fallos iniciales del test y límites:
[recursos del hero](testing/2026-10-01-hero-images-1208.md).
Corrección del contrato de la prueba y FAIL de CI conservado:
[URLs seleccionadas y caché HTTP](testing/2026-10-01-hero-resource-contract-1287.md).

### Original del visor de imágenes (#1278)

`e2e/ci/image-zoom-loading.spec.ts` comprueba película TMDB, libro Google
Books, avatar Storage y portada de club en móvil/escritorio, cerrando por
Escape y por clic. Son 16 casos contra build/start, incluidos automáticamente
por `playwright.ci.config.ts`. Crean dos obras, un club y un actor propios
en Supabase local, y verifican su borrado por REST y Auth 404 al terminar.

Antes de abrir, el diálogo no tiene imagen original. Para los tres orígenes
con miniatura distinta no existe petición de la URL original; al abrir se
sirve esa URL completa. El diálogo es modal, tiene nombre accesible, devuelve
el foco al disparador y reabre sin peticiones adicionales. El club ya usa la
URL completa en su portada visible: allí no se atribuye ahorro de red al visor.
Solo se interceptan recursos sintéticos propios; no se miden bytes ni LCP.
El guard para cambios de `src` se revisa por lectura, sin simular esa edición
en el navegador. Evidencia, FAIL conservados y limpieza:
[original del zoom](testing/2026-10-01-image-zoom-loading-1278.md).

### Errores y recuperación del entrenamiento (#1171)

`e2e/ci/training-errors.spec.ts` cubre seis causas en 320 y 1280 px contra
build/start: conexión al iniciar, sesión caducada al iniciar y al resolver,
versión desconocida, snapshot inválido y mascota ausente. Usa acciones reales,
cookies reales y un actor propio en Supabase local; no simula respuestas RSC.
Comprueba mensaje/acción, destino y foco del login, intent/decisiones, conservación
de la partida incompatible y una resolución con los mismos inputs tras volver
a autenticarse. Recuperar un checkpoint abierto mantiene la pausa intencionada.

Son 12 casos sin reintentos, con cero errores de página/desbordamiento. Los
70 unitarios de sesión/panel cubren además UNAVAILABLE, replay, aventuras y
LOCAL_RECOVERY. La pasada final y el barrido agregado de once actores verifican
Auth 404 y ocho superficies vacías, sin tocar cuentas persistentes. FAIL previos,
recuperación del tick final corregida por #1281 y límites de aquella entrega:
[errores del entrenamiento](testing/2026-10-01-training-error-actions-1171.md).

### Recuperación de un combate ya terminado (#1281)

El checkpoint nuevo guarda su estado final y reconstruye también el último
tick sólo si había terminado. Los abiertos, los interludios de aventura y
los logs antiguos sin marca siguen recuperándose en pausa; un marcador
incoherente sigue el camino LOCAL_RECOVERY.

79 pruebas de sesión/panel/errores pasan, con finales por KO y por límite,
las cuatro versiones conservadas y compatibilidad legacy. Los dos casos
`resolution-authentication` del spec anterior ahora exigen resultado tras
una sola pulsación, sin otro tick manual: misma fila, intent, inputs y digest
idéntico a la repetición real. Pasan en 320/1280 px contra build/start local.
Cuatro actores propios ausentes de Auth y ocho superficies a cero; 3000 libre.
El formato anterior recibe el tratamiento explícito de #1284, debajo.
Evidencia de aquella entrega: [checkpoint final](testing/2026-10-01-terminal-checkpoint-1281.md).

### Recuperación de checkpoints anteriores (#1284)

Un log válido sin `ended` que se reconstruye abierto conserva la pausa y
explica su recuperación. Salir/volver/recargar antes de continuar conserva
el aviso y el formato anterior. La acción existente «Continuar» consume el
aviso y normaliza de inmediato el checkpoint, con el mismo intento e inputs.
No se infiere el final ambiguo ni se reanuda automáticamente una partida.

81 unitarios de sesión/panel/errores pasan. Diez casos reales en 375/1280 px
contra un build nuevo comprueban el abierto/final antiguo, sus equivalentes
modernos y corrupción. El final r2.2 con una habilidad real conserva fila,
intent, inputs, resultado y digest tras reautenticarse y continuar; los logs
sin marca permanecen en pausa hasta esa elección. Aviso y controles legibles,
cero errores de página/desborde, siete actores Auth 404 y ocho superficies a
cero. El interludio se cubre por unitarios, sin prometer un E2E de aventura.
FAIL de preparación, artefactos y límites:
[formato anterior](testing/2026-10-01-legacy-checkpoint-recovery-1284.md).

El spec CI de errores conserva sus doce casos y añade dos regresiones del
final antiguo r2.2, 320/1280 px. Ambos pasan contra el mismo build, con
conservación del log tras recargar y resultado/digest real tras continuar.
El reloj de cada pausa se obtiene del navegador, después de mostrar la UI;
usar Date.now de Node tras runFor puede intentar pausar en el pasado.
Limpieza conjunta de las nueve cuentas de preparación/QA/regresión verificada.

### Lecturas previas al guardar un pase (#1110, #1345)

`src/lib/passes/actions.test.ts` fuerza por separado el fallo de lectura de
fechas al cerrar y el de reseña previa al editar. Ambos deben devolver
`generic`, sin escrituras, avisos de menciones ni revalidación. La lectura
previa conserva el cálculo de sólo las menciones nuevas.

**La reseña se lee por `pass_reviews`, con filtros de pase y propietario.**
El SELECT de `passes.review` está revocado deliberadamente para proteger
reseñas privadas; conservar permiso UPDATE no permite leer esa columna.
#1345 reprodujo el error 42501 de esa lectura previa, que bloqueaba editar
tanto pases de «ver juntos» como individuales. Los dobles anteriores
permitían una lectura prohibida: el guard de #1110 era correcto, pero no
probaba los permisos reales.

La regresión nueva modela esos permisos y pasó de devolver `generic` a
persistir fecha, nota, reseña, spoiler y privacidad, avisando sólo de la
mención añadida. El lote focalizado de acciones, lecturas y menciones pasa
55 casos en cuatro archivos; TypeScript completo y ESLint de los dos
archivos de acciones también pasan. Revisión independiente sin hallazgos.

`supabase/tests/pass_review_edit_permissions.sql`, integrado en
`scripts/db/verify.mjs`, verifica 29 condiciones con roles reales: dos
miembros aceptados y un pase individual, lectura propia por la vista,
escritura del payload de edición, vínculos/post/metadatos conservados y
reseñas privadas inaccesibles a terceros y anónimos. Ejecutado en dev el
2026-10-03 desde el archivo exacto, con rollback y cero perfiles/películas
de prueba restantes. No hay cambios de esquema ni permisos.

Chromium real contra dev verificó edición de reseña, después fecha y nota,
y persistencia de los tres campos al recargar; el vínculo se conservó.
La segunda pasada tuvo cero errores de consola y POST de guardado 200.
El fixture de navegador tenía un miembro aceptado: la prueba con dos
participantes corresponde al SQL anterior. No hubo RED en navegador;
el parche ya estaba aplicado al terminar la preparación. Fixtures
eliminados, cuenta persistente conservada y puerto 3000 libre al acabar.

La evidencia histórica de los guards se conserva en
[lecturas previas de pases](testing/2026-10-01-pass-prerequisite-reads-1110.md).
El diagnóstico y la evidencia de integración y despliegue se
rastrean en [#1345](https://github.com/borjar20/Biblioshare/issues/1345).

### Contrato de resultados históricos de combate (#1116)

El resultado compartido de `replayBattle`, `TrainingBattle` y la resolución
de aventuras acepta `fight` opcional: r2.2/r3.1 no guardaban ese campo.
Las versiones congeladas mantienen sus tipos y sus resultados originales.
Los adaptadores ya no fuerzan sus retornos al tipo de una versión posterior.

El lote de replay, releases, entrenamiento histórico, servicio de entrenamiento
y servicio de aventuras pasa 46 casos. Las assertions de tipo se verifican
con `tsc --noEmit`, no con el mero transpile de Vitest. Los fixtures normativos
de r2.2/r3.1/r4.2 conservan resultado, eventos y digest exactos; el control de
releases conserva los cuatro manifiestos. No se transforma ningún payload.
El RED de tipos, el reporte nativo y los límites están en
[resultados históricos](testing/2026-10-01-historical-replay-result-types-1116.md).

### Frontera de endpoints de OpenLibrary (#1292)

`src/lib/catalog/openlibrary/endpoint-boundaries.test.ts` llama a las seis
funciones públicas de obra y a `resolveWorkKey`/`lookupIsbn`, con un spy de
`fetch`. Rutas relativas, query, fragmentos, escapes, barras invertidas,
URLs absolutas y tipos incompatibles deben devolver la salida vacía existente
sin ninguna petición. Mantener el hostname no basta: se comprueba también
que el identificador no pueda cambiar el endpoint.

Los controles positivos conservan `OL45804W`, `works/OL45804W`,
`/works/OL45804W` y la forma histórica `/OL45804W`; todas se normalizan a
`OL45804W`, dentro del formato `OL[0-9]+W`. Los ISBN-10/13 se normalizan y validan por checksum,
incluidos guiones y `x` final. La work key devuelta por el proveedor se valida
antes de pedir la obra. Se verifican las URLs exactas, las cachés existentes,
los límites de paginación, la tolerancia a una página fallida y el fallback
a los datos de edición. `fetch` conserva las redirecciones por defecto para
el recorrido legítimo ISBN→edición.

El 2026-10-02, con Node 24.19.0, pasan 80 pruebas focales en cinco archivos
y 256 de módulos afectados en dieciséis, con cero FAIL y cero pendientes;
lint focal y `tsc --noEmit` también pasan. El RED de 57 PASS/16 FAIL queda
conservado. Son pruebas locales con respuestas controladas: no comprueban
la disponibilidad de OpenLibrary ni los redirects de un proveedor
comprometido. La CI de entrega pasa 3950 unitarios, 67 casos de navegador y
CodeQL sin resultados; el informe identifica el head y sus límites. Evidencia y sello:
[frontera de endpoints](testing/2026-10-02-openlibrary-endpoint-boundaries-1292.md).

### Filtros de tipo en Buscar y alta manual (#1295)

`TypePills` permite saltar de línea cuando sus tres enlaces no caben.
El baseline de Buscar a 320 px sobresalía 9,17 px de su contenedor, aunque
documento y body seguían midiendo 320 px. El cambio conserva textos,
dimensiones de cada enlace, selección y destinos; no reduce ni recorta el
control para hacerlo caber.

La QA contra build/start local pasa ocho casos: Buscar con query vacía,
corta y larga, más el formulario manual real, cada uno a 320/1280 px.
Después de `document.fonts.ready`, comprueba enlaces dentro del contenedor
y documento/body dentro del viewport, con cero FAIL, SKIP, flaky y retries.
Un actor temporal collaborator acredita la ruta y campos del alta manual;
las ocho capturas se inspeccionaron. Contenedor y scrollWidth de Buscar son
288 px en móvil; el formulario manual conserva sus 400 px máximos en escritorio.

La regresión durable `e2e/ci/search-type-pills.spec.ts` pasa cuatro casos
contra el mismo build, verificando geometría, selección y navegación de
teclado por las tres opciones. Se recoge por el glob existente de
`playwright.ci.config.ts`, sin modificar la configuración. Para repetirla:

```sh
npx playwright test e2e/ci/search-type-pills.spec.ts --config=playwright.ci.config.ts
```

Los ocho casos de QA y los cuatro del spec son tandas distintas. Lint focal,
TypeScript y listado del spec pasan; el listado no sustituye su ejecución.
Limpieza local verificada: actor Auth 404 y ocho tablas/cuotas/obras/pases
a cero, Supabase detenido con backup conservado y puerto 3000 libre.
Antes de mergear la PR deben pasar sus checks obligatorios. Baseline, FAIL
del harness conservados, artefactos y límites de esta verificación local:
[filtros de tipo](testing/2026-10-02-search-type-pills-1295.md).

### Tandas largas: córrelas por lotes (issue #584)

**No lances una familia entera de specs de una vez en la máquina de 8 GB.**
`npm run test:e2e -- club-` son 23 tests con un worker, y a mitad de la tanda el
dev server se MUERE por falta de recursos: los que quedan caen en cascada con
`net::ERR_CONNECTION_REFUSED` y `worker process exited unexpectedly
(code=3221225794)` (`0xC0000142`, STATUS_DLL_INIT_FAILED). El 2026-08-11 eso dio
17 passed / 6 failed **de los cuales cinco eran puro entorno**. No es flakiness
de ningún test: es acumulación — los mismos ficheros, en dos tandas cortas, pasan
todos.

El daño de verdad no es el rojo, es el diagnóstico: quien lea ese log da por rota
su rama y se pone a "arreglar" tests que están bien.

```sh
npm run dev                 # UN servidor, en el 3000 (ver AGENTS.md)
npm run test:e2e:club       # los club-* en lotes de 4, cada uno en su proceso
npm run test:e2e:batches    # la suite entera por lotes
node scripts/e2e-batches.mjs club-evento --size 2   # a medida
```

Cada lote corre en un proceso de Playwright aparte —al terminar, su memoria
vuelve al sistema— y el runner **comprueba que el servidor sigue vivo entre
lotes**. Si se cae, para y lo dice con todas las letras («ENTORNO, NO PRODUCTO»)
con el comando exacto para repetir solo ese lote, en vez de dejar que los
siguientes se pinten del mismo rojo. Códigos de salida: `1` = fallos con el
servidor vivo (mira el producto), `3` = el servidor se murió (mira la máquina),
`2` = error de uso.

Sigue valiendo `npm run test:e2e -- <patrón>` para uno o dos ficheros sueltos,
que es el caso normal mientras desarrollas.

**Nota histórica (2026-07-12 → 2026-07-15):** durante esos días el default
fue justo lo contrario: tras implementar algo con UI, generar un documento
markdown con un checklist paso a paso para que lo ejecutara el usuario
manualmente en su propio navegador, en vez de conducirlo con un agente. El
motivo fue que las tandas de verificación automática se habían vuelto
frágiles — herramientas de navegador desconectándose a media sesión,
fricción de entorno repetida. El usuario revirtió esa decisión el
2026-07-15 y el default vuelve a ser el E2E automático de arriba. El
checklist manual sigue siendo una opción válida para casos puntuales (p.
ej. si las herramientas de navegador fallan, o si el usuario lo pide
explícitamente): guárdalo junto al plan/spec de la feature si existe uno
(p. ej. `docs/superpowers/plans/<fecha>-<feature>-manual-test.md`), con
cada punto detallando qué hacer (clic, campo a rellenar, URL a visitar) y
qué resultado esperar.

## Agentes disponibles

Ver `.claude/agents/`:

- **qa-verifier**: verifica una funcionalidad en el navegador de principio a
  fin (login con `devtest`, ejercitar el flujo, revisar consola/red, limpiar
  datos) y reporta si pasa o no. Es de nuevo el camino por defecto para
  verificación de UI (ver sección de arriba), junto con `npm run test:e2e`.
- **supabase-schema**: migraciones, RLS, advisors y regeneración de tipos de
  Supabase.
- **backlog-scribe**: mantiene `docs/requirements/backlog.md` y
  `docs/requirements/decisiones.md` al día tras cerrar una tarea.

Al ser subagentes independientes, se pueden lanzar en paralelo mientras se
sigue trabajando en el hilo principal.

## Despliegue (Vercel)

- Proyecto: `borjar20s-projects/biblioshare`, vinculado localmente vía `.vercel/project.json` (gitignorado).
- URL de producción: **https://biblioshare-nine.vercel.app**
- La producción está desplegada y funcionando (con tráfico real de campo desde
  ~2026-08-04; ver `docs/perf-baseline.md`). Para verificar el estado de un
  despliegue, usa el MCP de Vercel o el dashboard.

## Wrapper nativo (Capacitor) — estado

Ver `docs/requirements/backlog.md` (Capacitor/Android) para el porqué. Estado actual:

- `capacitor.config.ts` apunta `server.url` a la URL de producción de Vercel
  de arriba. Para probar contra el servidor de desarrollo local en su lugar,
  cambiar temporalmente a `http://10.0.2.2:3000` (alias de loopback del
  emulador Android hacia el `localhost` de esta máquina) + `cleartext: true`.
- Carpeta `android/` generada y comiteada (proyecto Gradle nativo estándar de
  Capacitor). **El APK de debug compila en esta máquina Windows** (verificado
  el 2026-07-29: `BUILD SUCCESSFUL`, `android/app/build/outputs/apk/debug/app-debug.apk`,
  ~27 MB). Todavía no se ha instalado ni ejecutado en un dispositivo o emulador.
  - Toolchain requerido y ya instalado en esta máquina:
    - **JDK 21** (Temurin, `C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot`).
      AGP 8.13 exige JDK 17+; el JDK 11 que trae el Android Studio 2021 instalado
      aquí **no vale**, y el `java` que hay en el `PATH` es un JRE 8 — hay que
      apuntar `JAVA_HOME` al JDK 21 explícitamente.
    - **Android SDK** en `%LOCALAPPDATA%\Android\Sdk` con `platforms;android-36`
      y `build-tools;36.0.0` (`variables.gradle` fija `compileSdkVersion = 36`).
      El SDK que quedaba de 2021 solo llegaba a la 32.
    - `cmdline-tools` actualizado a la 22.0. La 5.0 que había no entiende el
      repositorio actual («*This version only understands SDK XML versions up to 2*»).
      Trampa: `sdkmanager --install "cmdline-tools;latest"` **falla al
      autoactualizarse** (`Failed to delete …\cmdline-tools\latest`, no puede
      borrarse a sí mismo mientras corre); hay que lanzarlo desde una copia del
      directorio fuera del SDK.
  - Compilar (PowerShell, desde la raíz del repo):

    ```powershell
    $env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot'
    $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
    $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
    npx cap sync android
    .\android\gradlew.bat -p android assembleDebug --no-daemon
    ```

    `--no-daemon` a propósito: esta máquina tiene 8 GB de RAM y el daemon de
    Gradle se queda residente entre sesiones.
  - `npx cap sync android` tras cualquier cambio en `capacitor.config.ts` o en
    las dependencias de Capacitor. `npx cap open android` abre el proyecto en
    Android Studio (el instalado aquí es de 2021 y no soporta AGP 8.13: sirve
    para el emulador, no para compilar).
  - Como el `server.url` apunta a Vercel, el APK **no empaqueta la app web**:
    `webDir: "public"` solo aporta un puñado de assets estáticos. Un cambio en
    el front no requiere recompilar el APK, basta con desplegar en Vercel.
  - Los iconos de launcher y el splash **no se editan a mano**: los genera
    `scripts/generate-android-icons.ps1` a partir de `src/lib/app-icon.tsx`, que
    es la definición de la marca. Si cambias colores o proporciones allí, ajusta
    las constantes del script y vuelve a ejecutarlo. Solo corre en Windows
    (System.Drawing) — límite aceptado a sabiendas, issue #287.

### Release firmado y distribución

Lo hace la CI — ver `docs/ci-firebase-app-distribution.md` (keystore, firma,
versionado y distribución por Firebase App Distribution). Lo de arriba (APK de
debug en local) sigue siendo el camino para probar en esta máquina.

- **iOS no es viable en este entorno**: Xcode solo corre en macOS. Compilar
  y probar la plataforma iOS requiere una Mac o un runner de CI en la nube
  (Codemagic, GitHub Actions con runner `macos-latest`, etc.). No hay
  plataforma iOS generada todavía (`npx cap add ios` — pendiente hasta tener
  acceso a alguna de esas vías).

## Biblioteca y alias del perfil: cobertura verificada el 2026-10-03

- [Pipeline de abandonos #773](testing/2026-10-03-library-dropped-pipeline-773.md): 16 casos nuevos y 38 focales PASS; seis mutaciones detectadas con 14 fallos causales conservados. Biblioteca expone búsqueda/género/límite; Sin colección expone población y límite; Colección expone ocultación/contador/media. Los tests respetan las APIs actuales y no inventan filtros de Colección.
- [Alias de Biblioteca del perfil propio #1325](testing/2026-10-03-profile-collection-alias-1325.md): 23 unitarios y ocho casos de navegador PASS sobre build de producción, sin retries. Tipo válido conservado, ausente/inválido con default y visitantes sin redirección a la biblioteca propia. RED original y auditoría global FAIL de #1301 conservados por separado.
- [Aislamiento de libros de autor #1307](testing/2026-10-02-person-books-test-isolation-1307.md): escrituras autenticadas y publicación respetadas; RED causal, cinco casos focales y 112 pertinentes PASS. La antigua CI quedó retenida por el fallo de persistencia de Reloj #1313, ahora integrado; la integración de esta cobertura exige CI del lote sobre la base actual.

Los checks locales y las auditorías globales tienen alcance distinto. Los informes anteriores no acreditan RLS remota, dispositivos reales ni inocuidad de POST cancelados. No se modifican esquema ni cuentas persistentes; cada fixture nativo se elimina por REST antes/después.

### Precedencia de páginas en sus consumidores (#901)

[Informe focal](testing/2026-10-03-edition-pages-consumers-901.md): 30 casos nuevos
en Biblioteca/Colección, contexto de sesión, Registro y rail de ficha; 61
pertinentes PASS y doce mutaciones detectadas con 51 fallos causales. La edición
identificada manda; sin ella o sin sus páginas se usa la obra. Una edición
ajena con otro total distingue la selección por ID de elegir la primera.

Registro y PassCard se renderizan realmente en jsdom. La ficha resuelve el
hijo async devuelto por el wrapper público y comprueba su cálculo y DOM;
Vitest no acredita el runtime RSC de Next, streaming, caché ni navegador.
La issue histórica ya no carece de runner TSX ni de test de reanudación de
sesión: estos casos añaden la defensa de sus páginas. Producto y esquema sin
cambios; la CI de la PR sobre la base actual es gate previo al merge.

### Recursos, Colecciones y reacciones: cobertura del 2026-10-03

- [Recursos #1328](testing/2026-10-03-resources-durable-updates-1328.md): 57 unitarios PASS; cinco casos durables nativos y recorrido natural original PASS. ACK antes del valor visible y recarga inmediata a320/390/1280, transacción retenida, cola/undo y fallback. Un contexto visual adicional acredita aviso completo a320/390 tras scroll inicial; capturas desplazadas originales conservadas.
- [Editor #1007](testing/2026-10-03-resource-editor-1007.md): dos casos nativos permanentes PASS; nombre único y cancelación de gesto al cambiar ficha. Diagnóstico inicial del preset corregido.
- [Colecciones #662/#746](testing/2026-10-03-collection-grid-662-746.md): nuevo caso y original corregido PASS. Cinco fixtures distinguen4/3/2 columnas a1440/1200/390; búsqueda, vacío y las cinco posiciones del orden. URL estable y cero navegaciones del documento en el nuevo; no acredita foco ni ausencia de fetch/RSC.
- [ReactionBar #789](testing/2026-10-03-reaction-bar-coverage-789.md): nueve casos nuevos, 38 focales PASS y ocho mutaciones detectadas con17 fallos causales. Componentes/picker/catálogo/handlers reales, fallback canvas sin rasterizador; no acredita fuentes, CSS, navegador ni persistencia remota.

Los nativos anteriores pertenecen al build w0f/base4a y backend local273. La primera prueba nueva de Colecciones falló por literal exacto incompleto; recuperación sólo cambia esa cadena y conserva el FAIL. El original conserva auditoría global FAIL por POST cancelados sin atribución de efecto (#1301); identificar pullPendingCelebrations no acredita pérdida ni inocuidad. #1334 investiga su repro condicional aparte. Fixtures y servicios propios limpios. Nueva QA sobre maina0b0/Experiencias y CI de PR son gates de merge; no se extrapola el build anterior.


### Integración de Recursos y Colecciones sobre main a0 — 2026-10-03

Nueva build zOSPb8W0Exp_IruBgC7iv de HEAD 9a3f13a749d178e12c443b80d7c2a4b85b18eb77, con base main a0b0e031/Experiencias y backend local 282: 9/9 recorridos funcionales PASS, cero reintentos, SKIP o flaky. Cinco casos de persistencia de Recursos, dos del editor y dos de Colecciones (nuevo y original). Tipos y lint PASS; 95 unitarios focales PASS en nueve archivos. El recorrido natural original previo conserva su resultado en build w0f; no se vuelve a declarar ejecutado en esta tanda.

Auditoría global FAIL conservada: POST #22 de /partidas/recursos y #59 de /coleccion se corresponden con pullPendingCelebrations según el índice de esta misma build; POST #38 de /login queda fuera del probe, sin atribución. Los tres siguen UNCLASSIFIED: no hay recibo RPC/filas por petición. #22 empezó y falló antes del ACK retenido, por lo que no se atribuye a la recarga final. #1301 y #1334 permanecen abiertos; identificar la acción o recibir HTTP 200 no acredita inocuidad ni pérdida.

Evidencia local sellada: resources-coverage-current-native-1791046824201/final-public-manifest.sha256.json, 173 archivos, SHA-256 a7d1bdca4d9821971beaeba05439a04a927eef6c6c513fd7cc418db44dd7d8d5. Se preservan 2012 inputs, 23 fuentes congeladas y los 307 artefactos de la tanda previa. Infra/probe/cleanup PASS; actores eliminados con Auth404 y nueve tablas vacías por actor, seis tablas de Experiencias vacías, Next cerrado, puerto 3000 libre y Supabase parado con backup normal de 282 pasos. Son recibos de cierre de esa tanda; otro gate local puede utilizar después el backend.

El gate de CI se comprueba en la PR de publicación sobre el HEAD final antes de integrarla. Los PASS funcionales y el FAIL global mantienen dictámenes separados.

## Composer de voz: transiciones DOM (#843)

[Informe y límites](testing/2026-10-03-voice-composer-state-843.md): 16 casos
de componente nuevos (7 PostThread, 9 ReviewInteractions) ejercen los controles
DOM reales para responder a otro objetivo o a la misma raíz, entrar a editar,
cancelar respuesta y publicar voz. Cambiar contexto desarma la grabadora sin
otro gesto de micrófono; publicar cierra la respuesta antes de resolver el envío.

CommentComposer, VoiceRecorder, VoiceRecorderEngine, hooks, menús y traducciones
son reales. Las fronteras falsas se limitan a APIs de media/medición de navegador,
usePathname y transportes de acciones; los bytes de audio son sintéticos.
El reloj local avanza los ticks del motor y el envío se mantiene pendiente para
observar el cierre de contexto. Esto acredita las transiciones de estado y DOM;
no acredita micrófono físico, permisos, codificación/reproducción, SSR, despacho
de Server Actions, revalidación remota ni navegador de Next.

Verificado el 2026-10-03 sobre el merge local de main a0b0e03 y la cobertura
67f101c: 50/50 focales en seis ficheros, tipos y lint PASS con Node24. Las ocho
guardas retiradas individualmente en copias provocan ocho FAIL causales
conservados sobre la base 4a; los controles pasan 16/16. No se repite esa tanda
de mutaciones en el merge. No cambia el producto ni se añade el aviso de la
deuda hermana antes de cortar una grabación. La CI de publicación y la revisión
del lote siguen siendo gates del coordinador.

## Lote de cobertura de voz y miembros de saga (#843 + #191)

[Miembros de saga #191](testing/2026-10-03-saga-member-coverage-191.md): 19 casos
ejercen getSaga público, sin exportar resolveMembers. La frontera de lectura
Supabase aplica select (proyección de columnas), eq e in sobre filas tipadas:
comprueba role/placement/optional/position, orden numérico con 0 y null al final,
desempate por título, identidad tipo:id entre catálogos, títulos nulos, saga
inexistente y miembros sin metadatos. No es un test de DB o RLS nativa; TMDB,
creación de catálogo y cliente privilegiado fallan si se intentan usar.

La integración local del 2026-10-03 combina main 1d1f618, cobertura de voz y
Saga 9e7acab: 69/69 focales en siete ficheros, tipos completos y lint PASS con
Node24. Incluye los 50 casos pertinentes de voz y los 19 de getSaga. No cambia
producto ni amplía las fronteras reales descritas en ambos informes. Las
tandas históricas de 526 tests de sagas y de mutantes se conservan; no se
repiten ni se suman a esta ejecución. No se arrancan servicios ni DB.

**Requisito de entrega:** los checks de CI de la PR deben pasar sobre su HEAD
final. Un PASS local o de otro SHA no acredita la CI de este lote. La evidencia
de publicación se vincula a ese HEAD, sin convertir la cobertura local en
verificación de navegador, media nativa, RLS o proveedores.

## Motivo de abandono en el diario (#655)

[Informe de cobertura](testing/2026-10-03-dropped-reason-coverage-655.md): ocho
casos ejecutan `PassDiary` e Intl reales en jsdom. Cubren las cinco categorías
de abandono, la nota completa de «Otro», la ausencia de motivo y un pase
completado con motivo residual. La tanda focal del 2026-10-03 pasa 35/35 en
tres archivos, con tipos y lint correctos. Dos controles negativos detectan
la retirada del gate de estado y el truncado de la nota; después se restaura
el producto con sus bytes originales.

Las acciones de servidor y la carga conjunta están controladas. Esta cobertura
acredita el DOM local; no acredita layout de navegador, persistencia ni RLS.
No cambia el producto y no arranca servicios. La entrega requiere CI sobre el
HEAD final de la PR.

## Guardado de Partidas frente a adopción del espejo (#959)

[Informe](testing/2026-10-03-play-save-staleness-959.md): dos casos deterministas,
anónimo y con identidad, retienen el ACK de `saved` mientras se adopta una partida
ajena. Comprueban que la anterior queda guardada y que la nueva permanece en
memoria e IndexedDB sin borrado ni notificación adicional. Suite focal 76/76,
tipos y lint PASS; retirar la guarda causa dos FAIL y se restaura el producto.

Se aclara el boolean de `save()` sin cambiar comportamiento. Los consumidores
actuales no muestran el supuesto mensaje de «no guardado». La prueba ejecuta
store y adaptadores reales sobre fake-indexeddb con canal controlado; no acredita
navegador, sincronización remota ni RLS. Requiere CI sobre el HEAD de entrega.

## Reevaluación de representación: petición y sistema (#897)

[Informe](testing/2026-10-03-catalog-representation-coverage-897.md): 18 casos
ejecutan la acción, roles, hidratación y builders SDK reales. Comprueban el gate
de colaborador antes de escribir, el reset con cliente de petición, la RPC con
cliente de sistema y el orden de las esperas; los fallos de hidratación siguen
sin invalidar un reset correcto. La tanda focal pasa 104/104, con tipos y lint
correctos. Cinco mutaciones independientes provocan sus FAIL causales.

Sesión, HTTP, proveedores y Next son fronteras controladas. El trigger canónico
permite la vía de sistema con auth.uid() NULL: se verifica qué cliente escribe,
sin inventar un rechazo SQL para el reset de sistema. No se acredita RLS, grants,
proveedores ni POST nativos. No cambia el producto; CI del HEAD final es gate
de publicación.
