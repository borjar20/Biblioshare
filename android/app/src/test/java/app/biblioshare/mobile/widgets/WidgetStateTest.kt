package app.biblioshare.mobile.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Estados de los widgets sin emulador ni instalación: `currentProgressState` y
// `dailyGoalState` son puras, así que cada caso raro —snapshot caducado, cambio
// de día, sesión cerrada, selección de destacado con fallback— se prueba aquí
// en milisegundos en vez de esperando a que pase la medianoche con el móvil en
// la mano.

private const val NOW = 1_785_920_400_000L // instante fijo de referencia
private const val GENERATED = "2026-08-05T09:00:00.000Z"

private fun item(id: String) = CurrentProgressData(
    passId = id, itemType = "book", itemId = "b-$id", title = id, subtitle = null,
    coverUrl = null, percentage = 10, progressLabel = "x", deepLink = "/sesion/$id",
    nthLabel = "1.ª lectura", contextLabel = "", streakDays = 0, week = emptyList(),
    kindLabel = "Libro",
)

private fun snap(vararg ids: String, generatedAt: String = GENERATED) = WidgetSnapshot(
    WIDGET_SCHEMA_VERSION, "u1", generatedAt, ids.map(::item), ids.size, null,
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

private fun snapshotWithGoal(dailyGoal: DailyGoalData?) = WidgetSnapshot(
    version = WIDGET_SCHEMA_VERSION,
    userId = "user-1",
    generatedAt = GENERATED,
    inProgress = listOf(item("p1")),
    inProgressTotal = 1,
    dailyGoal = dailyGoal,
)

class CurrentProgressStateTest {

    @Test fun `sin seleccion, destacado es el primero`() {
        val s = currentProgressState(snap("p1", "p2"), selectedPassId = null) as ProgressWidgetState.Content
        assertEquals("p1", s.featured.passId)
    }

    @Test fun `seleccion valida manda`() {
        val s = currentProgressState(snap("p1", "p2"), selectedPassId = "p2") as ProgressWidgetState.Content
        assertEquals("p2", s.featured.passId)
    }

    @Test fun `seleccion inexistente cae al primero`() {
        val s = currentProgressState(snap("p1", "p2"), selectedPassId = "zzz") as ProgressWidgetState.Content
        assertEquals("p1", s.featured.passId)
    }

    @Test fun `lista vacia es NothingInProgress`() {
        assertEquals(ProgressWidgetState.NothingInProgress, currentProgressState(snap(), null))
    }

    @Test
    fun `sin snapshot pide iniciar sesion`() {
        assertEquals(ProgressWidgetState.SignedOut, currentProgressState(null, null))
    }

    @Test
    fun `otros son todos menos el destacado`() {
        val s = currentProgressState(snap("p1", "p2", "p3"), selectedPassId = "p2") as ProgressWidgetState.Content
        assertEquals(listOf("p1", "p3"), s.others.map { it.passId })
    }

    @Test
    fun `snapshot reciente no marca datos antiguos`() {
        val state = currentProgressState(snap("p1"), selectedPassId = null, nowMillis = NOW + 3_600_000L) as ProgressWidgetState.Content
        assertFalse(state.stale)
    }

    @Test
    fun `pasadas 48h marca datos antiguos pero sigue pintando el contenido`() {
        val state = currentProgressState(
            snap("p1", generatedAt = GENERATED),
            selectedPassId = null,
            nowMillis = NOW + 49 * 3_600_000L,
        ) as ProgressWidgetState.Content
        assertTrue(state.stale)
        // Sigue siendo útil sin conexión: se avisa, no se vacía.
        assertEquals("p1", state.featured.passId)
    }
}

class QuickRegisterStateTest {

    @Test fun `paso 1 lista, paso 2 elige por passId`() {
        val s1 = quickRegisterState(snap("p1", "p2"), step = 1, selectedPassId = null)
        assertTrue(s1 is QuickRegisterState.Pick && s1.items.size == 2)
        val s2 = quickRegisterState(snap("p1", "p2"), step = 2, selectedPassId = "p2")
        assertTrue(s2 is QuickRegisterState.Register && (s2 as QuickRegisterState.Register).item.passId == "p2")
    }

    @Test fun `paso 2 con seleccion perdida vuelve a lista`() {
        val s = quickRegisterState(snap("p1"), step = 2, selectedPassId = "zzz")
        assertTrue(s is QuickRegisterState.Pick)
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
            dailyGoalState(snapshotWithGoal(dailyGoal = null), "2026-08-05"),
        )
    }

    @Test
    fun `mismo dia pinta el progreso`() {
        val state = dailyGoalState(snapshotWithGoal(goal()), "2026-08-05")
        assertTrue(state is GoalWidgetState.Content)
        assertEquals(80, (state as GoalWidgetState.Content).goal.percentage)
    }

    @Test
    fun `cambio de dia no vende el progreso de ayer como de hoy`() {
        val state = dailyGoalState(snapshotWithGoal(goal("2026-08-04")), "2026-08-05")
        assertTrue(state is GoalWidgetState.Outdated)
    }
}
