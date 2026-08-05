package app.biblioshare.mobile.widgets

import android.content.Context
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
