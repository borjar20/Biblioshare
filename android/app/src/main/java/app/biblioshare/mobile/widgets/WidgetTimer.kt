package app.biblioshare.mobile.widgets

// Cronómetro del widget, cálculo puro y testeable en JVM (sin SystemClock real).

private const val LONG_MS = 4L * 60 * 60 * 1000

fun elapsedMinutes(startedAt: Long, now: Long): Int = Math.round((now - startedAt) / 60_000.0).toInt()
fun isLongSession(startedAt: Long, now: Long): Boolean = now - startedAt > LONG_MS
fun chronometerBase(startedAt: Long, now: Long, elapsedRealtime: Long): Long =
    elapsedRealtime - (now - startedAt)
