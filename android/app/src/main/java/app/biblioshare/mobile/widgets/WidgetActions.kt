package app.biblioshare.mobile.widgets

import android.content.Context
import android.util.Log
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.appwidget.updateAll
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager

// Estado del widget (Preferences DataStore de Glance): qué pase decidió el
// usuario destacar tocando la rejilla "Continúa donde lo dejaste". Se lee en
// CurrentProgressWidget.provideGlance y se escribe aquí.
val SELECTED_PASS_KEY = stringPreferencesKey("selected_pass_id")
val PASS_ID_PARAM = ActionParameters.Key<String>("passId")

private const val WIDGET_LOG_TAG = "BiblioshareWidgets"

/** Refresca AMBOS widgets vía updateAll (el camino fiable, el del foreground).
 *  Independiente (runCatching): un fallo en uno no impide el otro. Loggea para
 *  diagnosticar el repintado intermitente (logcat -s BiblioshareWidgets). */
private suspend fun refreshWidgets(context: Context, from: String) {
    Log.i(WIDGET_LOG_TAG, "action '$from' fired → refreshWidgets")
    val current = runCatching { CurrentProgressWidget().updateAll(context) }
    val quick = runCatching { QuickRegisterWidget().updateAll(context) }
    Log.i(
        WIDGET_LOG_TAG,
        "refreshWidgets('$from') done: current=${current.isSuccess} quick=${quick.isSuccess}" +
            (current.exceptionOrNull()?.let { " currentErr=$it" } ?: "") +
            (quick.exceptionOrNull()?.let { " quickErr=$it" } ?: ""),
    )
    // Respaldo fiable: expedited corre en un estado de proceso que One UI honra.
    // REPLACE: toques rápidos no apilan workers. RUN_AS_NON_EXPEDITED: si se agota
    // la cuota de expedited, cae a trabajo normal (sin crash ni notificación forzada).
    val req = OneTimeWorkRequestBuilder<WidgetRepaintWorker>()
        .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        .build()
    WorkManager.getInstance(context).enqueueUniqueWork("widget_repaint", ExistingWorkPolicy.REPLACE, req)
    Log.i(WIDGET_LOG_TAG, "refreshWidgets('$from') direct done + expedited enqueued")
}

/** Tap en una portada de la rejilla: persiste el pase elegido y repinta. */
class SelectFocusAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val passId = parameters[PASS_ID_PARAM] ?: return
        updateAppWidgetState(context, glanceId) { it[SELECTED_PASS_KEY] = passId }
        refreshWidgets(context, "SelectFocus")
    }
}

// Estado del widget de "Registro rápido" (2 pasos): en qué paso está y qué
// pase eligió en el paso 1. Se lee en QuickRegisterWidget.provideGlance y se
// escribe en las 2 acciones de abajo. El paso 2 ya no fija minutos por chip:
// pinta la misma vista de sesión (cronómetro) que el Completo (#498).
val STEP_KEY = intPreferencesKey("qr_step")
val QR_SELECTED_KEY = stringPreferencesKey("qr_selected")

/** Paso 1 → 2: elige el pase. */
class PickAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val passId = parameters[PASS_ID_PARAM] ?: return
        updateAppWidgetState(context, glanceId) {
            it[QR_SELECTED_KEY] = passId
            it[STEP_KEY] = 2
        }
        refreshWidgets(context, "Pick")
    }
}

/** Paso 2 → 1: vuelve a elegir sin perder el resto del estado. */
class BackAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        updateAppWidgetState(context, glanceId) { it[STEP_KEY] = 1 }
        refreshWidgets(context, "Back")
    }
}

// Acciones del cronómetro nativo del widget "Progreso actual": arrancar y
// descartar solo tocan TimerStore (Task 14) y repintan sin abrir la app;
// registrar sí abre la app, prerrellenada con los minutos y el inicio.
class StartTimerAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        val passId = p[PASS_ID_PARAM] ?: return
        val now = System.currentTimeMillis()
        // Arranque limpio desde el widget: sin pausas, ancla e inicio coinciden.
        TimerStore.set(c, passId, now, now)
        refreshWidgets(c, "StartTimer")
    }
}
class DiscardTimerAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        // clearFromWidget (no clear) deja la lápida para que la app apague su
        // propio reloj sembrado al reabrir (#493).
        TimerStore.clearFromWidget(c)
        refreshWidgets(c, "DiscardTimer")
    }
}
class RegisterTimerAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        val r = TimerStore.get(c) ?: return
        // Minutos desde el ancla efectiva (ya sin pausas, #491); `inicio` es la
        // hora real de arranque para "Cuándo lees".
        val minutos = elapsedMinutes(r.startedAt, System.currentTimeMillis())
        val inicio = java.time.Instant.ofEpochMilli(r.firstStartedAt).toString()
        TimerStore.clearFromWidget(c)
        refreshWidgets(c, "RegisterTimer")
        val href = "/sesion/${r.passId}?minutos=$minutos&inicio=$inicio"
        c.startActivity(WidgetDeepLinks.intentFor(c, href))
    }
}
