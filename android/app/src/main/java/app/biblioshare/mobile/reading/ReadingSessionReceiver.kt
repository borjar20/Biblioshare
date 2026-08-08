// ReadingSessionReceiver.kt
package app.biblioshare.mobile.reading

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import app.biblioshare.mobile.widgets.TimerStore
import app.biblioshare.mobile.widgets.WidgetRefresh

// Botones de la notificación de sesión. Mismas operaciones que los del widget
// (TimerStore). Terminar/■ NO pasa por aquí: es un activity PendingIntent
// directo (ReadingSessionService.finishActivity + MainActivity), porque un
// broadcast que abre una Activity es un trampolín de notificación (bloqueado
// en targetSdk 31+). clearFromWidget (no clear) deja la lápida para que la
// app apague su reloj sembrado (#493).
class ReadingSessionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val now = System.currentTimeMillis()
        when (intent.action) {
            ACTION_PAUSE -> TimerStore.pause(context, now)
            ACTION_RESUME -> TimerStore.resume(context, now)
            ACTION_DISCARD -> TimerStore.clearFromWidget(context)
            else -> return
        }
        ReadingSessionController.sync(context)   // pausa/reanuda → re-notifica; discard → para el service
        WidgetRefresh.updateAll(context)         // el widget vuelve a selector/refleja la pausa
    }

    companion object {
        const val ACTION_PAUSE = "app.biblioshare.mobile.reading.PAUSE"
        const val ACTION_RESUME = "app.biblioshare.mobile.reading.RESUME"
        const val ACTION_DISCARD = "app.biblioshare.mobile.reading.DISCARD"
    }
}
