package app.biblioshare.mobile.widgets

import android.content.Context
import androidx.glance.appwidget.updateAll
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.runBlocking

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
        Thread {
            val cover = parsed.currentProgress?.coverUrl
            WidgetImageCache.prune(context, setOfNotNull(cover))
            if (cover != null && WidgetImageCache.ensureDownloaded(context, cover)) {
                WidgetRefresh.updateAll(context)
            }
        }.start()
        call.resolve()
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
    }
}
