// ReadingNotificationModelTest.kt
package app.biblioshare.mobile.reading

import app.biblioshare.mobile.widgets.CurrentProgressData
import app.biblioshare.mobile.widgets.TimerLogic
import app.biblioshare.mobile.widgets.WIDGET_SCHEMA_VERSION
import app.biblioshare.mobile.widgets.WidgetSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private const val NOW = 1_785_920_400_000L
private const val START = NOW - 90_000L // 1:30 corriendo

private fun item(id: String, title: String, cover: String?) = CurrentProgressData(
    passId = id, itemType = "book", itemId = "b-$id", title = title, subtitle = null,
    coverUrl = cover, percentage = 10, progressLabel = "x", deepLink = "/sesion/$id",
    nthLabel = "1.ª", contextLabel = "", streakDays = 0, week = emptyList(), kindLabel = "Libro",
)
private fun snap(vararg items: CurrentProgressData) =
    WidgetSnapshot(WIDGET_SCHEMA_VERSION, "u1", "2026-08-08T09:00:00.000Z", items.toList(), items.size, null)

private fun running(id: String, running: Boolean, startedAt: Long = START, acc: Long = 0L) =
    TimerLogic.Running(passId = id, startedAt = startedAt, firstStartedAt = startedAt, accumulatedMs = acc, running = running)

class ReadingNotificationModelTest {
    @Test fun `sin sesion no hay notificacion`() {
        assertNull(readingNotificationModel(null, snap(item("p1", "El Nombre del Viento", null)), NOW))
    }
    @Test fun `corriendo usa el ancla como base del cronometro`() {
        val m = readingNotificationModel(running("p1", true), snap(item("p1", "El Nombre del Viento", "http://c/1.jpg")), NOW)!!
        assertEquals("El Nombre del Viento", m.title)
        assertEquals("http://c/1.jpg", m.coverUrl)
        assertTrue(m.running)
        assertEquals(START, m.whenBase)
        assertNull(m.frozenElapsed)
    }
    @Test fun `pausado congela el tiempo`() {
        val m = readingNotificationModel(running("p1", running = false, acc = 90_000L), snap(item("p1", "T", null)), NOW)!!
        assertTrue(!m.running)
        assertEquals("01:30", m.frozenElapsed)
    }
    @Test fun `pase ausente del snapshot sigue siendo construible`() {
        val m = readingNotificationModel(running("fantasma", true), snap(item("p1", "T", null)), NOW)!!
        assertNull(m.title)
        assertNull(m.coverUrl)
        assertEquals("fantasma", m.passId)
    }
    @Test fun `sesion larga se marca`() {
        val fourHoursOneMin = NOW - (4L * 60 * 60 * 1000 + 60_000)
        val m = readingNotificationModel(running("p1", true, startedAt = fourHoursOneMin), snap(item("p1", "T", null)), NOW)!!
        assertTrue(m.longSession)
    }
}
