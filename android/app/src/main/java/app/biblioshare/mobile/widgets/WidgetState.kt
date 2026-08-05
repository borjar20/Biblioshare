package app.biblioshare.mobile.widgets

// Qué debe pintar cada widget, decidido FUERA de la composición.
//
// El `when` vivía dentro de provideContent, así que la única forma de probar
// "con snapshot caducado sale el aviso de actualizar" era instalar la app y
// esperar a que cambiara el día. Extraído aquí es una función pura: se prueba
// en JUnit de escritorio (sin emulador, sin Glance, sin Robolectric) y las
// previews de Android Studio pintan cada estado sin tocar la base de datos.
//
// Los composables pasan a ser tontos: reciben el estado y dibujan.

sealed interface ProgressWidgetState {
    /** Sin snapshot: nunca sincronizado o sesión cerrada. */
    data object SignedOut : ProgressWidgetState

    /** Hay sesión pero nada a medias. */
    data object NothingInProgress : ProgressWidgetState

    data class Content(val data: CurrentProgressData, val stale: Boolean) : ProgressWidgetState
}

sealed interface GoalWidgetState {
    data object SignedOut : GoalWidgetState

    /** Sin `daily_goal_minutes` configurado. */
    data object NoGoal : GoalWidgetState

    /** El snapshot es de otro día: no se enseña el progreso de ayer como de hoy. */
    data class Outdated(val goal: DailyGoalData) : GoalWidgetState

    data class Content(val goal: DailyGoalData) : GoalWidgetState
}

/** @param staleAfterHours a partir de cuántas horas sin sincronizar se avisa. */
fun currentProgressState(
    snapshot: WidgetSnapshot?,
    nowMillis: Long = System.currentTimeMillis(),
    staleAfterHours: Int = 48,
): ProgressWidgetState {
    if (snapshot == null) return ProgressWidgetState.SignedOut
    val data = snapshot.currentProgress ?: return ProgressWidgetState.NothingInProgress
    return ProgressWidgetState.Content(
        data = data,
        stale = isOlderThanHours(snapshot.generatedAt, staleAfterHours, nowMillis),
    )
}

/** @param today fecha local del dispositivo ("YYYY-MM-DD"), inyectable para probar el cambio de día. */
fun dailyGoalState(
    snapshot: WidgetSnapshot?,
    today: String = todayLocalISO(),
): GoalWidgetState {
    if (snapshot == null) return GoalWidgetState.SignedOut
    val goal = snapshot.dailyGoal ?: return GoalWidgetState.NoGoal
    return if (goal.date != today) GoalWidgetState.Outdated(goal) else GoalWidgetState.Content(goal)
}
