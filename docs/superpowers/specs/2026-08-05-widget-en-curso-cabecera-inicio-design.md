---
Estado: Diseño aprobado · verificado 2026-08-05
Feature: Widget «En curso» replica la cabecera «¿Qué has disfrutado hoy?»
---

# Widget «En curso» → cabecera del Inicio (sin fecha ni título)

## Contexto

El widget Android `CurrentProgressWidget` pinta hoy **un solo** elemento en curso
(la misma selección que el destacado del dashboard: `getTodayFocus().featured`),
en dos tamaños (`Compact` 110×110 y `Horizontal` 240×110). El widget **no habla
con Supabase**: pinta un snapshot que genera la web (`src/lib/widgets/*`) y que el
plugin nativo persiste. La lógica vive en TS; Kotlin solo dibuja.

Se quiere que replique la sección **«¿Qué has disfrutado hoy?»** del Inicio
(`src/components/stats/today-block.tsx`) **pero sin la fecha ni el título serif**
(decisión del usuario, para reducir la altura del widget): solo la funcionalidad
de **EN CURSO** (con su tarjeta destacada rica) y **Continúa donde lo dejaste**.

«Continúa donde lo dejaste» = los **otros pases en curso** (`focus.rest`), NO la
cola «Para más tarde» (`status=planned`). Confirmado en `get-today-focus.ts:51`
y en el `keepGoingLabel` de `today-picker.tsx`.

**Dato clave:** el sitio que genera el snapshot (`src/lib/widgets/actions.ts`) ya
lee `focus` completo (`featured`, `rest`, `total`) y `daily_goal_minutes`; hoy
solo pasa `featured` a `buildWidgetSnapshot`. Los campos ricos del destacado
(`dayNumber`, `startedOn`, `noteCount`, `streakDays`, `week`, `rereadCount`) ya
vienen en `TodayPass`/`LibraryItem`. **No hacen falta consultas nuevas**: solo
propagar lo que ya se trae y formatearlo.

## Límites honestos (Glance = RemoteViews)

