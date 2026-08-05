package app.biblioshare.mobile.widgets

import android.content.Context
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.state.updateAppWidgetState

// Estado del widget (Preferences DataStore de Glance): qué pase decidió el
// usuario destacar tocando la rejilla "Continúa donde lo dejaste". Se lee en
// CurrentProgressWidget.provideGlance y se escribe aquí.
val SELECTED_PASS_KEY = stringPreferencesKey("selected_pass_id")
val PASS_ID_PARAM = ActionParameters.Key<String>("passId")

/** Tap en una portada de la rejilla: persiste el pase elegido y repinta. */
class SelectFocusAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val passId = parameters[PASS_ID_PARAM] ?: return
        updateAppWidgetState(context, glanceId) { it[SELECTED_PASS_KEY] = passId }
        CurrentProgressWidget().update(context, glanceId)
    }
}

// Estado del widget de "Registro rápido" (2 pasos): en qué paso está, qué pase
// eligió en el paso 1 y qué minutos lleva marcados en el paso 2. Se lee en
// QuickRegisterWidget.provideGlance y se escribe en las 3 acciones de abajo.
val STEP_KEY = intPreferencesKey("qr_step")
val QR_SELECTED_KEY = stringPreferencesKey("qr_selected")
val QR_MINUTES_KEY = intPreferencesKey("qr_minutes")
val MINUTES_PARAM = ActionParameters.Key<Int>("minutes")

/** Paso 1 → 2: elige el pase y arranca los minutos en 30 (el chip del medio). */
class PickAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val passId = parameters[PASS_ID_PARAM] ?: return
        updateAppWidgetState(context, glanceId) {
            it[QR_SELECTED_KEY] = passId
            it[STEP_KEY] = 2
            it[QR_MINUTES_KEY] = 30
        }
        QuickRegisterWidget().update(context, glanceId)
    }
}

/** Paso 2 → 1: vuelve a elegir sin perder el resto del estado. */
class BackAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        updateAppWidgetState(context, glanceId) { it[STEP_KEY] = 1 }
        QuickRegisterWidget().update(context, glanceId)
    }
}

/** Tap en un chip de minutos del paso 2: solo cambia el marcado. */
class PickMinutesAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        updateAppWidgetState(context, glanceId) { it[QR_MINUTES_KEY] = parameters[MINUTES_PARAM] ?: 30 }
        QuickRegisterWidget().update(context, glanceId)
    }
}

// Acciones del cronómetro nativo del widget "Progreso actual": arrancar y
// descartar solo tocan TimerStore (Task 14) y repintan sin abrir la app;
// registrar sí abre la app, prerrellenada con los minutos y el inicio.
class StartTimerAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        val passId = p[PASS_ID_PARAM] ?: return
        TimerStore.set(c, passId, System.currentTimeMillis())
        CurrentProgressWidget().update(c, id)
    }
}
class DiscardTimerAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        TimerStore.clear(c, p[PASS_ID_PARAM])
        CurrentProgressWidget().update(c, id)
    }
}
class RegisterTimerAction : ActionCallback {
    override suspend fun onAction(c: Context, id: GlanceId, p: ActionParameters) {
        val r = TimerStore.get(c) ?: return
        val minutos = elapsedMinutes(r.startedAt, System.currentTimeMillis())
        val inicio = java.time.Instant.ofEpochMilli(r.startedAt).toString()
        TimerStore.clear(c, r.passId)
        val href = "/sesion/${r.passId}?minutos=$minutos&inicio=$inicio"
        c.startActivity(WidgetDeepLinks.intentFor(c, href))
    }
}
