package app.biblioshare.mobile.auth

import app.biblioshare.mobile.widgets.WidgetRefresh
import app.biblioshare.mobile.widgets.WidgetSnapshotStore
import app.biblioshare.mobile.widgets.WidgetSync
import app.biblioshare.mobile.widgets.WidgetWork
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

// Puente Capacitor → sesión Supabase nativa. Toda la lógica vive en
// NativeSupabase; aquí solo se valida la entrada, se ejecuta la red en un hilo
// aparte (NetworkOnMainThread) y se responde el estado. La web es la única que
// pasa url+anonKey (los toma de NEXT_PUBLIC_*). NativeBackend restringe el
// destino al proyecto de producción del wrapper; la clave pública puede rotar.
//
// TODO hilo lleva try/catch: una excepción sin capturar en un Thread{} crudo
// dispara el UncaughtExceptionHandler por defecto de Android y MATA el proceso
// entero (así se cerraba la app en modo avión). Ante lo inesperado, se rechaza
// la llamada y el hilo termina limpio.
@CapacitorPlugin(name = "NativeAuth")
class NativeAuthPlugin : Plugin() {

    @PluginMethod
    fun establishSession(call: PluginCall) {
        val url = call.getString("url")
        val anonKey = call.getString("anonKey")
        val tokenHash = call.getString("tokenHash")
        if (url == null || anonKey == null || tokenHash == null) {
            call.reject("url/anonKey/tokenHash requeridos")
            return
        }
        Thread {
            try {
                val userId = NativeSupabase.establish(context, url, anonKey, tokenHash)
                if (userId != null) {
                    // Con sesión: refresco periódico en segundo plano + primer
                    // pintado inmediato tirando de Supabase (no esperamos al WebView).
                    WidgetWork.schedulePeriodic(context)
                    WidgetSync.refresh(context)
                }
                resolveStatus(call)
            } catch (e: Exception) {
                call.reject(e.message ?: "establishSession falló")
            }
        }.start()
    }

    @PluginMethod
    fun signOut(call: PluginCall) {
        Thread {
            try {
                NativeSupabase.signOut(context)
                // Sin sesión no hay refrescos, y el widget se vacía (no dejar datos
                // de la cuenta anterior a la vista).
                WidgetWork.cancel(context)
                WidgetSnapshotStore.clear(context)
                WidgetRefresh.updateAll(context)
                call.resolve()
            } catch (e: Exception) {
                call.reject(e.message ?: "signOut falló")
            }
        }.start()
    }

    /** Estado actual: prueba de vida real (whoAmI), no solo "hay tokens guardados". */
    @PluginMethod
    fun status(call: PluginCall) {
        Thread {
            try {
                resolveStatus(call)
            } catch (e: Exception) {
                call.reject(e.message ?: "status falló")
            }
        }.start()
    }

    private fun resolveStatus(call: PluginCall) {
        val who = NativeSupabase.whoAmI(context)
        val res = JSObject()
        res.put("authenticated", who != null)
        res.put("userId", who?.userId ?: JSONObject.NULL)
        call.resolve(res)
    }
}
