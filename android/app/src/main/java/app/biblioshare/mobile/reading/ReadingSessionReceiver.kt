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
