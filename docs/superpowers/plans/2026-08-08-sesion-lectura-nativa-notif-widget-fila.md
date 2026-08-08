# Sesión de lectura nativa: notificación persistente + widget 1-fila — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una notificación persistente y un widget compacto de 1 fila que espejen la `ReadingSession` nativa ya existente (`TimerStore`), sin tocar web ni Supabase.

**Architecture:** `TimerStore` (SharedPreferences, por timestamps) sigue siendo la única fuente de verdad de la sesión. Un foreground service (`specialUse`) construye una notificación *ongoing* que la refleja; un `ReadingRowWidget` (4x1) la refleja en la pantalla de inicio. Ambos son consumidores del mismo store; un hook único `ReadingSessionController.sync(context)` se llama desde los mismos puntos que ya repintan los widgets.

**Tech Stack:** Kotlin, Jetpack Glance 1.1.1 (widgets), `NotificationCompat`/foreground service (androidx.core), Capacitor bridge (Kotlin ↔ WebView). Tests JVM puros con JUnit4.

## Global Constraints

- **SDK:** `minSdk 24`, `compileSdk 36`, `targetSdk 36` (de `android/variables.gradle`). En target 36 un FGS **exige** `foregroundServiceType`.
- **FGS type:** `specialUse` + permisos `FOREGROUND_SERVICE` y `FOREGROUND_SERVICE_SPECIAL_USE`. Distribución = Firebase App Distribution (sideload), **no** Google Play → sin veto de Play sobre `specialUse`.
- **Terminar (■):** reusa el handoff existente `/sesion/:passId?minutos=&inicio=` → `addSession`. **Prohibido** escribir la sesión con una RPC nativa (duplicaría medio backend). **Cero migraciones, cero cambios web/TS.**
- **Tests:** solo JVM (sin Robolectric, sin emulador). JUnit4, nombres de test en backticks, estilo de `WidgetStateTest.kt`.
- **Toolchain:** `JAVA_HOME` debe apuntar al JBR de Android Studio para `gradle`. Comando de tests: `cd android && ./gradlew testDebugUnitTest --tests "<FQN>"`. Build: `cd android && ./gradlew assembleDebug`.
- **Higiene de commit (memoria «Widgets Android»):** antes de commitear, **revertir** los gradle regenerados por cap-sync: `android/app/capacitor.build.gradle` y `android/capacitor.settings.gradle`. No commitear el bloque de agente de `AGENTS.md` si reaparece.
- **Paquetes:** lo nuevo de notificación en `app.biblioshare.mobile.reading`; el widget nuevo en `app.biblioshare.mobile.widgets` (junto a los demás).

**Tipos existentes que se reutilizan (ya en el repo, no redefinir):**
- `TimerLogic.Running(passId: String, startedAt: Long, firstStartedAt: Long, accumulatedMs: Long, running: Boolean)` y `TimerStore` (`get`/`start`/`pause`/`resume`/`clearFromWidget`/`clear`) — `widgets/TimerStore.kt`.
- `WidgetTimer.kt` (puro): `elapsedMs(r, now)`, `elapsedMinutes(ms)`, `fmtElapsed(ms)`, `isLongSession(startedAt, now)`, `chronometerBase(...)`.
- `CurrentProgressData` y `WidgetSnapshot` — `widgets/WidgetSnapshot.kt`. `WidgetSnapshotStore.load(context): WidgetSnapshot?`.
- `WidgetImageCache.ensureDownloaded(context, url): Boolean` (bloqueante, hilo de fondo) y `loadBitmap(context, url): Bitmap?` (disco).
- `WidgetDeepLinks.intentFor(context, path): Intent`.
- `WidgetRefresh.updateAll(context)` y `updateAllSuspend(context)` — `widgets/BiblioshareWidgetPlugin.kt`.
- Acciones de widget existentes: `StartTimerAction`, `PauseTimerAction`, `ResumeTimerAction`, `DiscardTimerAction`, `RegisterTimerAction`, `SelectFocusAction`, `SELECTED_PASS_KEY`, `PASS_ID_PARAM` — `widgets/WidgetActions.kt`.

---

### Task 1: Estado puro del widget 1-fila

Funciones puras que deciden qué pinta el row: rotación circular del `⏭` y el modo (vacío / selector / sesión con pin al pase en curso).

**Files:**
- Create: `android/app/src/main/java/app/biblioshare/mobile/widgets/ReadingRowState.kt`
- Test: `android/app/src/test/java/app/biblioshare/mobile/widgets/ReadingRowStateTest.kt`

**Interfaces:**
- Consumes: `CurrentProgressData`, `WidgetSnapshot`, `TimerLogic.Running` (existentes).
- Produces:
  - `fun nextInProgress(items: List<CurrentProgressData>, currentId: String?): String?`
  - `sealed interface ReadingRowState { Empty; Selector(featured, hasOthers); Session(featured, running) }`
  - `fun readingRowState(snapshot: WidgetSnapshot?, selectedPassId: String?, running: TimerLogic.Running?): ReadingRowState`

- [ ] **Step 1: Write the failing tests**

