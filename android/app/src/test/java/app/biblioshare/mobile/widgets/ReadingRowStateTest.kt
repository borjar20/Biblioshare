package app.biblioshare.mobile.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private fun rowItem(id: String) = CurrentProgressData(
    passId = id, itemType = "book", itemId = "b-$id", title = id, subtitle = null,
    coverUrl = null, percentage = 10, progressLabel = "x", deepLink = "/sesion/$id",
    nthLabel = "1.ª lectura", contextLabel = "", streakDays = 0, week = emptyList(),
    kindLabel = "Libro",
)

private fun rowSnap(vararg ids: String) =
    WidgetSnapshot(WIDGET_SCHEMA_VERSION, "u1", "2026-08-08T09:00:00.000Z", ids.map(::rowItem), ids.size, null)

private fun runningOf(id: String, running: Boolean = true) =
    TimerLogic.Running(passId = id, startedAt = 1_000L, firstStartedAt = 1_000L, accumulatedMs = 0L, running = running)

class NextInProgressTest {
    @Test fun `el siguiente circular vuelve al primero`() {
        assertEquals("p1", nextInProgress(rowSnap("p1", "p2", "p3").inProgress, "p3"))
    }
    @Test fun `el siguiente normal avanza uno`() {
        assertEquals("p2", nextInProgress(rowSnap("p1", "p2", "p3").inProgress, "p1"))
    }
    @Test fun `id ausente empieza por el primero`() {
        assertEquals("p1", nextInProgress(rowSnap("p1", "p2").inProgress, "zzz"))
    }
    @Test fun `un solo item cicla a si mismo`() {
        assertEquals("p1", nextInProgress(rowSnap("p1").inProgress, "p1"))
    }
    @Test fun `lista vacia es null`() {
        assertNull(nextInProgress(emptyList(), "p1"))
    }
}

class ReadingRowStateTest {
    @Test fun `sin snapshot es Empty`() {
        assertEquals(ReadingRowState.Empty, readingRowState(null, null, null))
    }
    @Test fun `sin nada en curso es Empty`() {
        assertEquals(ReadingRowState.Empty, readingRowState(rowSnap(), null, null))
    }
    @Test fun `sin sesion usa la seleccion`() {
        val s = readingRowState(rowSnap("p1", "p2"), "p2", null) as ReadingRowState.Selector
        assertEquals("p2", s.featured.passId)
        assertTrue(s.hasOthers)
    }
    @Test fun `sin sesion y seleccion ausente cae al primero`() {
        val s = readingRowState(rowSnap("p1", "p2"), "zzz", null) as ReadingRowState.Selector
        assertEquals("p1", s.featured.passId)
    }
    @Test fun `un solo item no tiene otros`() {
        val s = readingRowState(rowSnap("p1"), null, null) as ReadingRowState.Selector
        assertFalse(s.hasOthers)
    }
    @Test fun `sesion activa se fija al pase en curso aunque la seleccion sea otra`() {
        val s = readingRowState(rowSnap("p1", "p2"), "p1", runningOf("p2")) as ReadingRowState.Session
        assertEquals("p2", s.featured.passId)
    }
    @Test fun `sesion de un pase ausente del snapshot cae a selector`() {
        val s = readingRowState(rowSnap("p1", "p2"), "p1", runningOf("fantasma"))
        assertTrue(s is ReadingRowState.Selector)
    }
}
