---
Estado: Diseño aprobado · verificado 2026-08-05
Feature: Dos widgets de registro (Completo + Registro rápido) sobre «En curso»
Mockup: Claude Design «Paper - Widget de registro (2 tamaños).html»
---

# Dos widgets Android de registro de lectura

## Contexto

El widget Android `CurrentProgressWidget` pinta hoy **un solo** elemento en curso
en dos tamaños. El widget **no habla con Supabase**: pinta un snapshot que genera
la web (`src/lib/widgets/*`) y que el plugin nativo persiste. La lógica vive en
TS; Kotlin solo dibuja.

Se rehace como **dos widgets de pantalla de inicio** (el usuario elige cuál
añadir), según el mockup «Paper - Widget de registro (2 tamaños)»:

- **A · Completo** — replica la sección «¿Qué has disfrutado hoy?» del Inicio
  (`today-block.tsx`), **sin la fecha ni el título serif** (para reducir altura):
  `EN CURSO` + tarjeta destacada rica + `Continúa donde lo dejaste`.
- **B · Registro rápido** — flujo de **2 pasos**: elegir qué título en curso
  registrar → registro rápido (duración) de ese título.

El mockup es la fuente de verdad de **layout e interacción**. Límite honesto:
Glance = RemoteViews, así que no hay fuente serif de la app, ni filo de color en
degradado; se replica **estructura + contenido + paleta** (par claro/oscuro Paper
en `WidgetPalette`). Prueba en dispositivo → **#485**.

## Decisiones tomadas (esta sesión)

1. **Dos widgets separados**, no un responsive: el de 2 pasos tiene interacción
   propia (elegir → guardar), no es «el mismo más pequeño».
2. **«Continúa donde lo dejaste» CAMBIA EL FOCO**, no navega: tocar un título lo
   sube a destacado in-situ (como el `TodayPicker` web). Implica que el snapshot
   lleve datos **ricos de TODOS los en curso** (cualquiera puede ser destacado).
3. **Guardar/Registrar ABRE LA APP ya rellena** (con los minutos), donde el
   usuario aún **añade páginas/notas y confirma**. El widget no escribe en
   Supabase. Sin cola nativa. Se aplica igual al «Registrar» del cronómetro.
4. El botón **Sesión** del Completo arranca un **cronómetro nativo con segundos
   en vivo** que corre **sin abrir la app** (sección «Cronómetro nativo»).

## Datos — snapshot v2

Subir `WIDGET_SCHEMA_VERSION` **1 → 2** en los **dos** lados (`types.ts` +
`WidgetSnapshot.kt`). Snapshot de versión incompatible → se descarta → estado
vacío (comportamiento seguro ya existente).

El cambio de foco exige que **cada** en curso pueda ser el destacado, así que el
snapshot deja de llevar «un destacado + minis» y pasa a llevar **una lista de
en curso, todos ricos**:

```ts
export type CurrentProgressWidgetData = {
  passId: string;
  itemType: "book" | "movie" | "series";
  itemId: string;
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  percentage?: number | null;   // null = "Sin progreso"
  progressLabel: string;
  deepLink: string;             // ficha/registro del ítem
  // Ricos (para la tarjeta destacada del Completo):
  nthLabel: string;             // "1.ª lectura"
  contextLabel: string;         // "Día 4 · desde 2/8 · 1 nota" (puede ir vacío)
  streakDays: number;           // 0 = sin racha
  week: WidgetWeekDay[];        // 7 días, del más antiguo a hoy
  kindLabel: string;            // "libro" | "serie" | "película" (paso 1 del reducido)
};

export type WidgetWeekDay = { active: boolean; today: boolean };

export type WidgetSnapshot = {
  version: number;
  userId: string;
  generatedAt: string;
  /** Todos los en curso, orden servidor (el [0] es el destacado por defecto). */
  inProgress: CurrentProgressWidgetData[];
  inProgressTotal: number;      // = inProgress.length; explícito por claridad
  dailyGoal: DailyGoalWidgetData | null;  // GLOBAL (no por pase): la "Meta de hoy"
};
```

