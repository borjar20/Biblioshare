package app.biblioshare.mobile.widgets

// Cronómetro del widget, cálculo puro y testeable en JVM (sin SystemClock real).

private const val LONG_MS = 4L * 60 * 60 * 1000

fun isLongSession(startedAt: Long, now: Long): Boolean = now - startedAt > LONG_MS
fun chronometerBase(startedAt: Long, now: Long, elapsedRealtime: Long): Long =
    elapsedRealtime - (now - startedAt)

/** Elapsed real del cronómetro con pausa: corriendo cuenta desde el ancla
 *  efectiva; pausado es el acumulado congelado (#498, Fase B). */
fun elapsedMs(r: TimerLogic.Running, now: Long): Long =
    if (r.running) now - r.startedAt else r.accumulatedMs

fun elapsedMinutes(ms: Long): Int = Math.round(ms / 60_000.0).toInt()

/** "M:SS" (o "H:MM:SS" pasada la hora), para el tiempo CONGELADO de la vista
 *  pausada — el mismo formato que el Chronometer nativo mientras corre. */
fun fmtElapsed(ms: Long): String {
    val total = (ms / 1000).coerceAtLeast(0)
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}