```kotlin
// ReadingRowStateTest.kt
package app.biblioshare.mobile.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private fun rowItem(id: String) = CurrentProgressData(
    passId = id, itemType = "book", itemId = "b-$id", title = id, subtitle = null,
    coverUrl = null, percentage = 10, progressLabel = "x", deepLink = "/sesion/$id",
    nthLabel = "1.ª lectura", contextLabel = "", streakDays = 0, week = emptyList(),
    kindLabel = "Libro",
)

private fun rowSnap(vararg ids: String) =
    WidgetSnapshot(WIDGET_SCHEMA_VERSION, "u1", "2026-08-08T09:00:00.000Z", ids.map(::rowItem), ids.size, null)

private fun runningOf(id: String, running: Boolean = true) =
    TimerLogic.Running(passId = id, startedAt = 1_000L, firstStartedAt = 1_000L, accumulatedMs = 0L, running = running)

class NextInProgressTest {
    @Test fun `el siguiente circular vuelve al primero`() {
        assertEquals("p1", nextInProgress(rowSnap("p1", "p2", "p3").inProgress, "p3"))
    }
    @Test fun `el siguiente normal avanza uno`() {
        assertEquals("p2", nextInProgress(rowSnap("p1", "p2", "p3").inProgress, "p1"))
    }
    @Test fun `id ausente empieza por el primero`() {
        assertEquals("p1", nextInProgress(rowSnap("p1", "p2").inProgress, "zzz"))
    }
    @Test fun `un solo item cicla a si mismo`() {
        assertEquals("p1", nextInProgress(rowSnap("p1").inProgress, "p1"))
    }
    @Test fun `lista vacia es null`() {
        assertNull(nextInProgress(emptyList(), "p1"))
    }
}

class ReadingRowStateTest {
    @Test fun `sin snapshot es Empty`() {
        assertEquals(ReadingRowState.Empty, readingRowState(null, null, null))
    }
    @Test fun `sin nada en curso es Empty`() {
        assertEquals(ReadingRowState.Empty, readingRowState(rowSnap(), null, null))
    }
    @Test fun `sin sesion usa la seleccion`() {
        val s = readingRowState(rowSnap("p1", "p2"), "p2", null) as ReadingRowState.Selector
        assertEquals("p2", s.featured.passId)
        assertTrue(s.hasOthers)
    }
    @Test fun `sin sesion y seleccion ausente cae al primero`() {
        val s = readingRowState(rowSnap("p1", "p2"), "zzz", null) as ReadingRowState.Selector
        assertEquals("p1", s.featured.passId)
    }
    @Test fun `un solo item no tiene otros`() {
        val s = readingRowState(rowSnap("p1"), null, null) as ReadingRowState.Selector
        assertFalse(s.hasOthers)
    }
    @Test fun `sesion activa se fija al pase en curso aunque la seleccion sea otra`() {
        val s = readingRowState(rowSnap("p1", "p2"), "p1", runningOf("p2")) as ReadingRowState.Session
        assertEquals("p2", s.featured.passId)
    }
    @Test fun `sesion de un pase ausente del snapshot cae a selector`() {
        val s = readingRowState(rowSnap("p1", "p2"), "p1", runningOf("fantasma"))
        assertTrue(s is ReadingRowState.Selector)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd android && ./gradlew testDebugUnitTest --tests "app.biblioshare.mobile.widgets.ReadingRowStateTest" --tests "app.biblioshare.mobile.widgets.NextInProgressTest"`
Expected: FAIL con «unresolved reference: nextInProgress / readingRowState / ReadingRowState».

- [ ] **Step 3: Write the implementation**

```kotlin
// ReadingRowState.kt
package app.biblioshare.mobile.widgets

// Estado puro del widget de 1 fila (4x1): rotación del ⏭ y elección de qué pase
// se pinta. Se fija al pase EN CURSO durante la sesión (pin), ignorando la
// selección manual; fuera de sesión manda la selección recordada. Puro para
// probarlo en JVM, igual que currentProgressState.

/** Siguiente pase circular tras `currentId`; si no está, el primero; vacío → null. */
fun nextInProgress(items: List<CurrentProgressData>, currentId: String?): String? {
    if (items.isEmpty()) return null
    val idx = items.indexOfFirst { it.passId == currentId }
    val next = if (idx < 0) 0 else (idx + 1) % items.size
    return items[next].passId
}

sealed interface ReadingRowState {
    /** Sin sesión y sin nada a medias (o sin snapshot). */
    data object Empty : ReadingRowState
    /** Sin sesión: pase destacado + si hay más de uno en curso (para mostrar ⏭). */
    data class Selector(val featured: CurrentProgressData, val hasOthers: Boolean) : ReadingRowState
    /** Sesión activa: fijado al pase en curso, con su reloj. */
    data class Session(val featured: CurrentProgressData, val running: TimerLogic.Running) : ReadingRowState
}

fun readingRowState(
    snapshot: WidgetSnapshot?,
    selectedPassId: String?,
    running: TimerLogic.Running?,
): ReadingRowState {
    val items = snapshot?.inProgress.orEmpty()
    if (items.isEmpty()) return ReadingRowState.Empty
    // Pin: si hay sesión y su pase está en el snapshot, manda sobre la selección.
    val runningItem = running?.let { r -> items.firstOrNull { it.passId == r.passId } }
    if (running != null && runningItem != null) return ReadingRowState.Session(runningItem, running)
    val featured = items.firstOrNull { it.passId == selectedPassId } ?: items.first()
    return ReadingRowState.Selector(featured, hasOthers = items.size > 1)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd android && ./gradlew testDebugUnitTest --tests "app.biblioshare.mobile.widgets.ReadingRowStateTest" --tests "app.biblioshare.mobile.widgets.NextInProgressTest"`
Expected: PASS.

- [ ] **Step 5: Verify the test can fail for its real reason (regla «tests que no protegen»)**

Rompe temporalmente el wrap-around: cambia `(idx + 1) % items.size` por `idx + 1`. Re-corre → el test `el siguiente circular vuelve al primero` debe ponerse ROJO (IndexOutOfBounds/mismatch). Revierte.

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/widgets/ReadingRowState.kt android/app/src/test/java/app/biblioshare/mobile/widgets/ReadingRowStateTest.kt
git commit -m "feat(android): estado puro del widget de lectura 1-fila (⏭ circular + pin)"
```

---

### Task 2: Modelo puro de la notificación

Función pura que traduce la `ReadingSession` a lo que la notificación debe mostrar (¿mostrar?, corriendo vs pausado, textos/tiempos).

**Files:**
- Create: `android/app/src/main/java/app/biblioshare/mobile/reading/ReadingNotificationModel.kt`
- Test: `android/app/src/test/java/app/biblioshare/mobile/reading/ReadingNotificationModelTest.kt`

**Interfaces:**
- Consumes: `TimerLogic.Running`, `WidgetSnapshot` (existentes), `elapsedMs`/`fmtElapsed`/`isLongSession` de `WidgetTimer.kt`.
- Produces:
  - `data class ReadingNotificationModel(passId, title: String?, coverUrl: String?, running: Boolean, whenBase: Long, frozenElapsed: String?, longSession: Boolean)`
  - `fun readingNotificationModel(running: TimerLogic.Running?, snapshot: WidgetSnapshot?, now: Long): ReadingNotificationModel?`

> Nota de import: el paquete es `reading` pero reutiliza tipos de `widgets`; añade `import app.biblioshare.mobile.widgets.*` (o los imports concretos: `TimerLogic`, `WidgetSnapshot`, `elapsedMs`, `fmtElapsed`, `isLongSession`).

- [ ] **Step 1: Write the failing test**

```kotlin
// ReadingNotificationModelTest.kt
package app.biblioshare.mobile.reading