No hay fuente serif de la app, ni el filo de color en degradado, ni cronómetro
embebido. Se replica **estructura + contenido + paleta** (par claro/oscuro Paper
vía `values-night`, ya existente en `WidgetPalette`). La verificación en
dispositivo real sigue pendiente (rastreada en **#485**).

## Qué pinta el widget grande (de arriba abajo)

Layout `Large`, nuevo tamaño en `SizeMode.Responsive`. De arriba abajo:

1. **Rótulo EN CURSO** — fila:
   `EN CURSO` (mono, apagado) ····· `{total} · Ver todos ›` (acento, clicable →
   `/coleccion?status=in_progress`). `total` = `focus.total`.
2. **Tarjeta destacada** (el pase en curso, versión rica). Portada (izquierda) +
   columna:
   - `nthLabel` — "1.ª lectura" (mono acento). Ya formateado en TS (plural/género
     resueltos con `passes.nth.{itemType}`, n = `rereadCount + 1`).
   - Título (negrita).
   - `contextLabel` — "Día 4 · desde 2/8 · 1 nota" (mono apagado). Ya formateado
     en TS uniendo `Día {n}` / `desde {date}` / `{n} nota(s)` con " · ", los que
     existan (misma regla que `today-card.tsx`).
   - Barra de progreso + `progressLabel` + `{percentage} %` (solo si hay
     porcentaje; ya en el snapshot).
   - **META DE HOY** — fila con rótulo + barra dorada + `{done} / {goal} min`.
     **Reutiliza el `dailyGoal` que ya está en el snapshot.** Se pinta solo si
     `dailyGoal` existe y su `date` es hoy (misma comprobación que
     `dailyGoalState`). Sin meta configurada, la fila no aparece.
   - `◆ Racha {streakDays} d` (píldora dorada, solo si `streakDays > 0`) + los 7
     cuadritos de la semana (`week`): el de hoy con borde, los activos rellenos.
   - **Acciones** (solo libros con pase; películas/series no tienen cronómetro):
     `Sesión` **arranca el cronómetro EN EL WIDGET sin abrir la app** y la fila
     se transforma en reloj vivo + `Registrar`/`Descartar`. Ver la sección
     «Cronómetro nativo». `Registrar` sin reloj vivo → ficha `?tab=log`.
3. **CONTINÚA DONDE LO DEJASTE** (rótulo mono apagado, solo si `inProgressRest`
   no está vacío) — tira **horizontal** (`Row`) de mini-portadas: portada + título
   corto + `{percentage} %` o "Sin progreso". Tope **3** ítems (los siguientes
   quedan tras "Ver todos"). Cada mini es clicable → su `deepLink`.

**Tamaños:** el layout `Large` solo aparece en el nuevo `DpSize` grande. En los
tamaños ya existentes el widget **se queda igual que ahora** (`Compact` /
`Horizontal`, un solo ítem): no rompe a quien lo tenga en 2×2. El umbral de
selección se decide por `LocalSize.current` (como ya hace `CurrentProgressContent`
con `>= 240.dp`).

## Datos — snapshot v2

Subir `WIDGET_SCHEMA_VERSION` **1 → 2** en los **dos** lados (`types.ts` +
`WidgetSnapshot.kt`). Un APK viejo con snapshot nuevo (o al revés) descarta el
snapshot entero y cae al estado vacío — comportamiento seguro ya existente.

### `src/lib/widgets/types.ts`

Extender `CurrentProgressWidgetData` (cadenas ya formateadas en TS, como
`progressLabel`/`statusLabel`; Kotlin sigue tonto, i18n en web — el repo es
mono-`es`):

```ts
export type CurrentProgressWidgetData = {
  // ...campos actuales...
  nthLabel: string;            // "1.ª lectura"
  contextLabel: string;        // "Día 4 · desde 2/8 · 1 nota" (puede ir vacío)
  streakDays: number;          // 0 = sin racha (no se pinta la píldora)
  week: WidgetWeekDay[];       // 7 días, del más antiguo a hoy
};

export type WidgetWeekDay = { active: boolean; today: boolean };

export type CurrentProgressRestItem = {
  itemType: "book" | "movie" | "series";
  title: string;
  coverUrl?: string | null;
  percentage?: number | null;  // null = "Sin progreso"
  progressLabel: string;       // "Sin progreso" cuando no hay progreso
  streakDays: number;
  deepLink: string;
};

export type WidgetSnapshot = {
  version: number;
  userId: string;
  generatedAt: string;
  currentProgress: CurrentProgressWidgetData | null;
  /** Total de en curso (para "N · Ver todos"). */
  inProgressTotal: number;
  /** Los otros en curso ("Continúa donde lo dejaste"), tope aplicado en el build. */
  inProgressRest: CurrentProgressRestItem[];
  dailyGoal: DailyGoalWidgetData | null;
};
```

### `src/lib/widgets/build-widget-snapshot.ts`

- `buildCurrentProgressData(pass)` emite los campos nuevos:
  - `nthLabel` con `passes.nth.{itemType}` y `n = item.rereadCount + 1`.
  - `contextLabel` uniendo `Día {n}` / `desde {shortDate(startedOn)}` /
    `{noteCount} nota(s)` con " · " (los que existan).
  - `streakDays = pass.streakDays`, `week = pass.week.map(d => ({active, today}))`
    (hoy = último día).
  - Necesita `getTranslations`/mensajes: pasar el traductor o los textos ya
    resueltos al build. **Decisión:** el build recibe una función `t` (o un objeto
    de labels) desde el call site en `actions.ts`, que es `"use server"` y puede
    llamar `getTranslations`. Las funciones puras del build se mantienen puras
    recibiendo `t` como argumento (no importan next-intl).
- Nueva `buildRestItems(rest, t, { limit: 3 })` → `CurrentProgressRestItem[]`,
  reutilizando `getProgress` para el `percentage`/`progressLabel` y `t("noProgress")`
  cuando no hay progreso; `deepLink` con la misma regla que el destacado (pase de
  sesión si aplica, si no la ficha).
- `buildWidgetSnapshot(input)` acepta `rest: TodayPass[]`, `total: number` y `t`,
  y rellena `inProgressTotal` / `inProgressRest`.
- `snapshotFingerprint` no cambia de forma (sigue serializando todo menos
  `generatedAt`): los campos nuevos entran solos en la huella.

### `src/lib/widgets/actions.ts`

Pasar lo que ya tiene: `rest: focus.rest`, `total: focus.total`, y el traductor
`t = await getTranslations(...)` (namespaces `today` y `passes`). Sin lecturas
nuevas.

## Kotlin / render

### `WidgetSnapshot.kt`

- `WIDGET_SCHEMA_VERSION = 2`.
- `CurrentProgressData` gana `nthLabel`, `contextLabel`, `streakDays`,
  `week: List<WidgetWeekDay>`. Nueva `data class WidgetWeekDay(active, today)` y
  `data class RestItem(...)`.
- `WidgetSnapshot` gana `inProgressTotal: Int` e `inProgressRest: List<RestItem>`.
- `parse` los lee con los mismos guardas defensivos (nunca lanza; campos que
  falten → snapshot inválido → null → estado vacío). `week` y `inProgressRest`
  ausentes/ilegibles → listas vacías (degradación limpia, no descarte).

### `CurrentProgressWidget.kt` + `WidgetUi.kt`

- Añadir un `DpSize` grande (p. ej. `LARGE = DpSize(250.dp, 250.dp)`, valor a
  afinar en preview) a `SizeMode.Responsive`.
- `CurrentProgressContent`: si `LocalSize.current` supera el umbral grande →
  `Large(...)`; si no, el `Horizontal`/`Compact` actuales (intactos).
- `Large(...)` compone las tres zonas. Reutiliza `Cover`, `ProgressLine`,
  `WidgetPalette` y los estilos de texto existentes; añade helpers para la píldora
  de racha y los cuadritos de semana (pequeños `Box` con `background` + `cornerRadius`).
- `provideGlance` carga la portada del destacado **y** las de `inProgressRest`
  (`WidgetImageCache.loadBitmap` por url; N ≤ 3). Pasa un `Map<url, Bitmap?>` o
  lista paralela a `Large`.
- Navegan a la app con `actionStartActivity(WidgetDeepLinks.intentFor(...))`:
  «Ver todos», cada mini de «Continúa» y la raíz (`WidgetCard`, respaldo →
  destacado). Las acciones del cronómetro (Sesión/Registrar/Descartar) NO son
  `actionStartActivity`: son `actionRunCallback` (ver «Cronómetro nativo»), porque
  corren con la app cerrada.

### `WidgetState.kt`

`ProgressWidgetState.Content` ya lleva `data: CurrentProgressData` + `stale`. Para
que `Large` acceda a `total`/`rest`, `currentProgressState` pasa a devolver también
esos dos (o `Content` gana `total`/`rest`). Sigue siendo función pura y testeable.

### `WidgetPreviews.kt` (source set `debug`)

Nuevas previews del layout grande: con `rest` y sin él, con meta y sin ella, y el
caso destacado sin porcentaje. Muestras de `RestItem` de ejemplo.

## Cronómetro nativo — iniciar sesión desde el widget (sin abrir la app)

El botón **Sesión** (libros) arranca el cronómetro **en el widget**, con
**segundos en vivo**, sin abrir ninguna pantalla. Guardar la sesión sí abre la
app (el widget nunca habla con Supabase). Solo aplica a **libros con pase activo**
(`itemType == "book"`), igual que `canTime` en `TodayActions`.

### Por qué hay DOS relojes (y la regla que evita que diverjan)

El cronómetro de la app vive en `localStorage` del WebView (`timer.ts`), que con
la app cerrada **no existe**. Para que corra con la app cerrada, el estado tiene
que vivir en **nativo**. Coexisten dos almacenes para el mismo reloj — justo lo
que `timer.ts` avisa que «tarde o temprano divergiría». Regla única de propiedad:

1. **Mientras hay reloj nativo, manda el nativo.**
2. **Al abrir la app** se **siembra** el `localStorage` desde el nativo (si aún
   no había reloj para ese pase). A partir de ahí los relojes de dentro de la app
   (tarjeta de hoy + hoja de sesión) coinciden porque leen la misma clave.
3. **La app espeja hacia el nativo por UN solo punto**: `writeTimer`/`clearTimer`
   de `timer.ts` son el único sitio por el que pasan TODAS las escrituras del
   reloj (start/pause/register/cancel de cualquier componente). Ahí, y solo ahí,
   se refleja al store nativo. App→nativo en un sitio, no por componente.

### Estado nativo — `TimerStore` (Kotlin, nuevo)

SharedPreferences (mismo patrón que `WidgetSnapshotStore`). Un solo reloj a la
vez (el del destacado):

- `pass_id: String`
- `started_at_wallclock: Long` — epoch ms del arranque.

**No** se guarda base de `elapsedRealtime`: el `Chronometer` se recalcula en cada
render desde el reloj de pared (`base = SystemClock.elapsedRealtime() - (now -
startedWall)`), así **el reinicio del dispositivo no lo rompe** (elapsedRealtime
se resetea en boot; el reloj de pared no). Sin pausa en el widget → elapsed =
`now - startedWall`, sin acumulador.

### Segundos en vivo — `Chronometer` incrustado

Glance no tiene cronómetro; se incrusta un `Chronometer` de Android con
`AndroidRemoteViews`, `base` como arriba y `setStarted(true)`. Tics en el proceso
del launcher, **sin despertar la app ni actualizaciones periódicas**. Guarda de
sesión larga: si `now - startedWall > 4 h` (mismo umbral que `isStale` en
`timer.ts`), no se pinta el reloj corriendo sino un aviso «sesión larga, ábrela
para registrar» (evita un contador eterno). El theming del RemoteView (color/
fuente) es la pieza más delicada — afinar en preview.

### Acciones nativas (Glance `actionRunCallback`, corren con la app cerrada)

- **StartTimerAction** (`Sesión`): lee el `passId` del destacado del snapshot,
  escribe `TimerStore` (`now`), `updateAll`. Solo se pinta si es libro con pase y
  no hay ya reloj para ese pase.
- **DiscardTimerAction** (`Descartar`): limpia `TimerStore`, `updateAll`.
- **Registrar**: `actionRunCallback` que calcula `minutos = round((now -
  startedWall)/60000)`, limpia `TimerStore` y **lanza la app** con
  `WidgetDeepLinks.intentFor(context, "/sesion/{pass}?minutos=M&inicio=ISO")`
  (`safeInternalPath` ya deja pasar query strings — no lleva `//` ni `://`). La
  hoja abre **rellena**. Se calcula en el callback (instante del toque), no en el
  intent estático, para no perder los segundos entre pintar y tocar.

### Puente Capacitor (`BiblioshareWidgetPlugin`, métodos nuevos)

- `getRunningTimer()` → `{ passId, startedAt }` | `null`.
- `setRunningTimer({ passId, startedAt })` → escribe `TimerStore` + `updateAll`.
- `clearRunningTimer({ passId })` → limpia + `updateAll`.

### Lado web

- `src/lib/native/android-widgets.ts`: envolturas finas `getRunningTimer` /
  `setRunningTimer` / `clearRunningTimer` sobre el plugin (no-op fuera de Android
  nativo, como `syncAndroidWidgets`).
- **Espejo app→nativo** en `timer.ts`: tras `emit()`, si `Capacitor.getPlatform()
  === "android"`, `writeTimer` llama `setRunningTimer(pass, firstStartedAt)` y
  `clearTimer` llama `clearRunningTimer(pass)` (import dinámico y guarda de
  plataforma, como `sync.ts`, para no cargar nativo en web ni en los tests).
  - *Ceiling asumido:* el widget no modela **pausa** (startedAt null con
    acumulado). Si en la app se pausa, se espeja como `clearRunningTimer` → el
    widget vuelve a «Sesión». Con la app abierta el usuario mira la app, no el
    widget, así que la pérdida de fidelidad es inocua. Se abre issue.
- **Siembra nativo→app al abrir**: en el arranque/`resume` de Capacitor, leer
  `getRunningTimer()` y, si hay y `localStorage` no tiene reloj para ese pase,
  `writeTimer(pass, { startedAt, accumulatedMs: 0, firstStartedAt: startedAt })`.
  (Engancha en el bootstrap nativo existente donde se dispara la sync.)

### Notas de seguridad/consistencia

- `TimerStore` es privado y solo texto de presentación (passId + epoch): sin
  tokens, como `WidgetSnapshotStore`. En cambio de cuenta (userId distinto en el
  snapshot) se limpia junto con el snapshot.
- Registrar limpia el nativo **antes** de abrir la app y pasa minutos por URL: no
  hay doble conteo (no queda reloj que sembrar y la hoja ya trae el número).

## Tests (sin emulador)

- `build-widget-snapshot.test.ts` (vitest): campos nuevos del destacado, `nthLabel`
  y `contextLabel` formateados, `inProgressTotal`, `inProgressRest` con el tope de 3,
  «Sin progreso» cuando no hay progreso.
- `WidgetSnapshotTest.kt` (JUnit JVM): `parse` de un snapshot v2 completo; descarte
  por versión (`version = 1` con el APK v2 → null); `week`/`inProgressRest` ausentes
  → listas vacías sin romper.
- `WidgetStateTest.kt`: si `currentProgressState` cambia de forma, ajustar; el resto
  de estados (SignedOut/NothingInProgress/stale) no cambia.
- **Cronómetro nativo** (JUnit JVM): `TimerStore` round-trip (set/get/clear) y purga
  al cambiar de usuario; función pura que deriva `minutos = round(elapsed/60000)` y
  la guarda de sesión larga (`elapsed > 4 h` → estado «ábrela para registrar»). La
  siembra y el espejo dos-vías son de dispositivo → se cubren en **#485**.

## Definición de «hecho» (AGENTS.md)

- No toca esquema/BD (ni el snapshot ni el `TimerStore` son BD): sin cambios en
  `data-model.md`.
- Marcar la casilla correspondiente en `backlog.md` si existe; si no, no forzarla.
- Actualizar la memoria de widgets (esquema v2, layout grande, cronómetro nativo y
  la regla de propiedad de los dos relojes).
- **Abrir issues** (las issues son el backlog operativo, AGENTS.md): (a) el widget
  no modela la **pausa** del reloj (se espeja como clear) — `tipo:deuda`; (b)
  verificación en dispositivo de la sincronización dos-vías nativo↔WebView, si no
  cabe en **#485** — `tipo:cobertura`.
- La prueba en dispositivo real queda en **#485** (ya abierta).

## Fuera de alcance (YAGNI)

- La cola «Para más tarde» (`status=planned`): no está en la sección que se replica.
- **Editar** progreso/página/notas desde el widget: el cronómetro sí corre en el
  widget, pero **registrar/guardar abre la app** (Supabase no es alcanzable desde
  el widget). No es una limitación a resolver: es la arquitectura.
- Cronómetro para **series/películas**: la serie se mide en episodios, la película
  no tiene sesión — solo libros, como en `TodayActions`.
- Scroll horizontal real en «Continúa»: se muestra un tope fijo, el resto en la app.
- Nuevos tamaños en `DailyGoalWidget`: fuera de este cambio.
