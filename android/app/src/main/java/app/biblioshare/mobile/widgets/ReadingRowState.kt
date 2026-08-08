package app.biblioshare.mobile.widgets

// Estado puro del widget de 1 fila (4x1): rotación del ⏭ y elección de qué pase
// se pinta. Se fija al pase EN CURSO durante la sesión (pin), ignorando la
// selección manual; fuera de sesión manda la selección recordada. Puro para
// probarlo en JVM, igual que currentProgressState.

/** Siguiente pase circular tras `currentId`; si no está, el primero; vacío → null. */
fun nextInProgress(items: List<CurrentProgressData>, currentId: String?): String? {
    if (items.isEmpty()) return null
    val idx = items.indexOfFirst { it.passId == currentId }
    val next = if (idx < 0) 0 else (idx + 1) % items.size
    return items[next].passId
}

sealed interface ReadingRowState {
    /** Sin sesión y sin nada a medias (o sin snapshot). */
    data object Empty : ReadingRowState
    /** Sin sesión: pase destacado + si hay más de uno en curso (para mostrar ⏭). */
    data class Selector(val featured: CurrentProgressData, val hasOthers: Boolean) : ReadingRowState
    /** Sesión activa: fijado al pase en curso, con su reloj. */
    data class Session(val featured: CurrentProgressData, val running: TimerLogic.Running) : ReadingRowState
}

fun readingRowState(
    snapshot: WidgetSnapshot?,
    selectedPassId: String?,
    running: TimerLogic.Running?,
): ReadingRowState {
    val items = snapshot?.inProgress.orEmpty()
    if (items.isEmpty()) return ReadingRowState.Empty
    // Pin: si hay sesión y su pase está en el snapshot, manda sobre la selección.
    val runningItem = running?.let { r -> items.firstOrNull { it.passId == r.passId } }
    if (running != null && runningItem != null) return ReadingRowState.Session(runningItem, running)
    val featured = items.firstOrNull { it.passId == selectedPassId } ?: items.first()
    return ReadingRowState.Selector(featured, hasOthers = items.size > 1)
}
