# Testing manual / con agentes

> **[Canónico · verificado contra código el 2026-08-19]**

## Cuenta de desarrollo persistente

En vez de hacer signup + onboarding cada vez que hay que probar algo en el
navegador, usa la cuenta ya creada y con onboarding completo:

- Credenciales en `.env.local`: `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `TEST_USER_USERNAME`.
- Login directo en `/login` — sin pasos previos.
- **No borrar nunca esta cuenta** como parte de la limpieza de un test. Es
  persistente para todo el proyecto.

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
