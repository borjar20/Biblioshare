package app.biblioshare.mobile.auth

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

// Sesión Supabase NATIVA, independiente de la del WebView (arquitectura híbrida,
// Fase 1). El WebView (autenticado por cookies) pide a /api/native/session un
// `token_hash` de magic-link y lo pasa al plugin; verificarlo aquí crea una
// sesión NUEVA con su propia cadena de refresh. Así web y nativo se refrescan
// por separado y nunca se pisan el refresh token — esa colisión dispara la
// detección de reúso de Supabase y revoca la familia entera (logout mutuo).
// Ver docs/requirements/decisiones.md (2026-08-06).
//
// Sin SDK: cuatro llamadas HTTP (verify, refresh, logout, un select de prueba)
// no justifican arrastrar supabase-kt + ktor al APK. HttpURLConnection +
// org.json (ambos gratis en el dispositivo), aislado en este fichero para que
// migrar a supabase-kt más adelante quede contenido si hace falta Realtime.
object NativeSupabase {
    private const val K_URL = "url"
    private const val K_ANON = "anon"
    private const val K_ACCESS = "access_token"
    private const val K_REFRESH = "refresh_token"
    private const val K_EXPIRES = "expires_at" // epoch segundos
    private const val SKEW_S = 60L // refresca 1 min antes de caducar

    data class Who(val userId: String)

    /**
     * Verifica el token_hash del magic-link y guarda la sesión resultante junto
     * con url+anonKey (los necesita el refresh en segundo plano, cuando el
     * WebView no está para volver a pasarlos). Devuelve el userId o null.
     */
    @Synchronized
    fun establish(context: Context, url: String, anonKey: String, tokenHash: String): String? {
        val body = JSONObject().put("type", "magiclink").put("token_hash", tokenHash).toString()
        val (code, text) = request("POST", "$url/auth/v1/verify", anonKey, null, body)
        if (code !in 200..299) return null
        val json = JSONObject(text)
        saveSession(context, json, url, anonKey)
        return json.optJSONObject("user")?.optString("id")?.ifEmpty { null }
    }

    /** Access token válido (refrescando si hace falta), o null si no hay sesión viva. */
    private fun freshAccessToken(context: Context): String? {
        val p = NativeSessionStore.read(context)
        val access = p.optString(K_ACCESS).ifEmpty { null } ?: return null
        val expiresAt = p.optLong(K_EXPIRES, 0L)
        val now = System.currentTimeMillis() / 1000
        if (now < expiresAt - SKEW_S) return access
        return refresh(context)
    }

    private fun refresh(context: Context): String? {
        val p = NativeSessionStore.read(context)
        val url = p.optString(K_URL).ifEmpty { null } ?: return null
        val anon = p.optString(K_ANON).ifEmpty { null } ?: return null
        val refreshToken = p.optString(K_REFRESH).ifEmpty { null } ?: return null
        val body = JSONObject().put("refresh_token", refreshToken).toString()
        val (code, text) = request(
            "POST", "$url/auth/v1/token?grant_type=refresh_token", anon, null, body,
        )
        if (code !in 200..299) {
            // 4xx = refresh inválido (revocado/expirado): la sesión murió, se limpia.
            // 5xx/red = transitorio: se conserva para reintentar más tarde.
            if (code in 400..499) clear(context)
            return null
        }
        val json = JSONObject(text)
        saveSession(context, json)
        return json.optString("access_token").ifEmpty { null }
    }

    private fun saveSession(context: Context, json: JSONObject, url: String? = null, anon: String? = null) {
        val access = json.optString("access_token")
        val refresh = json.optString("refresh_token")
        // expires_at (epoch s) si viene; si no, ahora + expires_in.
        val expiresAt = if (json.has("expires_at")) {
            json.optLong("expires_at")
        } else {
            System.currentTimeMillis() / 1000 + json.optLong("expires_in", 3600)
        }
        val session = NativeSessionStore.read(context)
        if (url != null) session.put(K_URL, url)
        if (anon != null) session.put(K_ANON, anon)
        session.put(K_ACCESS, access).put(K_REFRESH, refresh).put(K_EXPIRES, expiresAt)
        NativeSessionStore.write(context, session)
    }

