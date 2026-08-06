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

// Puente Capacitor → widgets. La web construye el snapshot (toda la lógica de
// negocio vive en TypeScript, src/lib/widgets/) y aquí solo se valida, se
// persiste y se notifica a las instancias instaladas. Los widgets NUNCA
// consultan Supabase ni reciben tokens: pintan lo último que la app les dejó.
@CapacitorPlugin(name = "BiblioshareWidget")
class BiblioshareWidgetPlugin : Plugin() {

    @PluginMethod
    fun updateSnapshot(call: PluginCall) {
        val snapshot = call.getObject("snapshot")
        if (snapshot == null) {
            call.reject("snapshot requerido")
            return
        }
        val parsed = WidgetSnapshotStore.save(context, snapshot.toString())
        if (parsed == null) {
            call.reject("snapshot inválido o de versión incompatible")
            return
        }
        // Texto primero: el contenido nunca espera a una imagen.
        WidgetRefresh.updateAll(context)
        // Portada en segundo plano, best-effort: si falla queda el placeholder.
        Thread { WidgetSync.downloadCovers(context, parsed) }.start()
        call.resolve()
    }

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
    fun clearSnapshot(call: PluginCall) {
        WidgetSnapshotStore.clear(context)
        WidgetRefresh.updateAll(context)
        call.resolve()
    }

    @PluginMethod
    fun refreshWidgets(call: PluginCall) {
        WidgetRefresh.updateAll(context)
        call.resolve()
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
