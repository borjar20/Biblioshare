# Rediseño widgets «En curso» + «Registro» (Paper) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redibujar los widgets Android `CurrentProgressWidget` (Completo) y `QuickRegisterWidget` (Reducido) al estilo Paper, arreglar el fondo transparente, cambiar el flujo del Reducido a pick→cronómetro, y añadir pausa nativa al cronómetro.

**Architecture:** Widgets Jetpack Glance que pintan el `WidgetSnapshot` (ya lo trae la RPC de Fase 2). Los estados de contenido se envuelven en una superficie opaca Paper. El cronómetro nativo (SharedPreferences vía `TimerStore`/`TimerLogic`, ms de reloj de pared) gana pausa por tramos y se reconcilia con el reloj de la web (`timer.ts`) por espejo bidireccional.

**Tech Stack:** Kotlin + Glance 1.1.1, recursos Android (colores XML), tests JUnit4 JVM puros; TypeScript + Vitest para la web; Capacitor plugin como puente.

**Spec:** `docs/superpowers/specs/2026-08-06-widgets-en-curso-registro-paper-design.md`.

## Global Constraints

- **Glance sin fuentes propias**: fuente del sistema, jerarquía por tamaño/peso. Sin `fontFamily`.
- **Glance sin anillo cónico**: el cronómetro es `Chronometer` nativo (texto MM:SS) vía `AndroidRemoteViews`.
- **`cornerRadius` solo recorta en API 31+**; degradación aceptable.
- **Tokens Paper** exactos (§4 del spec), ambos temas, en `values/widget_colors.xml` y `values-night/widget_colors.xml`.
- **Verificación**: mía = `./gradlew :app:compileDebugKotlin :app:testDebugUnitTest` + `npx vitest run` + `npx tsc --noEmit` + `npx eslint`; en dispositivo = la hace el dueño (#485/#498). `JAVA_HOME` al JBR de Android Studio; `npx cap sync android` antes de compilar (regenera `capacitor.build.gradle`; revertir después los ficheros gradle que toque cap sync).
- **Rama**: `claude/widget-redesign-498`. Commits frecuentes, uno por tarea.
- Repo mono-`es`: strings nuevas de UI a `strings.xml` (no `values-en`).

---

## FASE A — Visual + flujo (sin pausa)

### Task A1: Tokens de color Paper (profundidad fondo↔tarjeta)

**Files:**
- Modify: `android/app/src/main/res/values/widget_colors.xml`
- Modify: `android/app/src/main/res/values-night/widget_colors.xml`

**Interfaces:**
- Produces: recursos `@color/widget_bg`, `widget_surface`, `widget_track`, `widget_fg`, `widget_fg_soft`, `widget_accent`, `widget_accent_fg` (nuevo), `widget_gold`, `widget_border` (nuevo). Consumidos por `WidgetUi.kt` (`WidgetPalette`) en tareas siguientes.

- [ ] **Step 1: Reescribir `values/widget_colors.xml` (claro)**

```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- Paleta Paper (globals.css del design system): par claro aquí, oscuro en values-night.
     widget_bg = background (hondo); widget_surface = tarjetas (elevadas). -->
<resources>
    <color name="widget_bg">#F3ECE1</color>
    <color name="widget_surface">#FFFDF8</color>
    <color name="widget_track">#ECE3D4</color>
    <color name="widget_fg">#2C2620</color>
    <color name="widget_fg_soft">#877E70</color>
    <color name="widget_accent">#B0542F</color>
    <color name="widget_accent_fg">#FFF5EF</color>
    <color name="widget_gold">#C98A2B</color>
    <color name="widget_border">#242C1420</color>
</resources>
```

- [ ] **Step 2: Reescribir `values-night/widget_colors.xml` (oscuro)**

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="widget_bg">#1F1A16</color>
    <color name="widget_surface">#2A231D</color>
    <color name="widget_track">#332B23</color>
    <color name="widget_fg">#F0E8DB</color>
    <color name="widget_fg_soft">#A99E8C</color>
    <color name="widget_accent">#D98A5C</color>
    <color name="widget_accent_fg">#1F1409</color>
    <color name="widget_gold">#E0A94A</color>
    <color name="widget_border">#1FF0E8DB</color>
</resources>
```

- [ ] **Step 3: Añadir los dos tokens nuevos a `WidgetPalette`** en `WidgetUi.kt`:

```kotlin
val accentFg = ColorProvider(R.color.widget_accent_fg)
val border = ColorProvider(R.color.widget_border)
```

- [ ] **Step 4: Compilar** — `cd android && ./gradlew :app:compileDebugKotlin --console=plain`. Esperado: BUILD SUCCESSFUL (los recursos resuelven).
- [ ] **Step 5: Commit** — `git commit -am "style(widgets): tokens Paper con profundidad fondo/tarjeta + accent-fg/border (#498)"`

---

### Task A2: `WidgetSurface` — arreglar el fondo transparente

**Files:**
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetUi.kt`
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/CurrentProgressWidget.kt`
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/QuickRegisterWidget.kt`

**Interfaces:**
- Produces: `@Composable fun WidgetSurface(content: @Composable () -> Unit)` — Box de fondo opaco redondeado, sin click. Consumido por los estados de contenido de ambos widgets.

- [ ] **Step 1: Añadir `WidgetSurface` a `WidgetUi.kt`** y refactorizar `WidgetCard` para reusarlo:

```kotlin
/** Superficie base opaca (fondo Paper redondeado + padding), SIN navegación.
 *  Envuelve los estados de CONTENIDO —antes solo los vacíos tenían fondo, de ahí
 *  el "fondo transparente" (#498). WidgetCard = WidgetSurface + click de pantalla. */
@Composable
fun WidgetSurface(content: @Composable () -> Unit) {
    Box(
        modifier = GlanceModifier.fillMaxSize()
            .background(ImageProvider(R.drawable.widget_background))
            .padding(12.dp),
    ) { content() }
}

@Composable
fun WidgetCard(deepLinkPath: String, content: @Composable () -> Unit) {
    val context = LocalContext.current
    Box(
        modifier = GlanceModifier.fillMaxSize()
            .background(ImageProvider(R.drawable.widget_background))
            .clickable(actionStartActivity(WidgetDeepLinks.intentFor(context, deepLinkPath)))
            .padding(12.dp),
    ) { content() }
}
```

- [ ] **Step 2: Envolver el contenido del Completo** en `CurrentProgressWidget.kt`: en `CurrentProgressContent`, cambiar la rama `is ProgressWidgetState.Content -> Completo(state, covers, running)` por `is ProgressWidgetState.Content -> WidgetSurface { Completo(state, covers, running) }`. Y en `Completo`, quitar el `padding(4.dp)` del `Column` raíz (el padding lo pone `WidgetSurface`), dejando `Column(GlanceModifier.fillMaxSize())`.

- [ ] **Step 3: Envolver los pasos del Reducido** en `QuickRegisterWidget.kt`: en `QuickRegisterContent`, envolver `PickStep(...)` y `RegisterStep(...)` en `WidgetSurface { ... }`; quitar el `padding(4.dp)` de sus `Column` raíz.

- [ ] **Step 4: Compilar + tests** — `./gradlew :app:compileDebugKotlin :app:testDebugUnitTest --console=plain`. Esperado: BUILD SUCCESSFUL (los tests de estado siguen verdes; no cambió la lógica).
- [ ] **Step 5: Commit** — `git commit -am "fix(widgets): superficie opaca en los estados de contenido (arregla fondo transparente, #498)"`

---

### Task A3: Restyle Completo + «Meta de hoy» en el destacado

**Files:**
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetState.kt`
- Test: `android/app/src/test/java/app/biblioshare/mobile/widgets/WidgetStateTest.kt`
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/CurrentProgressWidget.kt`
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetUi.kt`

**Interfaces:**
- Consumes: `ProgressWidgetState.Content`, `DailyGoalData`, `WidgetPalette` (Task A1).
- Produces: `ProgressWidgetState.Content.dailyGoal: DailyGoalData?` — objetivo global para el destacado.

- [ ] **Step 1: Test — el estado Content lleva el dailyGoal global.** Añadir a `WidgetStateTest.kt`:

```kotlin
@Test fun `Content lleva el dailyGoal global del snapshot`() {
    val goal = DailyGoalData("2026-08-06", "minutes", 10, 30, 33, "10 / 30 min", "Te quedan 20 minutos", 5, false, "/")
    val snap = snapshotWith(inProgress = listOf(sampleBook()), dailyGoal = goal)
    val state = currentProgressState(snap, selectedPassId = null) as ProgressWidgetState.Content
    assertEquals(goal, state.dailyGoal)
}
```

(Reusar los helpers `snapshotWith`/`sampleBook` ya existentes en `WidgetStateTest.kt`; si el helper `snapshotWith` no acepta `dailyGoal`, extenderlo con parámetro por defecto `dailyGoal: DailyGoalData? = null`.)

- [ ] **Step 2: Ver fallar** — `./gradlew :app:testDebugUnitTest --tests "*WidgetStateTest*" --console=plain`. Esperado: FAIL (no existe `Content.dailyGoal`).

- [ ] **Step 3: Añadir `dailyGoal` a `Content`** en `WidgetState.kt`:

```kotlin
data class Content(
    val items: List<CurrentProgressData>,
    val selectedPassId: String?,
    val total: Int,
    val stale: Boolean,
    val dailyGoal: DailyGoalData?,
) : ProgressWidgetState { /* featured/others sin cambios */ }
```

y en `currentProgressState`, pasar `dailyGoal = snapshot.dailyGoal` al construir `Content`.

- [ ] **Step 4: Ver pasar** — mismo comando. Esperado: PASS.

- [ ] **Step 5: Restyle `FeaturedCard`** en `CurrentProgressWidget.kt` (recibe ahora `dailyGoal: DailyGoalData?`). Estructura (spec §6), tokens de `WidgetPalette`:
  - Raíz: `Row` con **barra de acento**: primer hijo `Box(GlanceModifier.width(4.dp).fillMaxHeight().background(WidgetPalette.accent))`, luego el contenido; todo dentro de `Column(...).background(WidgetPalette.surface).cornerRadius(18.dp)`.
  - Contenido: portada 72×104 `cornerRadius(8.dp)` + columna (ordinal `accentStyle`, título `bigStyle`, contexto `softStyle`).
  - **Bloque «Meta de hoy»** (solo si `dailyGoal != null`): fila `Text("Meta de hoy", softStyle)` + a la derecha `Text("${g.currentValue} / ${g.targetValue} min")`, y `SoftBar(g.percentage)`.
  - Fila racha+semana: `StreakPill` + `WeekDots` (ya existen; re-estilar en Step 6).
  - **Pie partido** con borde superior: `Row` precedido de `Box(GlanceModifier.fillMaxWidth().height(1.dp).background(WidgetPalette.border))`; dos `ActionCell` al 50% («◷ Sesión» accent con divisor / «✎ Registrar» fg). (En Fase A el "Sesión" sigue llamando a `StartTimerAction` → `SessionTimerView` de Task A4.)

- [ ] **Step 6: Re-estilar `StreakPill` y `WeekDots`** en `WidgetUi.kt` a los tokens (rombo `gold`; dots 15dp `cornerRadius(4.dp)`: on=`accent`, hoy=borde `fg_soft`, off=`track`). Ajuste visual, sin cambio de firma.

- [ ] **Step 7: Compilar + tests** — `./gradlew :app:compileDebugKotlin :app:testDebugUnitTest --console=plain`. Esperado: BUILD SUCCESSFUL, tests verdes.
- [ ] **Step 8: Commit** — `git commit -am "style(widgets): restyle Completo Paper (barra acento, meta de hoy, pie partido) (#498)"`

---

### Task A4: Vista de cronómetro compartida (sin pausa) + flujo Reducido pick→crono

**Files:**
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetUi.kt`
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/CurrentProgressWidget.kt`
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/QuickRegisterWidget.kt`
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetActions.kt`
- Modify: `android/app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: `TimerLogic.Running` (modelo actual sin pausa), `RegisterTimerAction`, `DiscardTimerAction`, `StartTimerAction`.
- Produces: `@Composable fun SessionTimerView(pass: CurrentProgressData, running: TimerLogic.Running?)` — la vista de sesión (crono o "iniciar"), reutilizable por Completo y Reducido.

- [ ] **Step 1: Extraer `SessionTimerView`** a `WidgetUi.kt` desde el actual `FeaturedActions` de `CurrentProgressWidget.kt` (mover, no duplicar). Firma `SessionTimerView(d: CurrentProgressData, running: TimerLogic.Running?)`. En Fase A conserva la UI actual: si `running` es de este pase → `Chronometer` + `ActionCell`(Descartar / Registrar); si no → `ActionCell`(Sesión / Registrar). Re-estilar botones a tokens Paper (`track`/`accent`/`accent_fg`).

- [ ] **Step 2: Usar `SessionTimerView` en el pie del Completo** (`FeaturedCard`) — el pie partido llama a `SessionTimerView` en el estado de cronómetro; el pie estático (Sesión|Registrar) es su rama "sin running".

- [ ] **Step 3: Reducido paso 2 = `SessionTimerView`.** En `QuickRegisterWidget.kt`, `RegisterStep(item, cover, ...)` deja de pintar chips/`PrimaryButton` y pinta: cabecera (back ‹ + «Sesión») + ficha compacta (portada 64×96 + ordinal + título) + `SessionTimerView(item, running)` + enlace secundario **«Registrar en la app»** (`Text` `fg_soft` clicable → `actionStartActivity` a `/sesion/${item.passId}`). Para no-libros: solo el enlace de acceso (sin cronómetro). Pasar `running = TimerStore.get(context)` desde `provideGlance` de `QuickRegisterWidget` (como ya hace `CurrentProgressWidget`).

- [ ] **Step 4: Quitar los chips de minutos.** Borrar de `WidgetActions.kt`: `STEP_KEY`/`QR_SELECTED_KEY` se conservan; borrar `QR_MINUTES_KEY`, `MINUTES_PARAM`, `PickMinutesAction`, y `BackAction` se conserva. `PickAction` deja `STEP_KEY=2` + `QR_SELECTED_KEY` (sin `QR_MINUTES_KEY`). Borrar `MinuteChip` de `WidgetUi.kt` (queda sin usar). Ajustar `quickRegisterState`/`QuickRegisterContent` para no leer `QR_MINUTES_KEY`.

- [ ] **Step 5: Strings** — añadir a `values/strings.xml` `widget_register_in_app` = "Registrar en la app" (y retirar las de chips que queden muertas: `widget_save_session`, `widget_other_minutes` si ya no se usan — comprobar con grep antes de borrar).

- [ ] **Step 6: Compilar + tests** — `./gradlew :app:compileDebugKotlin :app:testDebugUnitTest --console=plain`. Esperado: BUILD SUCCESSFUL, `WidgetStateTest` verde.
- [ ] **Step 7: Commit** — `git commit -am "feat(widgets): Reducido pick→cronómetro con acceso a registro; vista de sesión compartida (#498)"`

**FIN FASE A** — punto de entrega verificable en dispositivo (fondo, estilo, flujo). Se puede sincronizar (`npx cap sync android`), compilar el APK y probar antes de seguir con la Fase B.

---

## FASE B — Pausa nativa

### Task B1: Modelo de pausa en `TimerLogic` (lógica pura, TDD)

**Files:**
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/TimerStore.kt`
- Test: `android/app/src/test/java/app/biblioshare/mobile/widgets/TimerStoreTest.kt`
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetTimer.kt`

**Interfaces:**
- Produces: `TimerLogic.Running(passId, anchor, firstStartedAt, accumulatedMs, running)`; `TimerLogic.start/pause/resume/set`; `elapsedMs(r, now)`. Consumido por WidgetActions y el render (B2) y el puente (B3).

- [ ] **Step 1: Tests de pausa** — añadir a `TimerStoreTest.kt`:

```kotlin
@Test fun `elapsed corriendo cuenta desde el ancla; pausado es el acumulado`() {
    val running = TimerLogic.Running("p1", anchor = 1_000L, firstStartedAt = 1_000L, accumulatedMs = 0L, running = true)
    assertEquals(500L, elapsedMs(running, now = 1_500L))
    val paused = running.copy(running = false, accumulatedMs = 500L)
    assertEquals(500L, elapsedMs(paused, now = 9_999L)) // congelado
}

@Test fun `pause banca el elapsed; resume reancla sin perderlo`() {
    val m = HashMap<String, String>()
    TimerLogic.start(m, "p1", now = 1_000L)                 // anchor=1000, acc=0, running
    TimerLogic.pause(m, now = 1_500L)                       // acc=500, pausado
    assertEquals(500L, elapsedMs(TimerLogic.get(m)!!, now = 9_999L))
    TimerLogic.resume(m, now = 2_000L)                      // anchor = 2000-500 = 1500
    assertEquals(700L, elapsedMs(TimerLogic.get(m)!!, now = 2_200L)) // 500 + 200
}

@Test fun `set (espejo app) restaura estado pausado`() {
    val m = HashMap<String, String>()
    TimerLogic.set(m, "p1", anchor = 0L, firstStartedAt = 100L, accumulatedMs = 800L, running = false)
    val r = TimerLogic.get(m)!!
    assertEquals(false, r.running)
    assertEquals(800L, elapsedMs(r, now = 5_000L))
    assertEquals(100L, r.firstStartedAt)
}
```

- [ ] **Step 2: Ver fallar** — `./gradlew :app:testDebugUnitTest --tests "*TimerStoreTest*" --console=plain`. Esperado: FAIL.

- [ ] **Step 3: Implementar** en `TimerStore.kt`. Nuevas claves `timer_accumulated`, `timer_running`; renombrar semánticamente `timer_started_at`→ ancla (misma clave). Nuevo `Running` y funciones:

```kotlin
data class Running(
    val passId: String, val anchor: Long, val firstStartedAt: Long,
    val accumulatedMs: Long, val running: Boolean,
)

fun start(m: MutableMap<String, String>, passId: String, now: Long) =
    set(m, passId, anchor = now, firstStartedAt = now, accumulatedMs = 0L, running = true)

fun set(m: MutableMap<String, String>, passId: String, anchor: Long, firstStartedAt: Long, accumulatedMs: Long, running: Boolean) {
    m["timer_pass_id"] = passId
    m["timer_started_at"] = anchor.toString()
    m["timer_first_at"] = firstStartedAt.toString()
    m["timer_accumulated"] = accumulatedMs.toString()
    m["timer_running"] = if (running) "1" else "0"
    clearTombstone(m, null)
}

fun pause(m: MutableMap<String, String>, now: Long) {
    val r = get(m) ?: return
    if (!r.running) return
    set(m, r.passId, anchor = r.anchor, firstStartedAt = r.firstStartedAt, accumulatedMs = now - r.anchor, running = false)
}

fun resume(m: MutableMap<String, String>, now: Long) {
    val r = get(m) ?: return
    if (r.running) return
    set(m, r.passId, anchor = now - r.accumulatedMs, firstStartedAt = r.firstStartedAt, accumulatedMs = r.accumulatedMs, running = true)
}

fun get(m: Map<String, String>): Running? {
    val id = m["timer_pass_id"] ?: return null
    val anchor = m["timer_started_at"]?.toLongOrNull() ?: return null
    val first = m["timer_first_at"]?.toLongOrNull() ?: anchor
    val acc = m["timer_accumulated"]?.toLongOrNull() ?: 0L
    val running = m["timer_running"] != "0" // ausencia = corriendo (compat sesiones viejas)
    return Running(id, anchor, first, acc, running)
}
```

`elapsedMs` en `WidgetTimer.kt`:

```kotlin
fun elapsedMs(r: TimerLogic.Running, now: Long): Long =
    if (r.running) now - r.anchor else r.accumulatedMs
```

Actualizar `clear`/`clearFromWidget`/`KEYS` de `TimerStore` para incluir `timer_accumulated` y `timer_running`. Actualizar `TimerStore.set`/añadir `TimerStore.start/pause/resume` (wrappers `edit{}`). Ajustar el `Running` de `TimerStoreTest` existente («ancla e inicio se guardan por separado») a la nueva firma (`accumulatedMs=0, running=true`).

- [ ] **Step 4: Ver pasar** — `./gradlew :app:testDebugUnitTest --console=plain`. Esperado: PASS (todos, incl. los viejos ajustados).
- [ ] **Step 5: Commit** — `git commit -am "feat(widgets): pausa por tramos en TimerLogic (acumulado+running) (#498)"`

---

### Task B2: Render pausado + acciones Pause/Resume

**Files:**
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetActions.kt`
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetUi.kt`
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/CurrentProgressWidget.kt` (si `SessionTimerView` vive allí, ya movido a WidgetUi en A4)
- Modify: `android/app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: `TimerLogic` (B1), `TimerStore.pause/resume`, `elapsedMs`.
- Produces: `PauseTimerAction`, `ResumeTimerAction` (`ActionCallback`).

- [ ] **Step 1: Acciones** en `WidgetActions.kt`:

```kotlin
class PauseTimerAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        TimerStore.pause(c, System.currentTimeMillis())
        CurrentProgressWidget().update(c, id)
        QuickRegisterWidget().update(c, id)
    }
}
class ResumeTimerAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        TimerStore.resume(c, System.currentTimeMillis())
        CurrentProgressWidget().update(c, id)
        QuickRegisterWidget().update(c, id)
    }
}
```

(`TimerStore.pause/resume` = wrappers `edit { TimerLogic.pause(it, now) }` etc., añadidos en B1 o aquí.)

- [ ] **Step 2: Render en `SessionTimerView`** (WidgetUi.kt): si `running.running` → `Chronometer` (base `chronometerBase(running.anchor, now, elapsedRealtime)`) + botones **Pausar** (`PauseTimerAction`) │ **Registrar** (`RegisterTimerAction`); si `!running.running` → `Text` con el tiempo congelado `fmt(elapsedMs(running, now))` + **Reanudar** (`ResumeTimerAction`) │ **Registrar**; y «Descartar» (`DiscardTimerAction`) en ambos. Añadir helper `fmt(ms)` → "MM:SS".

- [ ] **Step 3: `RegisterTimerAction` con elapsed pausable** (WidgetActions.kt): `val r = TimerStore.get(c) ?: return; val minutos = Math.round(elapsedMs(r, System.currentTimeMillis()) / 60000.0).toInt(); val inicio = Instant.ofEpochMilli(r.firstStartedAt).toString(); ...` (resto igual). `StartTimerAction` usa `TimerStore.start(c, passId, now)`.

- [ ] **Step 4: Strings** — `widget_pause`="Pausar", `widget_resume`="Reanudar" en `strings.xml`.
- [ ] **Step 5: Compilar + tests** — `./gradlew :app:compileDebugKotlin :app:testDebugUnitTest --console=plain`. Esperado: BUILD SUCCESSFUL.
- [ ] **Step 6: Commit** — `git commit -am "feat(widgets): vista de sesión con pausar/reanudar nativo (#498)"`

---

### Task B3: Reconciliación de los dos relojes (puente + web)

**Files:**
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/BiblioshareWidgetPlugin.kt`
- Modify: `src/lib/native/android-widgets.ts`
- Modify: `src/lib/sessions/timer.ts`
- Test: `src/lib/sessions/timer.test.ts`
- Modify: `src/lib/native/widget-timer-bootstrap.ts`

**Interfaces:**
- Consumes: `TimerLogic` nativo (B1), `TimerState` web (`timer.ts`).
- Produces: puente `setRunningTimer({passId, anchor, firstStartedAt, accumulatedMs, running})` y `getRunningTimer()` con esos campos; `widgetMirror(state)` y `timerStateFromWidget(native)` puros (TS).

- [ ] **Step 1: Tests de conversión** en `timer.test.ts`:

```ts
import { widgetMirror, timerStateFromWidget } from "./timer";

test("widgetMirror: corriendo manda ancla efectiva + acumulado", () => {
  const s = { startedAt: 2000, accumulatedMs: 500, firstStartedAt: 100 };
  expect(widgetMirror(s)).toEqual({ passOp: "set", anchor: 1500, accumulatedMs: 500, running: true, firstStartedAt: 100 });
});
test("widgetMirror: pausado manda running=false y acumulado", () => {
  const s = { startedAt: null, accumulatedMs: 800, firstStartedAt: 100 };
  expect(widgetMirror(s)).toEqual({ passOp: "set", anchor: 0, accumulatedMs: 800, running: false, firstStartedAt: 100 });
});
test("timerStateFromWidget: corriendo reconstruye elapsed idéntico", () => {
  const native = { anchor: 1500, accumulatedMs: 500, running: true, firstStartedAt: 100 };
  const st = timerStateFromWidget(native); // { startedAt: 2000, accumulatedMs: 500, firstStartedAt: 100 }
  expect(st.startedAt! - st.accumulatedMs).toBe(1500); // widgetAnchor == anchor
});
test("timerStateFromWidget: pausado deja startedAt null y el acumulado", () => {
  const native = { anchor: 0, accumulatedMs: 800, running: false, firstStartedAt: 100 };
  expect(timerStateFromWidget(native)).toEqual({ startedAt: null, accumulatedMs: 800, firstStartedAt: 100 });
});
```

- [ ] **Step 2: Ver fallar** — `npx vitest run src/lib/sessions/timer.test.ts`. Esperado: FAIL (funciones no existen).

- [ ] **Step 3: Implementar `widgetMirror` y `timerStateFromWidget`** en `timer.ts`:

```ts
export function widgetMirror(state: TimerState) {
  const running = state.startedAt !== null;
  return {
    passOp: "set" as const,
    anchor: running ? state.startedAt! - state.accumulatedMs : 0,
    accumulatedMs: state.accumulatedMs,
    running,
    firstStartedAt: state.firstStartedAt ?? state.startedAt ?? 0,
  };
}
export function timerStateFromWidget(n: {
  anchor: number; accumulatedMs: number; running: boolean; firstStartedAt: number;
}): TimerState {
  return {
    startedAt: n.running ? n.anchor + n.accumulatedMs : null,
    accumulatedMs: n.accumulatedMs,
    firstStartedAt: n.firstStartedAt,
  };
}
```

- [ ] **Step 4: Ver pasar** — `npx vitest run src/lib/sessions/timer.test.ts`. Esperado: PASS.

- [ ] **Step 5: Cablear el espejo app→nativo** en `timer.ts` `mirrorToWidget`: al pausar YA NO llamar a `clearRunningTimer`; usar `widgetMirror(state)` y llamar `setRunningTimer(passId, m.anchor, m.firstStartedAt, m.accumulatedMs, m.running)`. Solo `clear`/reset → `clearRunningTimer`.

- [ ] **Step 6: Ampliar el puente.** `BiblioshareWidgetPlugin.setRunningTimer`: leer `accumulatedMs` y `running` (además de `passId`/`startedAt`(=anchor)/`firstStartedAt`) → `TimerStore.set(context, passId, anchor, first, accumulated, running)`. `getRunningTimer`: devolver también `accumulatedMs` y `running`. En `android-widgets.ts`: extender la interfaz y las firmas `setRunningTimer`/`getRunningTimer`/`NativeRunningTimer` con `accumulatedMs`/`running`.

- [ ] **Step 7: Seed nativo→app** en `widget-timer-bootstrap.ts`: usar `timerStateFromWidget(...)` con los campos ampliados de `getRunningTimer()` para construir el `TimerState` que se siembra (running o pausado). Conservar la lógica de lápida (#493).

- [ ] **Step 8: Verificar web** — `npx vitest run && npx tsc --noEmit && npx eslint src/lib/sessions/timer.ts src/lib/native/android-widgets.ts src/lib/native/widget-timer-bootstrap.ts`. Esperado: verde.
- [ ] **Step 9: Compilar nativo** — `cd android && ./gradlew :app:compileDebugKotlin :app:testDebugUnitTest --console=plain`. Esperado: BUILD SUCCESSFUL.
- [ ] **Step 10: Commit** — `git commit -am "feat(widgets): reconciliación de los dos relojes con pausa (puente + web) (#498)"`

**FIN FASE B.**

---

## Cierre (tras verificación en dispositivo del dueño)

- [ ] Marcar #498 y anotar en `docs/requirements/decisiones.md` la decisión (pausa nativa reabre #489; el mockup se adaptó a Glance). Cerrar/actualizar #489-#493 según lo que la pausa nativa deroga.
- [ ] Actualizar la memoria [[widgets-android]] (el techo "sin pausa" ya no aplica).
- [ ] Revertir los ficheros gradle que `cap sync` regenere en el worktree antes de commitear.

## Self-review (hecho)

- **Cobertura del spec:** §4 tokens→A1; §5 superficie→A2; §6 Completo+Meta→A3; §7 Reducido→A4; §8 pausa→B1/B2/B3; §9 fases→A/B; §10 verificación→gates de cada tarea. Sin huecos.
- **Placeholders:** ninguno; código real en tokens, TimerLogic, conversión y tests.
- **Consistencia de tipos:** `TimerLogic.Running(passId, anchor, firstStartedAt, accumulatedMs, running)` y `elapsedMs(r, now)` idénticos en B1/B2/B3; puente y `NativeRunningTimer` alineados (`accumulatedMs`/`running`); `widgetMirror`/`timerStateFromWidget` con las mismas claves en test e impl.
