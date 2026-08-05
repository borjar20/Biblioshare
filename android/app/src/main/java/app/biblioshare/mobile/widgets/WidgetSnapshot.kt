package app.biblioshare.mobile.widgets

import org.json.JSONArray
import org.json.JSONObject

// Modelo espejo de src/lib/widgets/types.ts. La versión DEBE coincidir con
// WIDGET_SCHEMA_VERSION del lado web: un snapshot de otra versión se descarta
// entero (parse devuelve null) y el widget cae al estado vacío — nunca se
// intenta migrar a medias un formato que este APK no conoce.
const val WIDGET_SCHEMA_VERSION = 2

data class WidgetWeekDay(val active: Boolean, val today: Boolean)

data class CurrentProgressData(
    val passId: String,
    val itemType: String, // "book" | "movie" | "series"
    val itemId: String,
    val title: String,
    val subtitle: String?,
    val coverUrl: String?,
    val percentage: Int?,
    val progressLabel: String,
    val deepLink: String,
    val nthLabel: String,
    val contextLabel: String,
    val streakDays: Int,
    val week: List<WidgetWeekDay>,
    val kindLabel: String,
)

data class DailyGoalData(
    /** "YYYY-MM-DD" local del usuario cuando se generó. Si no es hoy, el widget lo dice. */
    val date: String,
    val goalType: String,
    val currentValue: Int,
    val targetValue: Int,
    val percentage: Int,
    val progressLabel: String,
    val message: String,
    val streak: Int?,
    val completed: Boolean,
    val deepLink: String,
)

data class WidgetSnapshot(
    val version: Int,
    val userId: String,
    val generatedAt: String,
    val inProgress: List<CurrentProgressData>,
    val inProgressTotal: Int,
    val dailyGoal: DailyGoalData?,
) {
    companion object {
        /**
         * null si el JSON es ilegible, la versión no coincide o faltan campos
         * requeridos. Nunca lanza: un snapshot corrupto no puede tumbar ni el
         * plugin ni el render del widget.
         */
        fun parse(json: String?): WidgetSnapshot? {
            if (json.isNullOrBlank()) return null
            return try {
                val root = JSONObject(json)
                if (root.getInt("version") != WIDGET_SCHEMA_VERSION) return null
                val userId = root.getString("userId")
                if (userId.isBlank()) return null
                WidgetSnapshot(
                    version = WIDGET_SCHEMA_VERSION,
                    userId = userId,
                    generatedAt = root.getString("generatedAt"),
                    inProgress = parseInProgress(root.optJSONArray("inProgress")),
                    inProgressTotal = root.optInt("inProgressTotal", 0),
                    dailyGoal = root.optJSONObject("dailyGoal")?.let(::parseGoal),
                )
            } catch (_: Exception) {
                null
            }
        }

        private fun parseInProgress(arr: JSONArray?): List<CurrentProgressData> {
            if (arr == null) return emptyList()
            val out = ArrayList<CurrentProgressData>(arr.length())
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                out.add(
                    CurrentProgressData(
                        passId = o.getString("passId"),
                        itemType = o.getString("itemType"),
                        itemId = o.getString("itemId"),
                        title = o.getString("title"),
                        subtitle = o.optStringOrNull("subtitle"),
                        coverUrl = o.optStringOrNull("coverUrl"),
                        percentage = if (o.isNull("percentage")) null else o.getInt("percentage"),
                        progressLabel = o.getString("progressLabel"),
                        deepLink = o.getString("deepLink"),
                        nthLabel = o.optString("nthLabel"),
                        contextLabel = o.optString("contextLabel"),
                        streakDays = o.optInt("streakDays", 0),
                        week = parseWeek(o.optJSONArray("week")),
                        kindLabel = o.optString("kindLabel"),
                    ),
                )
            }
            return out
        }

        private fun parseWeek(arr: JSONArray?): List<WidgetWeekDay> {
            if (arr == null) return emptyList()
            return (0 until arr.length()).mapNotNull { i ->
                arr.optJSONObject(i)?.let { WidgetWeekDay(it.optBoolean("active"), it.optBoolean("today")) }
            }
        }

        private fun parseGoal(o: JSONObject): DailyGoalData = DailyGoalData(
            date = o.getString("date"),
            goalType = o.getString("goalType"),
            currentValue = o.getInt("currentValue"),
            targetValue = o.getInt("targetValue"),
            percentage = o.getInt("percentage"),
            progressLabel = o.getString("progressLabel"),
            message = o.getString("message"),
            streak = if (o.isNull("streak")) null else o.getInt("streak"),
            completed = o.getBoolean("completed"),
            deepLink = o.getString("deepLink"),
        )
    }
}

private fun JSONObject.optStringOrNull(key: String): String? =
    if (isNull(key)) null else optString(key).ifBlank { null }