import app.biblioshare.mobile.widgets.CurrentProgressData
import app.biblioshare.mobile.widgets.TimerLogic
import app.biblioshare.mobile.widgets.WIDGET_SCHEMA_VERSION
import app.biblioshare.mobile.widgets.WidgetSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private const val NOW = 1_785_920_400_000L
private const val START = NOW - 90_000L // 1:30 corriendo

private fun item(id: String, title: String, cover: String?) = CurrentProgressData(
    passId = id, itemType = "book", itemId = "b-$id", title = title, subtitle = null,
    coverUrl = cover, percentage = 10, progressLabel = "x", deepLink = "/sesion/$id",
    nthLabel = "1.ª", contextLabel = "", streakDays = 0, week = emptyList(), kindLabel = "Libro",
)
private fun snap(vararg items: CurrentProgressData) =
    WidgetSnapshot(WIDGET_SCHEMA_VERSION, "u1", "2026-08-08T09:00:00.000Z", items.toList(), items.size, null)

private fun running(id: String, running: Boolean, startedAt: Long = START, acc: Long = 0L) =
    TimerLogic.Running(passId = id, startedAt = startedAt, firstStartedAt = startedAt, accumulatedMs = acc, running = running)

class ReadingNotificationModelTest {
    @Test fun `sin sesion no hay notificacion`() {
        assertNull(readingNotificationModel(null, snap(item("p1", "El Nombre del Viento", null)), NOW))
    }
    @Test fun `corriendo usa el ancla como base del cronometro`() {
        val m = readingNotificationModel(running("p1", true), snap(item("p1", "El Nombre del Viento", "http://c/1.jpg")), NOW)!!
        assertEquals("El Nombre del Viento", m.title)
        assertEquals("http://c/1.jpg", m.coverUrl)
        assertTrue(m.running)
        assertEquals(START, m.whenBase)
        assertNull(m.frozenElapsed)
    }
    @Test fun `pausado congela el tiempo`() {
        val m = readingNotificationModel(running("p1", running = false, acc = 90_000L), snap(item("p1", "T", null)), NOW)!!
        assertTrue(!m.running)
        assertEquals("01:30", m.frozenElapsed)
    }
    @Test fun `pase ausente del snapshot sigue siendo construible`() {
        val m = readingNotificationModel(running("fantasma", true), snap(item("p1", "T", null)), NOW)!!
        assertNull(m.title)
        assertNull(m.coverUrl)
        assertEquals("fantasma", m.passId)
    }
    @Test fun `sesion larga se marca`() {
        val fourHoursOneMin = NOW - (4L * 60 * 60 * 1000 + 60_000)
        val m = readingNotificationModel(running("p1", true, startedAt = fourHoursOneMin), snap(item("p1", "T", null)), NOW)!!
        assertTrue(m.longSession)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew testDebugUnitTest --tests "app.biblioshare.mobile.reading.ReadingNotificationModelTest"`
Expected: FAIL con «unresolved reference: readingNotificationModel».

- [ ] **Step 3: Write the implementation**

```kotlin
// ReadingNotificationModel.kt
package app.biblioshare.mobile.reading

import app.biblioshare.mobile.widgets.TimerLogic
import app.biblioshare.mobile.widgets.WidgetSnapshot
import app.biblioshare.mobile.widgets.elapsedMs
import app.biblioshare.mobile.widgets.fmtElapsed
import app.biblioshare.mobile.widgets.isLongSession

// Qué pinta la notificación de sesión, decidido FUERA del ensamblado Android
// (igual que WidgetState para los widgets): así el caso corriendo/pausado/sin
// portada/sesión larga se prueba en JVM sin service ni NotificationManager.

data class ReadingNotificationModel(
    val passId: String,
    /** Título del pase (del snapshot); null si el snapshot va rezagado y no lo tiene. */
    val title: String?,
    val coverUrl: String?,
    val running: Boolean,
    /** Corriendo: ancla wall-clock para `setWhen` + Chronometer. */
    val whenBase: Long,
    /** Pausado: tiempo congelado "MM:SS"/"H:MM:SS"; null si corre. */
    val frozenElapsed: String?,
    /** Corriendo > 4h: se invita a abrir la app en vez de tickear sin fin. */
    val longSession: Boolean,
)

fun readingNotificationModel(
    running: TimerLogic.Running?,
    snapshot: WidgetSnapshot?,
    now: Long,
): ReadingNotificationModel? {
    if (running == null) return null
    val item = snapshot?.inProgress?.firstOrNull { it.passId == running.passId }
    return ReadingNotificationModel(
        passId = running.passId,
        title = item?.title,
        coverUrl = item?.coverUrl,
        running = running.running,
        whenBase = running.startedAt,
        frozenElapsed = if (running.running) null else fmtElapsed(elapsedMs(running, now)),
        longSession = running.running && isLongSession(running.startedAt, now),
    )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd android && ./gradlew testDebugUnitTest --tests "app.biblioshare.mobile.reading.ReadingNotificationModelTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/app/biblioshare/mobile/reading/ReadingNotificationModel.kt android/app/src/test/java/app/biblioshare/mobile/reading/ReadingNotificationModelTest.kt
git commit -m "feat(android): modelo puro de la notificación de sesión de lectura"
```

---

### Task 3: Foreground service + notificación + hook de sincronización

El service ensambla la notificación desde el modelo (Task 2) y `TimerStore`. `ReadingSessionController.sync` la arranca/actualiza/para y se engancha en los mismos puntos que repintan los widgets, de modo que arrancar una sesión desde el widget «Completo» ya existente hace aparecer la notificación. (Los botones de la notificación llegan en Task 4.)

**Files:**
- Create: `android/app/src/main/java/app/biblioshare/mobile/reading/ReadingSessionService.kt`
- Create: `android/app/src/main/res/drawable/ic_stat_reading.xml`
- Modify: `android/app/src/main/res/values/strings.xml` (o el fichero de strings del módulo; ver Step)
- Modify: `android/app/src/main/AndroidManifest.xml` (permisos FGS + `<service>`)
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetActions.kt` (hook en las 5 acciones de timer)
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/BiblioshareWidgetPlugin.kt` (hook en `setRunningTimer`/`clearRunningTimer`)

**Interfaces:**
- Consumes: `readingNotificationModel` (Task 2), `TimerStore`, `WidgetSnapshotStore`, `WidgetImageCache`, `WidgetDeepLinks`.
- Produces:
  - `object ReadingSessionController { fun sync(context: Context) }`
  - `class ReadingSessionService : Service` con `companion { const NOTIF_ID; const CHANNEL_ID; const ACTION_SYNC }`

> Este task no tiene test JVM (es ensamblado Android). Verificación = build + dispositivo, igual que los composables de widget hoy.

- [ ] **Step 1: Add the notification small icon (vector monocromo)**

`ic_stat_reading.xml` — glifo blanco sobre transparente (los iconos de status bar deben ser monocromos; el color lo pone el sistema). Un libro abierto simple:

```xml
<!-- android/app/src/main/res/drawable/ic_stat_reading.xml -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24"
    android:tint="#FFFFFF">
  <path android:fillColor="#FFFFFF"
    android:pathData="M12,6.5C10.5,5.5 8.5,5 6.5,5C5.3,5 4.1,5.2 3,5.6L3,18.1C4.1,17.7 5.3,17.5 6.5,17.5C8.5,17.5 10.5,18 12,19C13.5,18 15.5,17.5 17.5,17.5C18.7,17.5 19.9,17.7 21,18.1L21,5.6C19.9,5.2 18.7,5 17.5,5C15.5,5 13.5,5.5 12,6.5ZM12,8.2C13.3,7.5 15.1,7 17.5,7C18,7 18.5,7 19,7.1L19,15.6C18.5,15.5 18,15.5 17.5,15.5C15.1,15.5 13.3,16 12,16.7Z"/>
</vector>
```

- [ ] **Step 2: Add strings**

Comprueba dónde viven los strings del módulo (`grep -rl "widget_pause" android/app/src/main/res/values*`) y añade en ese `strings.xml`:

```xml
<string name="reading_channel_name">Sesión de lectura</string>
<string name="reading_notification_default_title">Sesión de lectura</string>
<string name="reading_notification_reading">Leyendo…</string>
<string name="reading_notification_paused">En pausa · %1$s</string>
<string name="reading_notification_long">Sesión larga · toca para registrar</string>
```

(Reutiliza los ya existentes `widget_pause`, `widget_resume`, `widget_register`, `widget_discard` para las etiquetas de las acciones — no crear duplicados.)

- [ ] **Step 3: Write the service + controller**

```kotlin
// ReadingSessionService.kt
package app.biblioshare.mobile.reading

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import app.biblioshare.mobile.R
import app.biblioshare.mobile.widgets.TimerStore
import app.biblioshare.mobile.widgets.WidgetDeepLinks
import app.biblioshare.mobile.widgets.WidgetImageCache
import app.biblioshare.mobile.widgets.WidgetSnapshotStore
import android.app.PendingIntent

// Arranca/actualiza/para la notificación de sesión. NO guarda estado: en cada
// sync lee TimerStore (la única fuente de verdad) + el snapshot para el título
// y la portada. El reloj lo tickea el sistema (setUsesChronometer), no un
// proceso vivo — igual que el Chronometer del widget.
object ReadingSessionController {
    fun sync(context: Context) {
        val intent = Intent(context, ReadingSessionService::class.java)
            .setAction(ReadingSessionService.ACTION_SYNC)
        if (TimerStore.get(context) != null) {
            // Exención de arranque de FGS en background: "el usuario interactúa
            // con un widget" (los puntos de arranque son StartTimerAction y el
            // espejo setRunningTimer en primer plano).
            ContextCompat.startForegroundService(context, intent)
        } else {
            context.stopService(intent)
        }
    }
}

class ReadingSessionService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val running = TimerStore.get(this)
        val snapshot = WidgetSnapshotStore.load(this)
        val model = readingNotificationModel(running, snapshot, System.currentTimeMillis())
        if (model == null) {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        ensureChannel(this)
        // Sin portada primero para no rebasar el plazo de startForeground; se
        // recarga en un hilo y se re-notifica con largeIcon.
        startForeground(NOTIF_ID, buildNotification(this, model, cover = null))
        loadCoverAndRefresh(model)
        return START_STICKY
    }

    private fun loadCoverAndRefresh(model: ReadingNotificationModel) {
        val url = model.coverUrl ?: return
        Thread {
            WidgetImageCache.ensureDownloaded(this, url)
            val cover = WidgetImageCache.loadBitmap(this, url) ?: return@Thread
            if (TimerStore.get(this) == null) return@Thread // la sesión ya acabó
            // La MISMA notificación (NOTIF_ID) con la portada. En 33+ requiere
            // POST_NOTIFICATIONS; si falta, la notif del FGS ya está puesta y
            // esto solo la enriquece — se ignora el fallo.
            runCatching { NotificationManagerCompat.from(this).notify(NOTIF_ID, buildNotification(this, model, cover)) }
        }.start()
    }

    companion object {
        const val ACTION_SYNC = "app.biblioshare.mobile.reading.SYNC"
        const val NOTIF_ID = 4820
        const val CHANNEL_ID = "reading_session"

        fun ensureChannel(context: Context) {
            val mgr = context.getSystemService(NotificationManager::class.java)
            if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
                mgr.createNotificationChannel(
                    NotificationChannel(
                        CHANNEL_ID,
                        context.getString(R.string.reading_channel_name),
                        NotificationManager.IMPORTANCE_LOW,
                    ).apply { setShowBadge(false) },
                )
            }
        }

        // Task 4 rellena addActions(); aquí queda vacío para que Task 3 compile
        // y la notificación se vea (sin botones todavía).
        fun buildNotification(context: Context, model: ReadingNotificationModel, cover: Bitmap?): android.app.Notification {
            val title = model.title ?: context.getString(R.string.reading_notification_default_title)
            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_reading)
                .setContentTitle(title)
                .setOngoing(true)
                .setSilent(true)
                .setOnlyAlertOnce(true)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setContentIntent(openSession(context, model.passId))
            if (cover != null) builder.setLargeIcon(cover)
            when {
                model.running && !model.longSession ->
                    builder.setUsesChronometer(true).setWhen(model.whenBase).setShowWhen(true)
                        .setContentText(context.getString(R.string.reading_notification_reading))
                !model.running ->
                    builder.setShowWhen(false)
                        .setContentText(context.getString(R.string.reading_notification_paused, model.frozenElapsed))
                else ->
                    builder.setShowWhen(false)
                        .setContentText(context.getString(R.string.reading_notification_long))
            }
            addActions(context, builder, model) // no-op hasta Task 4
            return builder.build()
        }

        // Sustituido en Task 4.
        internal fun addActions(context: Context, builder: NotificationCompat.Builder, model: ReadingNotificationModel) {}

        private fun openSession(context: Context, passId: String): PendingIntent =
            PendingIntent.getActivity(
                context, ("open$passId").hashCode(),
                WidgetDeepLinks.intentFor(context, "/sesion/$passId"),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
    }
}
```

- [ ] **Step 4: Wire the manifest (permissions + service)**

En `AndroidManifest.xml`, junto a los demás `uses-permission`:

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
```

Dentro de `<application>`, junto a los `<receiver>` de widgets:

```xml
<service
    android:name=".reading.ReadingSessionService"
    android:exported="false"
    android:foregroundServiceType="specialUse">
    <property
        android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
        android:value="Cronómetro de la sesión de lectura activa, visible para el usuario" />
</service>
```

- [ ] **Step 5: Hook `sync` into the timer mutations**

En `WidgetActions.kt`, añade `ReadingSessionController.sync(c)` (import `app.biblioshare.mobile.reading.ReadingSessionController`) **después de cada mutación de `TimerStore`** y antes/junto al `refreshWidgets`, en: `StartTimerAction`, `PauseTimerAction`, `ResumeTimerAction`, `DiscardTimerAction`, `RegisterTimerAction`. Ejemplo (StartTimer):

```kotlin
class StartTimerAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        val passId = p[PASS_ID_PARAM] ?: return
        TimerStore.start(c, passId, System.currentTimeMillis())
        ReadingSessionController.sync(c)   // ← nuevo
        refreshWidgets(c, "StartTimer")
    }
}
```

En `BiblioshareWidgetPlugin.kt`, dentro de `setRunningTimer` (tras `TimerStore.set(...)`) y `clearRunningTimer` (tras `TimerStore.clear(...)`), añade `ReadingSessionController.sync(context)` junto al `WidgetRefresh.updateAll(context)`.

- [ ] **Step 6: Build + device verification**

```bash
npx cap sync android
cd android && ./gradlew assembleDebug
```
Instala el APK debug. En dispositivo:
1. Añade el widget «Completo». Con un libro en curso, pulsa «Sesión» (▶) → **aparece la notificación** con título/portada y el cronómetro **tickeando** (baja la barra de estado; sal de la app: sigue).
2. Pulsa «Descartar» en el widget → la notificación **desaparece**.

(Los botones de la notificación aún no hacen nada; eso es Task 4.)

- [ ] **Step 7: Commit** (recuerda revertir los gradle de cap-sync antes)

```bash
git checkout -- android/app/capacitor.build.gradle android/capacitor.settings.gradle
git add android/app/src/main/java/app/biblioshare/mobile/reading/ReadingSessionService.kt \
        android/app/src/main/res/drawable/ic_stat_reading.xml \
        android/app/src/main/res/values/strings.xml \
        android/app/src/main/AndroidManifest.xml \
        android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetActions.kt \
        android/app/src/main/java/app/biblioshare/mobile/widgets/BiblioshareWidgetPlugin.kt
git commit -m "feat(android): foreground service + notificación de sesión que espeja TimerStore"
```

---

### Task 4: Acciones de la notificación (⏸/▶/■/Descartar)

Un `BroadcastReceiver` que ejecuta las mismas operaciones que los botones del widget, más el handoff de Terminar. Rellena `addActions` de Task 3.

**Files:**
- Create: `android/app/src/main/java/app/biblioshare/mobile/reading/ReadingSessionReceiver.kt`
- Modify: `android/app/src/main/java/app/biblioshare/mobile/reading/ReadingSessionService.kt` (`addActions` real)
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetActions.kt` (extraer `registerHref` y reutilizarlo en `RegisterTimerAction`)
- Modify: `android/app/src/main/AndroidManifest.xml` (`<receiver>`)

**Interfaces:**
- Consumes: `TimerStore`, `elapsedMinutes`/`elapsedMs` (WidgetTimer), `WidgetDeepLinks`, `WidgetRefresh`, `ReadingSessionController`.
- Produces: `class ReadingSessionReceiver : BroadcastReceiver` con `companion { ACTION_PAUSE, ACTION_RESUME, ACTION_FINISH, ACTION_DISCARD }`; y `fun registerHref(r: TimerLogic.Running, now: Long): String` (top-level en `WidgetActions.kt`).

> Sin test JVM (ensamblado Android + reutiliza pura ya probada). Verificación = dispositivo.

- [ ] **Step 1: Extract `registerHref` in WidgetActions.kt and reuse it in RegisterTimerAction**

```kotlin
// WidgetActions.kt — top-level, junto a itemLogHref (que está en WidgetUi.kt; este va aquí)
/** Deep-link de registro con los minutos del elapsed REAL y la hora real de inicio. */
fun registerHref(r: TimerLogic.Running, now: Long): String {
    val minutos = elapsedMinutes(elapsedMs(r, now))
    val inicio = java.time.Instant.ofEpochMilli(r.firstStartedAt).toString()
    return "/sesion/${r.passId}?minutos=$minutos&inicio=$inicio"
}
```
Y en `RegisterTimerAction.onAction`, sustituye el cálculo inline por:
```kotlin
val r = TimerStore.get(c) ?: return
val href = registerHref(r, System.currentTimeMillis())
TimerStore.clearFromWidget(c)
ReadingSessionController.sync(c)
refreshWidgets(c, "RegisterTimer")
c.startActivity(WidgetDeepLinks.intentFor(c, href))
```

- [ ] **Step 2: Write the receiver**

```kotlin
// ReadingSessionReceiver.kt
package app.biblioshare.mobile.reading

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import app.biblioshare.mobile.widgets.TimerStore
import app.biblioshare.mobile.widgets.WidgetDeepLinks
import app.biblioshare.mobile.widgets.WidgetRefresh
import app.biblioshare.mobile.widgets.registerHref

// Botones de la notificación de sesión. Mismas operaciones que los del widget
// (TimerStore), y Terminar reusa el MISMO handoff que RegisterTimerAction:
// abre /sesion/:passId prerrellenado y addSession hace el resto. clearFromWidget
// (no clear) deja la lápida para que la app apague su reloj sembrado (#493).
class ReadingSessionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val now = System.currentTimeMillis()
        when (intent.action) {
            ACTION_PAUSE -> TimerStore.pause(context, now)
            ACTION_RESUME -> TimerStore.resume(context, now)
            ACTION_DISCARD -> TimerStore.clearFromWidget(context)
            ACTION_FINISH -> {
                val r = TimerStore.get(context) ?: return
                val href = registerHref(r, now)
                TimerStore.clearFromWidget(context)
                context.startActivity(WidgetDeepLinks.intentFor(context, href))
            }
            else -> return
        }
        ReadingSessionController.sync(context)   // pausa/reanuda → re-notifica; discard/finish → para el service
        WidgetRefresh.updateAll(context)         // el widget vuelve a selector/refleja la pausa
    }

    companion object {
        const val ACTION_PAUSE = "app.biblioshare.mobile.reading.PAUSE"
        const val ACTION_RESUME = "app.biblioshare.mobile.reading.RESUME"
        const val ACTION_FINISH = "app.biblioshare.mobile.reading.FINISH"
        const val ACTION_DISCARD = "app.biblioshare.mobile.reading.DISCARD"
    }
}
```

- [ ] **Step 3: Fill `addActions` in ReadingSessionService.kt**

Sustituye el `addActions` vacío por (añade imports `android.app.PendingIntent`, `android.content.Intent`):

```kotlin
internal fun addActions(context: Context, builder: NotificationCompat.Builder, model: ReadingNotificationModel) {
    val toggle = if (model.running) {
        context.getString(R.string.widget_pause) to ReadingSessionReceiver.ACTION_PAUSE
    } else {
        context.getString(R.string.widget_resume) to ReadingSessionReceiver.ACTION_RESUME
    }
    builder.addAction(0, toggle.first, broadcast(context, toggle.second))
    builder.addAction(0, context.getString(R.string.widget_register), broadcast(context, ReadingSessionReceiver.ACTION_FINISH))
    builder.addAction(0, context.getString(R.string.widget_discard), broadcast(context, ReadingSessionReceiver.ACTION_DISCARD))
}

