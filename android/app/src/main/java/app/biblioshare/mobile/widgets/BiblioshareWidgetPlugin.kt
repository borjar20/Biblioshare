package app.biblioshare.mobile.widgets

import android.appwidget.AppWidgetManager
import android.content.Context
import android.util.Log
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.compose
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.runBlocking
import org.json.JSONObject

// Puente Capacitor → widgets. Tras el giro a arquitectura híbrida (Fase 2) el
// widget LEE su snapshot de Supabase por su cuenta (WidgetSync + la RPC
// get_widget_snapshot); la web ya no lo construye ni lo empuja. Este plugin
// expone solo: syncNow (refresco inmediato en primer plano) y el cronómetro
// nativo del widget de registro. El refresco con la app cerrada lo lleva
// WorkManager (WidgetWork), programado desde NativeAuthPlugin.
@CapacitorPlugin(name = "BiblioshareWidget")
class BiblioshareWidgetPlugin : Plugin() {

    /**
     * Refresco inmediato tirando de Supabase (arquitectura híbrida, Fase 2): el
     * widget PIDE su snapshot vía RPC en vez de esperar a que la web lo empuje.
     * Lo llama el WebView en primer plano (arranque, foco, tras mutar progreso);
     * el refresco con la app cerrada lo lleva WorkManager (WidgetWork).
     */
    @PluginMethod
    fun syncNow(call: PluginCall) {
        Thread {
            WidgetSync.refresh(context)
            call.resolve()
        }.start()
    }

    @PluginMethod
    fun getRunningTimer(call: PluginCall) {
        val r = TimerStore.get(context)
        val cleared = TimerStore.getCleared(context)
        val res = JSObject()
        res.put(
            "timer",
            if (r == null) JSONObject.NULL
            else JSObject().put("passId", r.passId).put("startedAt", r.startedAt)
                .put("firstStartedAt", r.firstStartedAt),
        )
        res.put(
            "cleared",
            if (cleared == null) JSONObject.NULL
            else JSObject().put("passId", cleared.passId).put("firstStartedAt", cleared.firstStartedAt),
        )
        call.resolve(res)
    }

    @PluginMethod
    fun setRunningTimer(call: PluginCall) {
        val passId = call.getString("passId")
        val startedAt = call.getLong("startedAt")
        if (passId == null || startedAt == null) {
            call.reject("passId/startedAt requeridos")
            return
        }
        // `firstStartedAt` (hora real de inicio) puede faltar en clientes viejos: cae al ancla.
        val firstStartedAt = call.getLong("firstStartedAt") ?: startedAt
        TimerStore.set(context, passId, startedAt, firstStartedAt)
        WidgetRefresh.updateAll(context)
        call.resolve()
    }

    @PluginMethod
    fun clearRunningTimer(call: PluginCall) {
        TimerStore.clear(context, call.getString("passId"))
        WidgetRefresh.updateAll(context)
        call.resolve()
    }
}

object WidgetRefresh {
    /**
     * Re-renderiza TODAS las instancias de los widgets y las EMPUJA directamente
     * vía AppWidgetManager.updateAppWidget (compose() en proceso). Motivo (#498):
     * GlanceAppWidget.update/updateAll solo ENCOLA la composición como
     * OneTimeWorkRequest normal de WorkManager, y One UI difiere esos jobs con la
     * app en background hasta el siguiente broadcast — el widget no repintaba
     * hasta la siguiente acción. compose()+updateAppWidget pinta aquí y ahora.
     * Fallback por instancia al update() clásico si compose() fallara.
     */
    fun updateAll(context: Context) = runBlocking { updateAllSuspend(context) }

    suspend fun updateAllSuspend(context: Context) {
        push(context, CurrentProgressWidget(), CurrentProgressWidget::class.java)
        push(context, DailyGoalWidget(), DailyGoalWidget::class.java)
        push(context, QuickRegisterWidget(), QuickRegisterWidget::class.java)
    }

    private suspend fun <T : GlanceAppWidget> push(context: Context, widget: T, provider: Class<T>) {
        val glanceManager = GlanceAppWidgetManager(context)
        val appWidgetManager = AppWidgetManager.getInstance(context)
        glanceManager.getGlanceIds(provider).forEach { id ->
            runCatching {
                appWidgetManager.updateAppWidget(glanceManager.getAppWidgetId(id), widget.compose(context, id))
            }.onFailure {
                Log.w("BiblioshareWidgets", "compose+push falló para $id, caigo a update()", it)
                runCatching { widget.update(context, id) }
            }
        }
    }
}
