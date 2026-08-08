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
