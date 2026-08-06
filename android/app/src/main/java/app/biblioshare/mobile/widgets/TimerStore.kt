package app.biblioshare.mobile.widgets

import android.content.Context

// Dónde vive el cronómetro de una sesión de lectura para que el widget pueda
// seguir contando sin abrir la app. TimerLogic es puro (Map<String,String>)
// para testearlo sin Robolectric — el resto de tests del módulo son JVM puro
// (ver build.gradle). TimerStore es el wrapper fino sobre SharedPreferences.
//
// `startedAt` es el ancla EFECTIVA (ya descuenta las pausas, ver widgetAnchor
// en timer.ts): el Chronometer y los minutos salen de `now - startedAt` sin
// contar los huecos pausados (#491). `firstStartedAt` es la hora real del
// primer arranque, solo para el `inicio` de "Cuándo lees".
//
// La lápida (`cleared_*`) marca que el widget descartó/registró una sesión: la
// app la lee al volver a primer plano para apagar su propio reloj sembrado y
// evitar el reloj fantasma (#493). set() la pisa (una sesión nueva la anula).
object TimerLogic {
    // `startedAt` es el ancla EFECTIVA (mientras corre: now - startedAt == elapsed,
    // ya sin los huecos pausados). `accumulatedMs` es el tiempo contado hasta la
    // última pausa; `running` distingue corriendo de pausado. Pausado: manda
    // `accumulatedMs` (congelado) y `startedAt` es irrelevante hasta reanudar.
    data class Running(
        val passId: String,
        val startedAt: Long,
        val firstStartedAt: Long,
        val accumulatedMs: Long,
        val running: Boolean,
    )
    data class Cleared(val passId: String, val firstStartedAt: Long)

    /** Arranque limpio: sin pausas, ancla e inicio coinciden. */
    fun start(m: MutableMap<String, String>, passId: String, now: Long) =
        set(m, passId, startedAt = now, firstStartedAt = now, accumulatedMs = 0L, running = true)

    fun set(
        m: MutableMap<String, String>,
        passId: String,
        startedAt: Long,
        firstStartedAt: Long,
        accumulatedMs: Long,
        running: Boolean,
    ) {
        m["timer_pass_id"] = passId
        m["timer_started_at"] = startedAt.toString()
        m["timer_first_at"] = firstStartedAt.toString()
        m["timer_accumulated"] = accumulatedMs.toString()
        m["timer_running"] = if (running) "1" else "0"
        clearTombstone(m, null)
    }

    /** Pausa: banca el elapsed corriendo en `accumulatedMs` y congela. */
    fun pause(m: MutableMap<String, String>, now: Long) {
        val r = get(m) ?: return
        if (!r.running) return
        set(m, r.passId, startedAt = r.startedAt, firstStartedAt = r.firstStartedAt,
            accumulatedMs = now - r.startedAt, running = false)
    }

    /** Reanuda: reancla `now - accumulatedMs` para no perder lo ya contado. */
    fun resume(m: MutableMap<String, String>, now: Long) {
        val r = get(m) ?: return
        if (r.running) return
        set(m, r.passId, startedAt = now - r.accumulatedMs, firstStartedAt = r.firstStartedAt,
            accumulatedMs = r.accumulatedMs, running = true)
    }

    fun get(m: Map<String, String>): Running? {
        val id = m["timer_pass_id"] ?: return null
        val at = m["timer_started_at"]?.toLongOrNull() ?: return null
        val first = m["timer_first_at"]?.toLongOrNull() ?: at
        val acc = m["timer_accumulated"]?.toLongOrNull() ?: 0L
        val running = m["timer_running"] != "0" // ausencia = corriendo (compat sesiones viejas)
        return Running(id, at, first, acc, running)
    }

    fun clear(m: MutableMap<String, String>, passId: String?) {
        if (passId == null || m["timer_pass_id"] == passId) {
            m.remove("timer_pass_id")
            m.remove("timer_started_at")
            m.remove("timer_first_at")
            m.remove("timer_accumulated")
            m.remove("timer_running")
        }
    }

    /** Discard/Register desde el widget: apaga el reloj y deja la lápida. Distinto
     *  de clear() (espejo app→nativo por pausa/cierre), que NO debe pedirle a la
     *  app que se limpie a sí misma. */
    fun clearFromWidget(m: MutableMap<String, String>) {
        val r = get(m) ?: return
        clear(m, null)
        m["cleared_pass_id"] = r.passId
        m["cleared_first_at"] = r.firstStartedAt.toString()
    }

    fun getCleared(m: Map<String, String>): Cleared? {
        val id = m["cleared_pass_id"] ?: return null
        val first = m["cleared_first_at"]?.toLongOrNull() ?: return null
        return Cleared(id, first)
    }

    fun clearTombstone(m: MutableMap<String, String>, passId: String?) {
        if (passId == null || m["cleared_pass_id"] == passId) {
            m.remove("cleared_pass_id")
            m.remove("cleared_first_at")
        }
    }
}

object TimerStore {
    private val KEYS = listOf(
        "timer_pass_id", "timer_started_at", "timer_first_at",
        "timer_accumulated", "timer_running",
        "cleared_pass_id", "cleared_first_at",
    )

    private fun prefs(c: Context) =
        c.getSharedPreferences("biblioshare_widgets", Context.MODE_PRIVATE)

    private fun <T> read(c: Context, f: (Map<String, String>) -> T): T {
        val p = prefs(c)
        val m = HashMap<String, String>()
        for (k in KEYS) p.getString(k, null)?.let { m[k] = it }
        return f(m)
    }

    private fun edit(c: Context, f: (MutableMap<String, String>) -> Unit) {
        val p = prefs(c)
        val m = HashMap<String, String>()
        for (k in KEYS) p.getString(k, null)?.let { m[k] = it }
        f(m)
        val e = p.edit()
        for (k in KEYS) if (m.containsKey(k)) e.putString(k, m[k]) else e.remove(k)
        e.apply()
    }

    fun get(c: Context): TimerLogic.Running? = read(c) { TimerLogic.get(it) }
    fun getCleared(c: Context): TimerLogic.Cleared? = read(c) { TimerLogic.getCleared(it) }

    fun set(c: Context, passId: String, startedAt: Long, firstStartedAt: Long, accumulatedMs: Long, running: Boolean) =
        edit(c) { TimerLogic.set(it, passId, startedAt, firstStartedAt, accumulatedMs, running) }

    fun start(c: Context, passId: String, now: Long) = edit(c) { TimerLogic.start(it, passId, now) }
    fun pause(c: Context, now: Long) = edit(c) { TimerLogic.pause(it, now) }
    fun resume(c: Context, now: Long) = edit(c) { TimerLogic.resume(it, now) }

    /** Espejo app→nativo (pausa/cierre) y cierre de sesión: apaga sin dejar lápida
     *  y consume cualquier lápida pendiente de ese pase (la app ya está al día). */
    fun clear(c: Context, passId: String?) = edit(c) {
        TimerLogic.clear(it, passId)
        TimerLogic.clearTombstone(it, passId)
    }

    fun clearFromWidget(c: Context) = edit(c) { TimerLogic.clearFromWidget(it) }
}