    /**
     * Prueba de vida (Fase 1): un SELECT con RLS sobre el propio perfil. Si
     * devuelve la fila, el handoff + la persistencia + el refresh funcionan y
     * `auth.uid()` es quien debe. Devuelve el userId o null.
     */
    @Synchronized
    fun whoAmI(context: Context): Who? {
        val token = freshAccessToken(context) ?: return null
        val p = NativeSessionStore.read(context)
        val url = p.optString(K_URL).ifEmpty { null } ?: return null
        val anon = p.optString(K_ANON).ifEmpty { null } ?: return null
        val (code, text) = request(
            "GET", "$url/rest/v1/profiles?select=user_id&limit=1", anon, token, null,
        )
        if (code !in 200..299) return null
        val arr = JSONArray(text)
        if (arr.length() == 0) return null
        val userId = arr.getJSONObject(0).optString("user_id")
        return if (userId.isEmpty()) null else Who(userId)
    }

    /**
     * ¿Hay sesión guardada? Solo mira los tokens en disco (sin red), para que el
     * refresco en segundo plano no dispare llamadas cuando ya no hay sesión.
     */
    @Synchronized
    fun hasSession(context: Context): Boolean =
        NativeSessionStore.read(context).optString(K_REFRESH).isNotEmpty()

    /**
     * Llama una RPC de PostgREST con la sesión nativa y devuelve el cuerpo JSON
     * crudo, o null si no hay sesión viva o el servidor no respondió 2xx. Sin
     * argumentos: cuerpo "{}". La RLS de la función filtra por auth.uid(), así
     * que el nativo solo puede leer lo suyo. Base del transporte de widgets
     * (arquitectura híbrida, Fase 2): get_widget_snapshot devuelve el JSON v2
     * que el parser ya consume.
     */
    @Synchronized
    fun rpc(context: Context, fn: String): String? {
        val token = freshAccessToken(context) ?: return null
        val p = NativeSessionStore.read(context)
        val url = p.optString(K_URL).ifEmpty { null } ?: return null
        val anon = p.optString(K_ANON).ifEmpty { null } ?: return null
        val (code, text) = request("POST", "$url/rest/v1/rpc/$fn", anon, token, "{}")
        return if (code in 200..299) text else null
    }

    @Synchronized
    fun signOut(context: Context) {
        val p = NativeSessionStore.read(context)
        val url = p.optString(K_URL).ifEmpty { null }
        val anon = p.optString(K_ANON).ifEmpty { null }
        val token = p.optString(K_ACCESS).ifEmpty { null }
        if (url != null && anon != null && token != null) {
            // best-effort: revoca la sesión en el servidor antes de olvidarla.
            try {
                request("POST", "$url/auth/v1/logout", anon, token, "{}")
            } catch (_: Exception) {
            }
        }
        clear(context)
    }

    @Synchronized
    fun clear(context: Context) {
        NativeSessionStore.clear(context)
    }

    // ── HTTP (HttpURLConnection + org.json, cero dependencias nuevas) ──────────

    // Sin red la llamada NO devuelve un código de error: LANZA. Modo avión lanza
    // UnknownHostException (o ConnectException/SocketTimeoutException); sin este
    // catch la excepción sube por rpc()/refresh()/whoAmI() hasta el Thread{} del
    // plugin llamante, el hilo muere sin handler y Android mata el proceso
    // entero (KillApplicationHandler) — "la app se cierra sola" al activar el
    // modo avión. Se devuelve 0 to "": ∉2xx (los llamantes devuelven null) y
    // ∉4xx (refresh() lo trata como transitorio y CONSERVA los tokens para
    // reintentar con red). Solo IOException: un error de programación (NPE, JSON
    // malformado…) debe seguir petando en desarrollo, no camuflarse como "sin red".
    private fun request(
        method: String,
        urlStr: String,
        apiKey: String,
        bearer: String?,
        body: String?,
    ): Pair<Int, String> = try {
        val conn = URL(urlStr).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            conn.setRequestProperty("apikey", apiKey)
            conn.setRequestProperty("Content-Type", "application/json")
            bearer?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                conn.doOutput = true
                conn.outputStream.use { it.write(body.toByteArray()) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use(BufferedReader::readText) ?: ""
            code to text
        } finally {
            conn.disconnect()
        }
    } catch (e: IOException) {
        Log.w("NativeSupabase", "fallo de red en $method $urlStr (¿sin conexión?)", e)
        0 to ""
    }
}
