# Widgets nativos de Android — guía

`[Canónico · verificado 2026-08-05]`

Dos widgets de pantalla de inicio (Jetpack Glance, Kotlin): **«En curso»**
(el elemento principal a medias) y **«Objetivo de hoy»** (minutos de lectura
contra `profiles.daily_goal_minutes`). Sin Firebase, sin consultas a Supabase
desde el widget, sin credenciales en el dispositivo.

## Arquitectura

```
[Next.js/Vercel]                         [WebView Capacitor]                [Android nativo]
src/lib/widgets/actions.ts               src/lib/widgets/sync.ts            BiblioshareWidgetPlugin.kt
  getWidgetSnapshot() ── server action ──▶ requestWidgetSync(reason) ──────▶  updateSnapshot()
  reutiliza getTodayFocus,                 (debounce 2 s + huella             │ valida versión/campos
  getWeeklyActivity, getStreaks,            en android-widgets.ts)            ▼
  daily_goal_minutes                                                        WidgetSnapshotStore (SharedPreferences)
                                                                            WidgetImageCache (filesDir/widget_covers)
                                                                              │ updateAll()
                                                                              ▼
                                                                            CurrentProgressWidget / DailyGoalWidget (Glance)
```

- **Toda la lógica de negocio vive en TypeScript** y es la MISMA que usa el
  dashboard: la selección del elemento en curso es el `featured` de
  `getTodayFocus` (sesión más reciente; decisión de usuario 2026-07-17, ver
  `compareTodayPasses`), los minutos de hoy salen de `getWeeklyActivity`, la
  racha de `getStreaks` y el porcentaje usa el mismo redondeo que `TodayCard`.
  Kotlin solo pinta el snapshot; no re-deriva nada.
- **El widget nunca toca la red** salvo la descarga de la portada (una vez,
  cacheada por hash de URL). Renderiza siempre desde el store local → funciona
  sin conexión y con la app cerrada.
- **Snapshot mínimo**: datos de presentación + `userId` (solo para detectar
  cambio de cuenta y purgar). Sin tokens, email, notas ni reseñas.

## Cuándo se sincroniza

Todo pasa por `requestWidgetSync(reason)` (`src/lib/widgets/sync.ts`), que
agrupa (debounce 2 s) y deduplica (huella `snapshotFingerprint`, que ignora
`generatedAt`). Disparadores, todos en
`src/components/widgets/android-widget-sync.tsx` (montado en el layout raíz):

| Disparador | Cubre |
|---|---|
| mount | arranque en frío |
| `visibilitychange` → visible | volver a primer plano, cambio de día al reabrir |
| `visibilitychange` → hidden | **red de seguridad**: cualquier mutación de la sesión (episodios, estados, objetivo…) se empuja al salir de la app, sin instrumentar cada acción |
| `celebrations:check` | registro de progreso (`addSession` → `checkCelebrations()` en session-sheet): actualización inmediata |
| `onAuthStateChange` | inicio/restauración de sesión |
| logout (profile-settings-sheet) | `clearWidgetsOnLogout()` borra snapshot + portadas ANTES de salir |

Sin sesión, `getWidgetSnapshot` devuelve `unauthenticated` y el adaptador borra
el estado nativo — un segundo usuario nunca ve datos del anterior (además, el
store nativo purga las portadas si cambia el `userId` del snapshot).

## Cambio de día

El snapshot lleva `dailyGoal.date` (el "hoy" que usó el servidor). Al renderizar,
el widget compara con la fecha local del dispositivo: si no coincide muestra
«Abre Biblioshare para actualizar» en vez de vender el progreso de ayer como de
hoy. `updatePeriodMillis=3600000` (1 h) re-renderiza desde el store local (sin
red) para que eso se note como mucho una hora después de medianoche — por eso
NO hay WorkManager. Al abrir/reanudar la app se sincroniza de verdad.

Limitación conocida: el "hoy" del snapshot lo calcula el servidor (Vercel, UTC),
igual que el dashboard; entre las 00:00 y las 02:00 hora española el widget
puede marcar "pendiente de actualizar" hasta que el servidor cruce el día. Es el
mismo sesgo que ya tiene la web — se prefirió coherencia con el dashboard a una
regla nueva.

## Deep links

No hay esquema `biblioshare://`: el wrapper carga la web remota (`server.url`),
así que un deep link es un **path interno** que viaja como extra del intent
(`biblioshareWidgetPath`) y `MainActivity` resuelve en un único punto
(`WidgetDeepLinks.handle`) cargando `serverUrl + path` en el WebView. La ruta se
valida en ambos lados (espejo de `safe-path.ts` del push). Destinos:

- Tarjeta/«Registrar progreso» → `/sesion/{passId}` (películas y huérfanos → ficha del ítem).
- Objetivo de hoy → `/` (dashboard con la TodayCard).
- Estado vacío → `/coleccion`; sin objetivo → `/estadisticas`; sin sesión → `/`.

