package app.biblioshare.mobile.widgets

import android.content.Context
import android.content.Intent
import app.biblioshare.mobile.MainActivity
import com.getcapacitor.Bridge

// Deep links de los widgets. El wrapper carga la web remota (server.url), así
// que "navegar" es cargar `serverUrl + path` en el WebView del bridge: no hay
// esquema propio (biblioshare://) ni App Links — un path interno validado es
// exactamente lo mismo que ya usa el push (safe-path.ts). Este objeto es el
// ÚNICO punto de entrada: los widgets construyen el intent aquí y MainActivity
// lo resuelve aquí.
object WidgetDeepLinks {
    const val EXTRA_PATH = "biblioshareWidgetPath"

    /**
     * Espejo de src/lib/push/safe-path.ts: solo rutas internas absolutas.
     * Cualquier cosa rara ("//evil.com", "https://…", vacío) cae a "/".
     */
    @JvmStatic
    fun safeInternalPath(path: String?): String {
        if (path.isNullOrBlank()) return "/"
        if (!path.startsWith("/") || path.startsWith("//") || path.contains("://")) return "/"
        // Algunos motores tratan "\" como "/": "/\evil.com" colaría como
        // protocol-relative. Misma regla que safe-path.ts.
        if (path.contains('\\') || path.any { it.code <= 0x1f || it.code == 0x7f }) return "/"
        return path
    }

    fun intentFor(context: Context, path: String): Intent =
        Intent(context, MainActivity::class.java)
            .setAction(Intent.ACTION_VIEW)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            .putExtra(EXTRA_PATH, safeInternalPath(path))

    /**
     * Llamado por MainActivity en onCreate (arranque en frío desde el widget) y
     * onNewIntent (app ya abierta, launchMode singleTask). Si el intent no trae
     * ruta de widget, no hace nada. El extra se consume para que una rotación
     * no vuelva a navegar.
     */
    @JvmStatic
    fun handle(bridge: Bridge?, intent: Intent?) {
        val raw = intent?.getStringExtra(EXTRA_PATH) ?: return
        intent.removeExtra(EXTRA_PATH)
        val webView = bridge?.webView ?: return
        val base = bridge.config?.serverUrl?.trimEnd('/') ?: return
        val url = base + safeInternalPath(raw)
        // post(): en el arranque en frío el WebView aún está cargando la URL
        // inicial; encolar la navegación evita pisarla a mitad de init.
        webView.post { webView.loadUrl(url) }
    }
}
