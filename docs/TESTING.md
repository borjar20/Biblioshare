# Testing manual / con agentes

## Cuenta de desarrollo persistente

En vez de hacer signup + onboarding cada vez que hay que probar algo en el
navegador, usa la cuenta ya creada y con onboarding completo:

- Credenciales en `.env.local`: `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `TEST_USER_USERNAME`.
- Login directo en `/login` — sin pasos previos.
- **No borrar nunca esta cuenta** como parte de la limpieza de un test. Es
  persistente para todo el proyecto.

### Qué limpiar y qué no, tras probar algo

- Si la prueba añade ítems a la biblioteca de `devtest` (`library_entries`,
  `diary_entries`, filas nuevas en `books`/`movies`/`series`): bórralas por
  SQL al terminar, igual que se hacía con los usuarios de un solo uso.
- Si la prueba requiere un **segundo usuario** (p. ej. verificar cómo ve otro
  visitante un perfil público/privado), crea uno nuevo desechable con el
  patrón habitual (`signup` → username único → probar → borrar el usuario
  completo, incluida la fila de `auth.users`, al terminar). Esos sí se crean
  y destruyen por test.
- Deja `devtest.is_public = true` al terminar (es su estado por defecto);
  si una prueba lo cambia a privado, reviértelo antes de acabar.

## Agentes disponibles

Ver `.claude/agents/`:

- **qa-verifier**: verifica una funcionalidad en el navegador de principio a
  fin (login con `devtest`, ejercitar el flujo, revisar consola/red, limpiar
  datos) y reporta si pasa o no. Úsalo después de implementar algo con UI en
  vez de hacer la verificación a mano en el hilo principal.
- **supabase-schema**: migraciones, RLS, advisors y regeneración de tipos de
  Supabase.
- **backlog-scribe**: mantiene `docs/REQUIREMENTS.md` al día (checklists,
  numeración, log de decisiones) tras cerrar una tarea.

Al ser subagentes independientes, se pueden lanzar en paralelo mientras se
sigue trabajando en el hilo principal (p. ej. verificar la feature A mientras
se implementa la B).

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
  Capacitor). **No se ha podido compilar ni probar todavía en esta máquina**:
  no hay JDK ni Android SDK instalados en este entorno Windows.
  - Para poder compilar/ejecutar: instalar Android Studio (incluye JDK y
    SDK) o al menos un JDK 17+ y el Android SDK con `ANDROID_HOME` apuntando
    a él, y un emulador o dispositivo conectado.
  - Con eso instalado: `npx cap sync android` tras cualquier cambio en
    `capacitor.config.ts` o en las dependencias de Capacitor, y
    `npx cap open android` para abrir el proyecto en Android Studio.
- **iOS no es viable en este entorno**: Xcode solo corre en macOS. Compilar
  y probar la plataforma iOS requiere una Mac o un runner de CI en la nube
  (Codemagic, GitHub Actions con runner `macos-latest`, etc.). No hay
  plataforma iOS generada todavía (`npx cap add ios` — pendiente hasta tener
  acceso a alguna de esas vías).