Con la app cerrada el intent llega en `onCreate`; abierta (singleTask), en
`onNewIntent`. Si no hay sesión, la propia web redirige a `/login` y tras
autenticarse se sigue el flujo normal de la app.

## Compilar y probar

- **Compatibilidad**: minSdk 24, compile/target 36, Capacitor 8.4, AGP 8.13,
  Kotlin 2.1.20 (`kotlin-android` + `org.jetbrains.kotlin.plugin.compose`),
  Glance 1.1.1. Java/Kotlin target 21. Sin cambios de versión en Capacitor.
- Build: `cd android && ./gradlew :app:assembleDebug` (sin `keystore.properties`
  el release sale sin firmar, como siempre).
- Tests JVM nativos: `./gradlew :app:testDebugUnitTest` (`WidgetSnapshotTest.kt`:
  parseo, versión, fechas, rutas; `WidgetStateTest.kt`: estados de cada widget).
- Tests web: `npx vitest run src/lib/widgets/build-widget-snapshot.test.ts`.
- R8/ProGuard: `minifyEnabled false` en este proyecto — no hacen falta reglas
  keep. Si algún día se activa minify, Glance y el plugin (anotado con
  `@CapacitorPlugin`) traen sus reglas por consumer-rules; verificar entonces.
- Launchers que ignoran `targetCellWidth`: mandan `minWidth/minHeight` (110 dp
  ≈ 2×2); el layout responde por `SizeMode.Responsive` (corte en 240 dp de ancho).

### Iterar sin desplegar ni instalar

El widget es una función pura del snapshot, así que se puede ver y probar sin
emulador, sin instalar y sin desplegar la web:

1. **Ver el dibujo** — `android/app/src/debug/.../WidgetPreviews.kt`: ábrelo en
   Android Studio y pulsa *Split*/*Design*. Pinta los dos tamaños y todos los
   estados (libro en curso, serie, datos antiguos, vacío, sin sesión, objetivo
   completado, día caducado, sin objetivo) con datos de mentira. La API de
   preview de Glance es experimental (`@ExperimentalGlancePreviewApi`): el
   render depende de la versión de Android Studio; si falla, el plan B es el
   punto 2 más el emulador.
2. **Probar el comportamiento** — `WidgetStateTest.kt`: `currentProgressState` y
   `dailyGoalState` son puras, así que el cambio de día o un snapshot de hace
   tres días se comprueban en JVM en segundos con
   `./gradlew :app:testDebugUnitTest`. Sin emulador, sin Robolectric.
3. **Sin desplegar, pero con la app entera** — apunta `server.url` de
   `capacitor.config.ts` a `http://10.0.2.2:3000` (alias del host desde el
   emulador) con `cleartext: true` y levanta `next dev`. Instalas una vez y
   luego iteras la web sin pasar por Vercel.

Las previews viven solo en el source set `debug`, así que el APK de release no
las lleva (verificado con `:app:compileReleaseKotlin`).

### Depurar Glance

- `adb shell dumpsys appwidget` lista instancias y providers.
- Logs con tag `BiblioshareWidgets` (descargas de portada fallidas, etc.).
- Para forzar re-render: quitar y volver a poner el widget, o llamar a
  `refreshWidgets()` desde la consola del WebView
  (`Capacitor.Plugins.BiblioshareWidget.refreshWidgets()`).
- Probar un deep link sin widget:
  `adb shell am start -n app.biblioshare.mobile/.MainActivity --es biblioshareWidgetPath /coleccion`

## Cómo extender

- **Campo nuevo en el snapshot**: añadirlo en `src/lib/widgets/types.ts` Y en
  `WidgetSnapshot.kt`; si el campo es requerido o cambia semántica, subir
  `WIDGET_SCHEMA_VERSION` en los DOS lados (un APK viejo descarta versiones
  desconocidas y cae al estado vacío — no hay migración parcial a propósito).
- **Otro widget**: nueva clase `GlanceAppWidget` + receiver + XML info +
  entrada en el manifest, añadirlo a `WidgetRefresh.updateAll` y, si necesita
  datos nuevos, ampliar el snapshot (punto anterior).
- **Acciones rápidas nativas (+10 páginas…)**: NO en el MVP. El camino
  preparado: un `actionRunCallback` de Glance que abra la app en
  `/sesion/{passId}` con un query param (p. ej. `?quick=+10`) para que la
  server action `addSession` — con su validación — haga el trabajo. Escribir
  contra Supabase desde Kotlin duplicaría reglas de negocio y está descartado.

## Limitaciones asumidas

- El texto del widget se congela con el snapshot («Te quedan 8 minutos» no se
  recalcula en nativo): tras el corte de día el widget lo señala como
  desactualizado en vez de recalcular mal.
- `statusLabel`/«Datos antiguos» aparece a partir de 48 h sin sincronizar.
- Sin selección configurable por instancia ni listas desplazables (fuera de
  alcance declarado).
