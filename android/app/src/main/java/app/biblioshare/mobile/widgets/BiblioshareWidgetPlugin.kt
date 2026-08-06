package app.biblioshare.mobile.widgets

import android.content.Context
import androidx.glance.appwidget.updateAll
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
     * Re-renderiza TODAS las instancias de ambos widgets desde el store local.
     * runBlocking es aceptable: corre en el hilo de plugins de Capacitor (o en
     * el Thread de la portada), nunca en el main thread, y updateAll solo
     * recompone RemoteViews.
     */
    fun updateAll(context: Context) = runBlocking {
        CurrentProgressWidget().updateAll(context)
        DailyGoalWidget().updateAll(context)
        QuickRegisterWidget().updateAll(context)
    }
}
