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

    data class Content(
        val items: List<CurrentProgressData>,
        val selectedPassId: String?,
        val total: Int,
        val stale: Boolean,
    ) : ProgressWidgetState {
        /** El elegido por el usuario si sigue en curso; si no, el primero. */
        val featured: CurrentProgressData
            get() = items.firstOrNull { it.passId == selectedPassId } ?: items.first()
        val others: List<CurrentProgressData>
            get() = items.filter { it.passId != featured.passId }
    }
}

sealed interface GoalWidgetState {
    data object SignedOut : GoalWidgetState

    /** Sin `daily_goal_minutes` configurado. */
    data object NoGoal : GoalWidgetState

    /** El snapshot es de otro día: no se enseña el progreso de ayer como de hoy. */
    data class Outdated(val goal: DailyGoalData) : GoalWidgetState

    data class Content(val goal: DailyGoalData) : GoalWidgetState
}

/**
 * @param selectedPassId destacado elegido por el usuario (widget de un solo
 * tamaño con varios en curso); null o ya no en curso cae al primero.
 * @param staleAfterHours a partir de cuántas horas sin sincronizar se avisa.
 */
fun currentProgressState(
    snapshot: WidgetSnapshot?,
    selectedPassId: String?,
    nowMillis: Long = System.currentTimeMillis(),
    staleAfterHours: Int = 48,
): ProgressWidgetState {
    if (snapshot == null) return ProgressWidgetState.SignedOut
    if (snapshot.inProgress.isEmpty()) return ProgressWidgetState.NothingInProgress
    return ProgressWidgetState.Content(
        items = snapshot.inProgress,
        selectedPassId = selectedPassId,
        total = snapshot.inProgressTotal,
        stale = isOlderThanHours(snapshot.generatedAt, staleAfterHours, nowMillis),
    )
}

sealed interface QuickRegisterState {
    data object SignedOut : QuickRegisterState
    data object NothingInProgress : QuickRegisterState
    data class Pick(val items: List<CurrentProgressData>) : QuickRegisterState
    data class Register(val item: CurrentProgressData) : QuickRegisterState
}

/** Paso 1 = elegir de entre lo que está en curso; paso 2 = registrar lo elegido. */
fun quickRegisterState(snapshot: WidgetSnapshot?, step: Int, selectedPassId: String?): QuickRegisterState {
    if (snapshot == null) return QuickRegisterState.SignedOut
    val items = snapshot.inProgress
    if (items.isEmpty()) return QuickRegisterState.NothingInProgress
    val chosen = items.firstOrNull { it.passId == selectedPassId }
    return if (step >= 2 && chosen != null) QuickRegisterState.Register(chosen)
    else QuickRegisterState.Pick(items)
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
