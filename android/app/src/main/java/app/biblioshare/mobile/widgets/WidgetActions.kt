package app.biblioshare.mobile.widgets

import android.content.Context
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.appwidget.updateAll

// Estado del widget (Preferences DataStore de Glance): qué pase decidió el
// usuario destacar tocando la rejilla "Continúa donde lo dejaste". Se lee en
// CurrentProgressWidget.provideGlance y se escribe aquí.
val SELECTED_PASS_KEY = stringPreferencesKey("selected_pass_id")
val PASS_ID_PARAM = ActionParameters.Key<String>("passId")

/** Refresca AMBOS widgets vía updateAll (el camino fiable, el mismo del foreground).
 *  El estado de cronómetro y el snapshot son compartidos, así que refrescar los dos
 *  es correcto; updateAll solo recompone RemoteViews del store local (sin red). */
private suspend fun refreshWidgets(context: Context) {
    CurrentProgressWidget().updateAll(context)
    QuickRegisterWidget().updateAll(context)
}

/** Tap en una portada de la rejilla: persiste el pase elegido y repinta. */
class SelectFocusAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val passId = parameters[PASS_ID_PARAM] ?: return
        updateAppWidgetState(context, glanceId) { it[SELECTED_PASS_KEY] = passId }
        refreshWidgets(context)
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
        refreshWidgets(context)
    }
}

/** Paso 2 → 1: vuelve a elegir sin perder el resto del estado. */
class BackAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        updateAppWidgetState(context, glanceId) { it[STEP_KEY] = 1 }
        refreshWidgets(context)
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
        refreshWidgets(c)
    }
}
class DiscardTimerAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        // clearFromWidget (no clear) deja la lápida para que la app apague su
        // propio reloj sembrado al reabrir (#493).
        TimerStore.clearFromWidget(c)
        refreshWidgets(c)
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
        refreshWidgets(c)
        val href = "/sesion/${r.passId}?minutos=$minutos&inicio=$inicio"
        c.startActivity(WidgetDeepLinks.intentFor(c, href))
    }
}
