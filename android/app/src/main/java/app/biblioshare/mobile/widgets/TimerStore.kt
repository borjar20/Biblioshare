package app.biblioshare.mobile.widgets

import android.content.Context

// Dónde vive el instante de arranque del cronómetro de una sesión de lectura,
// para que el widget pueda seguir contando sin abrir la app. TimerLogic es
// puro (Map<String,String>) para poder testearlo sin Robolectric — el resto
// de tests del módulo son JVM puro (ver build.gradle). TimerStore es el
// wrapper fino sobre SharedPreferences que delega en esas mismas claves.
object TimerLogic {
    data class Running(val passId: String, val startedAt: Long)

    fun set(m: MutableMap<String, String>, passId: String, startedAt: Long) {
        m["timer_pass_id"] = passId
        m["timer_started_at"] = startedAt.toString()
    }

    fun get(m: Map<String, String>): Running? {
        val id = m["timer_pass_id"] ?: return null
        val at = m["timer_started_at"]?.toLongOrNull() ?: return null
        return Running(id, at)
    }

    fun clear(m: MutableMap<String, String>, passId: String?) {
        if (passId == null || m["timer_pass_id"] == passId) {
            m.remove("timer_pass_id")
            m.remove("timer_started_at")
        }
    }
}

object TimerStore {
    private fun prefs(c: Context) =
        c.getSharedPreferences("biblioshare_widgets", Context.MODE_PRIVATE)

    fun get(c: Context): TimerLogic.Running? {
        val p = prefs(c)
        return TimerLogic.get(
            mapOf(
                "timer_pass_id" to (p.getString("timer_pass_id", null) ?: return null),
                "timer_started_at" to (p.getString("timer_started_at", "") ?: ""),
            )
        )
    }

    fun set(c: Context, passId: String, startedAt: Long) =
        prefs(c).edit().putString("timer_pass_id", passId).putString("timer_started_at", startedAt.toString()).apply()

    fun clear(c: Context, passId: String?) {
        if (passId != null && prefs(c).getString("timer_pass_id", null) != passId) return
        prefs(c).edit().remove("timer_pass_id").remove("timer_started_at").apply()
    }
}
