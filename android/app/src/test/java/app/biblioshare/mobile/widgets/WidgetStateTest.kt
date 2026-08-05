package app.biblioshare.mobile.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Estados de los widgets sin emulador ni instalación: `currentProgressState` y
// `dailyGoalState` son puras, así que cada caso raro —snapshot caducado, cambio
// de día, sesión cerrada— se prueba aquí en milisegundos en vez de esperando a
// que pase la medianoche con el móvil en la mano.

private const val NOW = 1_785_920_400_000L // instante fijo de referencia
private const val GENERATED = "2026-08-05T09:00:00.000Z"

private fun progress() = CurrentProgressData(
    passId = "pass-1",
    itemType = "book",
    itemId = "item-1",
    title = "Dune",
    subtitle = "Frank Herbert",
    coverUrl = null,
    currentValue = 184,
    totalValue = 430,
    percentage = 43,
    progressLabel = "184 de 430 páginas",
    statusLabel = null,
    deepLink = "/sesion/pass-1",
)

private fun goal(date: String = "2026-08-05") = DailyGoalData(
    date = date,
    goalType = "minutes",
    currentValue = 32,
    targetValue = 40,
    percentage = 80,
    progressLabel = "32 / 40 min",
    message = "Te quedan 8 minutos",
    streak = 12,
    completed = false,
    deepLink = "/",
)

private fun snapshot(
    currentProgress: CurrentProgressData? = progress(),
    dailyGoal: DailyGoalData? = goal(),
) = WidgetSnapshot(
    version = WIDGET_SCHEMA_VERSION,
    userId = "user-1",
    generatedAt = GENERATED,
    currentProgress = currentProgress,
    dailyGoal = dailyGoal,
)

class CurrentProgressStateTest {

    @Test
    fun `sin snapshot pide iniciar sesion`() {
        assertEquals(ProgressWidgetState.SignedOut, currentProgressState(null, NOW))
    }

    @Test
    fun `snapshot sin nada en curso`() {
        assertEquals(
            ProgressWidgetState.NothingInProgress,
            currentProgressState(snapshot(currentProgress = null), NOW),
        )
    }

    @Test
    fun `snapshot reciente no marca datos antiguos`() {
        val state = currentProgressState(snapshot(), NOW + 3_600_000L) as ProgressWidgetState.Content
        assertFalse(state.stale)
        assertEquals("Dune", state.data.title)
    }

    @Test
    fun `pasadas 48h marca datos antiguos pero sigue pintando el contenido`() {
        val state = currentProgressState(
            snapshot(),
            NOW + 49 * 3_600_000L,
        ) as ProgressWidgetState.Content
        assertTrue(state.stale)
        // Sigue siendo útil sin conexión: se avisa, no se vacía.
        assertEquals("184 de 430 páginas", state.data.progressLabel)
    }
}

class DailyGoalStateTest {

    @Test
    fun `sin snapshot pide iniciar sesion`() {
        assertEquals(GoalWidgetState.SignedOut, dailyGoalState(null, "2026-08-05"))
    }

    @Test
    fun `sin objetivo configurado`() {
        assertEquals(
            GoalWidgetState.NoGoal,
            dailyGoalState(snapshot(dailyGoal = null), "2026-08-05"),
        )
    }

    @Test
    fun `mismo dia pinta el progreso`() {
        val state = dailyGoalState(snapshot(), "2026-08-05")
        assertTrue(state is GoalWidgetState.Content)
        assertEquals(80, (state as GoalWidgetState.Content).goal.percentage)
    }

    @Test
    fun `cambio de dia no vende el progreso de ayer como de hoy`() {
        val state = dailyGoalState(snapshot(dailyGoal = goal("2026-08-04")), "2026-08-05")
        assertTrue(state is GoalWidgetState.Outdated)
    }
}