private fun broadcast(context: Context, action: String): PendingIntent =
    PendingIntent.getBroadcast(
        context, action.hashCode(),
        Intent(context, ReadingSessionReceiver::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
```

- [ ] **Step 4: Register the receiver in the manifest**

Dentro de `<application>`:
```xml
<receiver android:name=".reading.ReadingSessionReceiver" android:exported="false" />
```

- [ ] **Step 5: Build + device verification**

```bash
npx cap sync android && cd android && ./gradlew assembleDebug
```
En dispositivo, con una sesión activa y la notificación abierta:
1. `⏸` → el cronómetro se **congela** y el botón pasa a `▶ Reanudar`; el widget refleja la pausa.
2. `▶` → reanuda desde donde estaba (no salta ni pierde tiempo).
3. `■ Registrar` → abre `/sesion/:passId` prerrellenado con minutos+inicio; la notificación desaparece; al guardar, el widget vuelve a selector.
4. `Descartar` → notificación fuera sin abrir la app; el widget vuelve a selector.

- [ ] **Step 6: Commit** (revierte los gradle de cap-sync antes)

```bash
git checkout -- android/app/capacitor.build.gradle android/capacitor.settings.gradle
git add android/app/src/main/java/app/biblioshare/mobile/reading/ReadingSessionReceiver.kt \
        android/app/src/main/java/app/biblioshare/mobile/reading/ReadingSessionService.kt \
        android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetActions.kt \
        android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): acciones de la notificación de sesión (pausa/reanuda/terminar/descartar)"
```

---

### Task 5: Widget compacto de 1 fila (`ReadingRowWidget`, 4x1)

El widget nuevo. Modo selector (▶ / ⏭) y modo sesión (cronómetro + ⏸/▶ + ■), fijándose al pase en curso, reutilizando `readingRowState` (Task 1), las acciones de timer existentes y las piezas de `WidgetUi.kt`. Añade la `CycleFocusAction` del ⏭.

**Files:**
- Create: `android/app/src/main/java/app/biblioshare/mobile/widgets/ReadingRowWidget.kt`
- Create: `android/app/src/main/res/xml/reading_row_widget_info.xml`
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetActions.kt` (`CycleFocusAction` + `ROW_SELECTED_PASS_KEY`)
- Modify: `android/app/src/main/java/app/biblioshare/mobile/widgets/BiblioshareWidgetPlugin.kt` (`ReadingRowWidget` en `updateAllSuspend`)
- Modify: `android/app/src/main/res/values/strings.xml` (descripción del widget) + `AndroidManifest.xml` (`<receiver>`)

**Interfaces:**
- Consumes: `readingRowState`, `ReadingRowState`, `nextInProgress` (Task 1); `TimerStore`, `WidgetSnapshotStore`, `loadCovers`, `Cover`, `SoftBar` (WidgetUi), acciones de timer.
- Produces: `class ReadingRowWidget : GlanceAppWidget`, `class ReadingRowWidgetReceiver : GlanceAppWidgetReceiver`, `class CycleFocusAction : ActionCallback`, `val ROW_SELECTED_PASS_KEY`.

> Sin test JVM (la lógica ya está probada en Task 1; esto es composición Glance). Verificación = dispositivo.

- [ ] **Step 1: Add `ROW_SELECTED_PASS_KEY` + `CycleFocusAction` in WidgetActions.kt**

```kotlin
// Selección propia del widget 1-fila, independiente de SELECTED_PASS_KEY (widget
// grande): cada uno recuerda su destacado por separado.
val ROW_SELECTED_PASS_KEY = stringPreferencesKey("row_selected_pass_id")

/** ⏭ "siguiente canción": rota circular por los in_progress y persiste. */
class CycleFocusAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val snapshot = WidgetSnapshotStore.load(context)
        val items = snapshot?.inProgress.orEmpty()
        if (items.isEmpty()) return
        val current = getAppWidgetState(context, PreferencesGlanceStateDefinition, glanceId)[ROW_SELECTED_PASS_KEY]
        val next = nextInProgress(items, current) ?: return
        updateAppWidgetState(context, glanceId) { it[ROW_SELECTED_PASS_KEY] = next }
        refreshWidgets(context, "CycleFocus")
    }
}
```
(Imports que faltarán en ese fichero: `androidx.glance.appwidget.state.getAppWidgetState`, `androidx.glance.state.PreferencesGlanceStateDefinition`.)

- [ ] **Step 2: Add the provider XML**

```xml
<!-- android/app/src/main/res/xml/reading_row_widget_info.xml -->
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="40dp"
    android:minResizeWidth="180dp"
    android:minResizeHeight="40dp"
    android:targetCellWidth="4"
    android:targetCellHeight="1"
    android:maxResizeWidth="380dp"
    android:maxResizeHeight="80dp"
    android:resizeMode="horizontal"
    android:widgetCategory="home_screen"
    android:updatePeriodMillis="3600000"
    android:initialLayout="@layout/glance_default_loading_layout"
    android:description="@string/reading_row_widget_desc" />
```
Y en strings: `<string name="reading_row_widget_desc">Sesión de lectura en una fila</string>`.

- [ ] **Step 3: Write the widget composable**

```kotlin
// ReadingRowWidget.kt
package app.biblioshare.mobile.widgets

import android.content.Context
import android.graphics.Bitmap
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.background
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.Text
import app.biblioshare.mobile.R

// Widget de 1 fila (4x1): la sesión de lectura de un vistazo. Sin sesión, un
// pase en curso con ▶ para empezar y ⏭ para rotar entre varios; con sesión, se
// fija al pase en curso, oculta ⏭ y muestra cronómetro + ⏸/▶ + ■. Reutiliza
// readingRowState (probado en JVM) y las MISMAS acciones que el widget grande.
class ReadingRowWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetSnapshotStore.load(context)
        val selected = getAppWidgetState(context, PreferencesGlanceStateDefinition, id)[ROW_SELECTED_PASS_KEY]
        val running = TimerStore.get(context)
        val state = readingRowState(snapshot, selected, running)
        val covers = loadCovers(context, snapshot)
        provideContent { ReadingRowContent(state, covers) }
    }
}

class ReadingRowWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ReadingRowWidget()
}

@Composable
fun ReadingRowContent(state: ReadingRowState, covers: Map<String, Bitmap?>) {
    when (state) {
        ReadingRowState.Empty -> WidgetCard("/coleccion") {
            Box(GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(LocalContext.current.getString(R.string.widget_open_to_start), style = softStyle(), maxLines = 1)
            }
        }
        is ReadingRowState.Selector -> RowSurface { SelectorRow(state, covers) }
        is ReadingRowState.Session -> RowSurface { SessionRow(state, covers) }
    }
}

// Superficie de la fila: MISMO fondo Paper que WidgetSurface (sin él, el widget
// sale transparente — lección #498) pero con padding ajustado a 40-60dp de alto
// (el 12dp de WidgetSurface, pensado para el 4x3, aplasta una fila). Calibrar el
// vertical en dispositivo: la portada de 42dp debe caber sin recorte.
@Composable
private fun RowSurface(content: @Composable () -> Unit) {
    Box(
        modifier = GlanceModifier.fillMaxSize()
            .background(androidx.glance.ImageProvider(R.drawable.widget_background))
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) { content() }
}

@Composable
private fun SelectorRow(state: ReadingRowState.Selector, covers: Map<String, Bitmap?>) {
    val d = state.featured
    Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
        Cover(d.coverUrl?.let(covers::get), width = 28, height = 42)
        Spacer(GlanceModifier.width(8.dp))
        androidx.glance.layout.Column(GlanceModifier.defaultWeight()) {
            Text(d.title, style = titleStyle(), maxLines = 1)
            SoftBar(d.percentage ?: 0, heightDp = 3)
        }
        if (d.itemType == "book") {
            Spacer(GlanceModifier.width(8.dp))
            IconButton("▶", actionRunCallback<StartTimerAction>(actionParametersOf(PASS_ID_PARAM to d.passId)))
        }
        if (state.hasOthers) {
            Spacer(GlanceModifier.width(4.dp))
            IconButton("⏭", actionRunCallback<CycleFocusAction>())
        }
    }
}

@Composable
private fun SessionRow(state: ReadingRowState.Session, covers: Map<String, Bitmap?>) {
    val ctx = LocalContext.current
    val d = state.featured
    val r = state.running
    val now = System.currentTimeMillis()
    Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
        Cover(d.coverUrl?.let(covers::get), width = 28, height = 42)
        Spacer(GlanceModifier.width(8.dp))
        androidx.glance.layout.Column(GlanceModifier.defaultWeight()) {
            Text(d.title, style = softStyle(), maxLines = 1)
            if (r.running) {
                val rv = RemoteViews(ctx.packageName, R.layout.widget_chronometer).apply {
                    setChronometer(R.id.widget_chrono, chronometerBase(r.startedAt, now, SystemClock.elapsedRealtime()), null, true)
                }
                AndroidRemoteViews(rv, GlanceModifier.fillMaxWidth())
            } else {
                val rv = RemoteViews(ctx.packageName, R.layout.widget_static_time).apply {
                    setTextViewText(R.id.widget_static_time, fmtElapsed(elapsedMs(r, now)))
                }
                AndroidRemoteViews(rv, GlanceModifier.fillMaxWidth())
            }
        }
        Spacer(GlanceModifier.width(8.dp))
        val toggle = if (r.running) actionRunCallback<PauseTimerAction>() else actionRunCallback<ResumeTimerAction>()
        IconButton(if (r.running) "⏸" else "▶", toggle)
        Spacer(GlanceModifier.width(4.dp))
        IconButton("■", actionRunCallback<RegisterTimerAction>())
    }
}

@Composable
private fun IconButton(glyph: String, action: androidx.glance.action.Action) {
    Box(
        modifier = GlanceModifier.clickable(action).padding(horizontal = 8.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) { Text(glyph, style = accentStyle()) }
}
```

> Nota: `▶` arranca el timer nativo sin abrir la app (`StartTimerAction`), y por el hook de Task 3 aparece la notificación. `■` usa `RegisterTimerAction` (abre la hoja). Series: sin `▶` (no tienen sesión de tiempo), coherente con `SessionTimerView`.

- [ ] **Step 4: Register the widget in `updateAllSuspend` and the manifest**

En `BiblioshareWidgetPlugin.kt`, dentro de `updateAllSuspend`, añade una línea más:
```kotlin
push(context, glanceManager, appWidgetManager, ReadingRowWidget(), ReadingRowWidget::class.java, "row")
```
En `AndroidManifest.xml`, junto a los otros receivers de widget:
```xml
<receiver
    android:name=".widgets.ReadingRowWidgetReceiver"
    android:label="@string/reading_row_widget_desc"
    android:exported="false">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
    </intent-filter>
    <meta-data
        android:name="android.appwidget.provider"
        android:resource="@xml/reading_row_widget_info" />
</receiver>
```

- [ ] **Step 5: Build + device verification (checklist completa del §9 de la spec)**

```bash
npx cap sync android && cd android && ./gradlew assembleDebug
```
En dispositivo, añade el widget «Sesión de lectura en una fila» y comprueba:
1. Sin sesión, 1 `in_progress` → fila con portada + título + progreso + `▶`, **sin** `⏭`.
2. Sin sesión, ≥2 `in_progress` → aparece `⏭`; púlsalo → rota circular y **recuerda** la selección tras cerrar/reabrir el cajón de apps.
3. `▶` con la app cerrada → arranca el timer + aparece la notificación; la fila pasa a modo sesión, **fijada** al pase en curso, y `⏭` desaparece.
4. Cronómetro tickea; `⏸` congela; `▶` reanuda (widget y notificación coherentes).
5. `■` → abre `/sesion/:passId` prerrellenado; al guardar, la fila vuelve a selector y `⏭` reaparece si siguen ≥2 en curso.

- [ ] **Step 6: Commit** (revierte los gradle de cap-sync antes)

```bash
git checkout -- android/app/capacitor.build.gradle android/capacitor.settings.gradle
git add android/app/src/main/java/app/biblioshare/mobile/widgets/ReadingRowWidget.kt \
        android/app/src/main/res/xml/reading_row_widget_info.xml \
        android/app/src/main/java/app/biblioshare/mobile/widgets/WidgetActions.kt \
        android/app/src/main/java/app/biblioshare/mobile/widgets/BiblioshareWidgetPlugin.kt \
        android/app/src/main/res/values/strings.xml \
        android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): widget de lectura de 1 fila (selector ⏭ + modo sesión)"
```

---

### Task 6: Cierre documental + issue de seguimiento

Cerrar según la «definición de hecho» de `AGENTS.md`.

**Files:**
- Modify: `docs/requirements/decisiones.md` (append-only)
- Modify: `docs/requirements/backlog.md` si el widget/notif estaba listado
- (Comando `gh` para la issue)

- [ ] **Step 1: Append a decision entry** al final de `docs/requirements/decisiones.md`:

> **2026-08-08 · Sesión de lectura nativa (notif + widget 1-fila).** `■ Terminar` reusa el handoff `addSession` (no escritura nativa silenciosa: duplicaría progreso/racha/celebraciones/auto-cierre). La notificación va por **foreground service** `specialUse` (no notif *ongoing* pelada) por robustez en OEM agresivos (One UI). Sesión pausada mantiene el FGS vivo (coste ~0). Cero migraciones, cero cambios web.

- [ ] **Step 2: Open the tracking issue** (etiquetas obligatorias, una de cada dimensión):

```bash
gh issue create --label "area:infra,tipo:feature,P2" \
  --title "Sesión de lectura nativa: notificación persistente + widget 1-fila" \
  --body "Implementado sobre #497/#498. Spec: docs/superpowers/specs/2026-08-08-sesion-lectura-nativa-notif-widget-fila-design.md · Plan: docs/superpowers/plans/2026-08-08-sesion-lectura-nativa-notif-widget-fila.md. Pendiente de verificación en dispositivo y de release (APK firmado, tag vX.Y)."
```

- [ ] **Step 3: Commit**

```bash
git add docs/requirements/decisiones.md docs/requirements/backlog.md
git commit -m "docs(android): decisión + cierre de la sesión de lectura nativa"
```

---

## Notas de verificación transversales

- La suite JVM completa del módulo: `cd android && ./gradlew testDebugUnitTest`. No debe romper ningún test existente (`TimerStoreTest`, `WidgetTimerTest`, `WidgetStateTest`, `WidgetSnapshotTest`).
- La verificación real de notificación + FGS + widget es **en dispositivo**: los emuladores no reproducen bien el barrido de notificaciones de One UI (razón de elegir FGS). Prueba en el móvil del dueño con un APK debug.
- Trampas de build en worktree (memoria «Widgets Android»): `npx cap sync android` antes de compilar, `local.properties` + `JAVA_HOME` al JBR, y revertir los gradle regenerados antes de commitear.
