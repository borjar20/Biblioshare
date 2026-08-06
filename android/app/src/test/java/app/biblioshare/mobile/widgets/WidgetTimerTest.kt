package app.biblioshare.mobile.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetTimerTest {
    @Test fun `minutos redondeados`() {
        assertEquals(30, elapsedMinutes(0L, 30 * 60_000L))
        assertEquals(1, elapsedMinutes(0L, 40_000L)) // 40s → 1 min
    }
    @Test fun `sesion larga mayor 4h`() {
        assertFalse(isLongSession(0L, 3 * 3_600_000L))
        assertTrue(isLongSession(0L, 5 * 3_600_000L))
    }
    @Test fun `base del chronometer resta el transcurrido`() {
        assertEquals(9_000L, chronometerBase(startedAt = 1_000L, now = 2_000L, elapsedRealtime = 10_000L))
    }
}
