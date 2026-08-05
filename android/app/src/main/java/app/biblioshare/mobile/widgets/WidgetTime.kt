package app.biblioshare.mobile.widgets

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// Fechas de los widgets, puras y testeables en JVM. Sin java.time: minSdk 24
// no lo tiene y no merece desugaring por dos funciones.

/** Hoy en el calendario LOCAL del dispositivo, "YYYY-MM-DD" — el mismo criterio
 *  que todayISO() en la web (src/lib/stats/dates.ts). */
fun todayLocalISO(now: Date = Date()): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now)

/**
 * ¿El instante ISO-8601 UTC (generatedAt del snapshot) es más viejo que
 * `hours` horas? Tolerante: un formato inesperado devuelve false (mejor no
 * marcar "antiguo" que romper el render).
 */
fun isOlderThanHours(generatedAtIso: String, hours: Int, nowMillis: Long = System.currentTimeMillis()): Boolean {
    return try {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        val parsed = fmt.parse(generatedAtIso.substringBefore(".").removeSuffix("Z")) ?: return false
        nowMillis - parsed.time > hours * 3_600_000L
    } catch (_: Exception) {
        false
    }
}