- **`build-widget-snapshot.ts`**: `buildInProgress(passes, t)` mapea `focus.featured`
  y `focus.rest` juntos (mismo orden) a `CurrentProgressWidgetData[]`, cada uno
  con sus campos ricos. `nthLabel` = `passes.nth.{itemType}` con `n = rereadCount +
  1`; `contextLabel` une `Día {n}` / `desde {date}` / `{n} nota(s)`; `week` a
  `{active, today}`. El build recibe el traductor `t` (lo tiene `actions.ts`, que
  es `"use server"`); las funciones puras siguen puras recibiendo `t`.
- **`actions.ts`**: pasa `passes = [focus.featured, ...focus.rest].filter(Boolean)`,
  `total`, el `dailyGoal` (ya lo calcula) y `t`. **Sin lecturas nuevas.**
- `snapshotFingerprint` no cambia de forma.

## Widget A · Completo

Layout (de arriba abajo), un único tamaño grande:

1. **`EN CURSO` ····· `{total} · ver todos ›`** — el enlace abre
   `/coleccion?status=in_progress` (navega). `total = inProgressTotal`.
2. **Tarjeta destacada** = el en curso **seleccionado** (por defecto `inProgress[0]`).
   Portada + `nthLabel` + título + `contextLabel` (o «Sin progreso») + fila
   **Meta de hoy** (barra + `{done} / {goal} min`, solo si `dailyGoal` existe y es
   de hoy) + `◆ Racha {n} d` (si `streakDays > 0`) + 7 cuadritos de `week` + pie
   **Sesión | Registrar**.
3. **`CONTINÚA DONDE LO DEJASTE`** (si hay más de uno) — **rejilla de portadas**
   (3 por fila, portada + título) con los en curso **no seleccionados**. Tocar
   una **la sube a destacada** (cambio de foco, ver abajo). No navega.

### Cambio de foco (Glance state, sin abrir la app)

- El destacado seleccionado se guarda en el **estado del widget** (per-instancia,
  `GlanceStateDefinition` de preferencias): clave `selected_pass_id`.
- Tocar una portada de la rejilla → `actionRunCallback` que escribe
  `selected_pass_id` y re-renderiza. Corre en el proceso, sin UI.
- Render: destacado = `inProgress.first { passId == selected } ?: inProgress[0]`.
  Si el `selected` guardado ya no está en el snapshot (terminaste ese título),
  cae al `[0]` — mismo criterio que `TodayPicker` en web.
- `EN CURSO` no depende del foco; la rejilla son «los demás».

### Acciones del Completo

- **Sesión** (solo libros con pase) → arranca el **cronómetro nativo** (sección
  siguiente). No abre la app.
- **Registrar** → abre la app rellena (sección «Registrar / Guardar»).
- **Ver todos** y cada portada de la rejilla ya descritos.
- La raíz sigue navegando al destacado como respaldo (`WidgetCard`).

## Widget B · Registro rápido (2 pasos)

Widget propio (`QuickRegisterWidget` + su receiver), tamaño reducido. El estado
(`step`, `selected_pass_id`, `selected_minutes`) vive en el **Glance state** de la
instancia. Todos los pasos son `actionRunCallback` (cambios de estado, sin abrir
la app) salvo **Guardar**, que abre la app.

- **Paso 1** — cabecera `Registrar lectura` + `{total} en curso`; lista compacta:
  por cada `inProgress`, portada (36×54) + `kindLabel` + título + barra de
  `percentage` (o «Sin progreso»). Tocar una fila → `selected_pass_id`, `step = 2`.
- **Paso 2** — cabecera con «‹» (vuelve a `step 1`) + `Registrar`; ficha compacta
  (portada 64×96 + `nthLabel` + título + `contextLabel`/«Primera sesión»). Debajo,
  **chips de duración** `15 / 30 / 45 / Otro` (uno marcado, defecto 30) que
  escriben `selected_minutes`; y botón **Guardar sesión**.
  - **Guardar** → abre la app en `/sesion/{pass}?minutos=M` (o sin `minutos` si
    «Otro»). Ver «Registrar / Guardar».
  - *Solo libros* tienen chips de duración (la sesión de lectura se mide en
    minutos). Si el título elegido es **serie/película**, el paso 2 no muestra
    chips: un único «Abrir para registrar» → su `deepLink` (episodio/ficha).
    Mismo criterio que `TodayActions`.

## Cronómetro nativo — Completo · «Sesión» (sin abrir la app)

El botón **Sesión** (libros) arranca el cronómetro **en el widget**, con
**segundos en vivo**, sin abrir ninguna pantalla. Guardar sí abre la app.

