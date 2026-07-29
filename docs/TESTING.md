# Testing manual / con agentes

> **[Canónico · verificado contra código el 2026-07-20]**

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
- **backlog-scribe**: mantiene `docs/REQUIREMENTS.md` al día (checklists,
  numeración, log de decisiones) tras cerrar una tarea.

Al ser subagentes independientes, se pueden lanzar en paralelo mientras se
sigue trabajando en el hilo principal.

## Despliegue (Vercel)

- Proyecto: `borjar20s-projects/biblioshare`, vinculado localmente vía `.vercel/project.json` (gitignorado).
- URL de producción: **https://biblioshare-nine.vercel.app**
- Conexión automática con el repo de GitHub no se completó (requiere autorizar la GitHub App de Vercel desde GitHub — paso manual, no forzado). Sin esa conexión, los despliegues no son automáticos en cada push; hay que correr `npx vercel deploy --prod` a mano cuando toque desplegar cambios.
- **Variables de entorno pendientes de configurar en el dashboard de Vercel** (Project Settings → Environment Variables) — no se han introducido por CLI a propósito, para no pegar API keys en un comando: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `TMDB_API_KEY`, `GOOGLE_BOOKS_API_KEY` (mismos valores que en `.env.local`). Dejar `MOCK_EXTERNAL_APIS` sin definir en producción (solo se usa en local). Hasta que se configuren, la producción responde 500 en todas las rutas (esperado: la app necesita Supabase para casi todo).

## Wrapper nativo (Capacitor) — estado

Ver `docs/REQUIREMENTS.md` §8-F / §7.31 para el porqué. Estado actual:

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
- **iOS no es viable en este entorno**: Xcode solo corre en macOS. Compilar
  y probar la plataforma iOS requiere una Mac o un runner de CI en la nube
  (Codemagic, GitHub Actions con runner `macos-latest`, etc.). No hay
  plataforma iOS generada todavía (`npx cap add ios` — pendiente hasta tener
  acceso a alguna de esas vías).
