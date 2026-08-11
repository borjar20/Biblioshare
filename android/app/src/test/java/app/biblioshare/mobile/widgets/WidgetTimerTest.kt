package app.biblioshare.mobile.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetTimerTest {
    @Test fun `minutos redondeados`() {
        assertEquals(30, elapsedMinutes(30 * 60_000L))
        assertEquals(1, elapsedMinutes(40_000L)) // 40s → 1 min
    }
    @Test fun `sesion larga mayor 4h`() {
        assertFalse(isLongSession(0L, 3 * 3_600_000L))
        assertTrue(isLongSession(0L, 5 * 3_600_000L))
    }
    @Test fun `base del chronometer resta el transcurrido`() {
        assertEquals(9_000L, chronometerBase(startedAt = 1_000L, now = 2_000L, elapsedRealtime = 10_000L))
    }
    @Test fun `elapsedMs corriendo no es negativo con reloj hacia atras`() {
        val r = TimerLogic.Running("p1", startedAt = 1_000L, firstStartedAt = 1_000L, accumulatedMs = 0L, running = true)
        assertEquals(0L, elapsedMs(r, now = 500L))
    }

    @Test fun `fmtElapsed MM SS con ceros y con horas`() {
        assertEquals("00:40", fmtElapsed(40_000L))
        assertEquals("05:00", fmtElapsed(5 * 60_000L))
        assertEquals("1:02:03", fmtElapsed((3600 + 2 * 60 + 3) * 1000L))
    }
}