### Por qué hay DOS relojes (y la regla que evita que diverjan)

El cronómetro de la app vive en `localStorage` del WebView (`timer.ts`), que con
la app cerrada **no existe**. Para correr con la app cerrada, el estado vive en
**nativo**. Coexisten dos almacenes para el mismo reloj — justo lo que `timer.ts`
avisa que «tarde o temprano divergiría». Regla única de propiedad:

1. **Mientras hay reloj nativo, manda el nativo.**
2. **Al abrir la app** se **siembra** el `localStorage` desde el nativo (si aún no
   había reloj para ese pase). A partir de ahí los relojes de dentro de la app
   coinciden porque leen la misma clave.
3. **La app espeja hacia el nativo por UN solo punto**: `writeTimer`/`clearTimer`
   de `timer.ts` son el único sitio por el que pasan TODAS las escrituras del
   reloj. Ahí, y solo ahí, se refleja al store nativo.

### Estado nativo — `TimerStore` (Kotlin, nuevo)

SharedPreferences (patrón de `WidgetSnapshotStore`). Un reloj a la vez:
`pass_id: String`, `started_at_wallclock: Long` (epoch ms). **No** se guarda base
de `elapsedRealtime`: el `Chronometer` se recalcula en cada render desde el reloj
de pared (`base = SystemClock.elapsedRealtime() - (now - startedWall)`), así el
**reinicio del dispositivo no lo rompe**. Sin pausa en el widget → elapsed = `now
- startedWall`.

### Segundos en vivo — `Chronometer` incrustado

Glance no tiene cronómetro; se incrusta un `Chronometer` de Android con
`AndroidRemoteViews`, `base` como arriba y `setStarted(true)`: tics en el proceso
del launcher, **sin despertar la app ni updates periódicos**. Guarda de sesión
larga: si `now - startedWall > 4 h` (umbral de `isStale`), no se pinta el reloj
sino «sesión larga, ábrela para registrar». Theming del RemoteView = la pieza más
delicada, afinar en preview.

### Acciones nativas (Glance `actionRunCallback`)

- **StartTimerAction** (`Sesión`): lee el `passId` del **destacado seleccionado**,
  escribe `TimerStore(now)`, `updateAll`. Solo si libro con pase y sin reloj ya.
- **DiscardTimerAction** (`Descartar`): limpia `TimerStore`, `updateAll`.
- **Registrar** (con reloj vivo): `actionRunCallback` que calcula `minutos =
  round((now-startedWall)/60000)`, limpia `TimerStore` y **abre la app** en
  `/sesion/{pass}?minutos=M&inicio=ISO`. Se calcula en el callback (instante del
  toque), no en el intent estático.

### Puente Capacitor (`BiblioshareWidgetPlugin`, métodos nuevos)

`getRunningTimer()` → `{passId, startedAt}|null`; `setRunningTimer({passId,
startedAt})`; `clearRunningTimer({passId})` (cada set/clear hace `updateAll`).

### Lado web

- `src/lib/native/android-widgets.ts`: envolturas finas de esos métodos (no-op
  fuera de Android nativo, como `syncAndroidWidgets`).
- **Espejo app→nativo** en `timer.ts`: tras `emit()`, si Android nativo,
  `writeTimer`→`setRunningTimer`, `clearTimer`→`clearRunningTimer` (import dinámico
  + guarda de plataforma, como `sync.ts`; no carga nativo en web/tests).
  - *Ceiling:* el widget no modela **pausa**. Si en la app se pausa, se espeja como
    `clearRunningTimer` → el widget vuelve a «Sesión». Con la app abierta el
    usuario mira la app, no el widget. Se abre issue.
- **Siembra nativo→app al abrir**: en arranque/`resume` de Capacitor, `getRunningTimer()`
  y, si hay y `localStorage` no tiene reloj para ese pase, `writeTimer(pass,
  {startedAt, accumulatedMs:0, firstStartedAt:startedAt})`.

## Registrar / Guardar — abrir la app ya rellena (decisión 3)

Todos los caminos de «registrar/guardar» de ambos widgets **abren la hoja de
sesión rellena**, NO guardan en silencio: `/sesion/{pass}?minutos=M[&inicio=ISO]`.
`safeInternalPath` ya deja pasar query strings (no lleva `//` ni `://`). La hoja
(`BookProgressField`) ya consume `?minutos=`/`?inicio=` y deja **añadir páginas y
notas** antes de confirmar. Fuentes de los minutos:

- Completo · Registrar (sin reloj) → sin `minutos` (hoja vacía) o a la pestaña
  Registro de la ficha, como hoy.
- Completo · Registrar (con reloj vivo) → `minutos` del cronómetro + `inicio`.
- Reducido · Guardar → `minutos` del chip (o sin `minutos` si «Otro»).

No hay cola nativa ni guardado headless: la sesión se confirma en la app y cuenta
al instante en racha/meta/estadísticas.

## Kotlin / render

- **`WidgetSnapshot.kt`**: `WIDGET_SCHEMA_VERSION = 2`. `CurrentProgressData`
  reformado (campos ricos + `kindLabel`), `data class WidgetWeekDay`. `WidgetSnapshot`
  con `inProgress: List<CurrentProgressData>`, `inProgressTotal`, `dailyGoal`.
  `parse` con guardas defensivos; `inProgress`/`week` ausentes → listas vacías.
- **Dos `GlanceAppWidget` + dos receivers + dos entradas en `AndroidManifest.xml`**:
  `CurrentProgressWidget` (Completo, evoluciona el actual) y `QuickRegisterWidget`
  (Reducido, nuevo). Cada uno con su `GlanceStateDefinition` de preferencias
  (`selected_pass_id`; el reducido además `step`/`selected_minutes`) y su
  `appwidget-provider` xml.
- **`WidgetUi.kt`** comparte piezas: `WidgetCard`, `Cover`, `WidgetPalette`, estilos,
  barra de progreso, y nuevos helpers (píldora de racha, cuadritos de semana,
  rejilla de portadas, fila compacta, chips de duración).
- `provideGlance` (ambos) carga las portadas de **todos** los `inProgress`
  (`WidgetImageCache`, N pequeño) y pasa un `Map<url,Bitmap?>`.
- **Previews** (`WidgetPreviews.kt`, source set `debug`): Completo (con/sin racha,
  con/sin meta, con reloj vivo), Reducido paso 1 y paso 2, y los estados vacío/
  sin sesión de ambos.

### `WidgetState.kt`

`currentProgressState` pasa a exponer la lista `inProgress` + `total` (o `Content`
los lleva). Nuevo estado para el reducido (`QuickRegisterState`: paso 1/2 +
selección). Siguen funciones puras testeables en JVM.

## Tests (sin emulador)

- `build-widget-snapshot.test.ts` (vitest): `inProgress` con todos los en curso
  ricos, `nthLabel`/`contextLabel`/`kindLabel` formateados, «Sin progreso» sin
  progreso, `inProgressTotal`, `dailyGoal` global.
- `WidgetSnapshotTest.kt` (JUnit JVM): `parse` de un snapshot v2 completo; descarte
  por versión; `inProgress`/`week` ausentes → listas vacías.
- `WidgetStateTest.kt`: selección de destacado (fallback a `[0]` si el `selected`
  ya no está); estado de pasos del reducido; resto de estados sin cambio.
- **Cronómetro** (JUnit JVM): `TimerStore` round-trip + purga por cambio de usuario;
  `minutos = round(elapsed/60000)` y la guarda de sesión larga. Siembra y espejo
  dos-vías → dispositivo (#485).

## Definición de «hecho» (AGENTS.md)

- No toca esquema/BD (ni snapshot ni `TimerStore` son BD): sin cambios en
  `data-model.md`.
- Marcar casilla en `backlog.md` si existe; si no, no forzarla.
- Actualizar la memoria de widgets (v2, dos widgets, cambio de foco, cronómetro
  nativo y la regla de los dos relojes).
- **Abrir issues** (backlog operativo): (a) el widget no modela la **pausa** del
  reloj — `tipo:deuda`; (b) verificación en dispositivo de la sync dos-vías, si no
  cabe en #485 — `tipo:cobertura`.
- Prueba en dispositivo → **#485**.

## Fuera de alcance (YAGNI)

- La cola «Para más tarde» (`status=planned`): no está en las secciones replicadas.
- Guardado headless / cola offline de sesiones: descartado (decisión 3, abre la app).
- Cronómetro para series/películas: solo libros, como en `TodayActions`.
- Nuevos tamaños o cambios en `DailyGoalWidget`: fuera de este cambio.
