package app.biblioshare.mobile.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

// TimerLogic es pura (Map<String,String> en vez de SharedPreferences real) porque
// el módulo no trae Robolectric — el resto de tests aquí son JVM puro. TimerStore
// (wrapper con Context) delega en las mismas claves y no se testea por separado.

class TimerStoreTest {
    @Test fun `roundtrip start-get-clear`() {
        val m = HashMap<String, String>()
        TimerLogic.start(m, "p1", 1000L)
        assertEquals(TimerLogic.Running("p1", 1000L, 1000L, 0L, true), TimerLogic.get(m))
        TimerLogic.clear(m, "p1")
        assertNull(TimerLogic.get(m))
    }

    @Test fun `clear de otro pase no borra`() {
        val m = HashMap<String, String>()
        TimerLogic.start(m, "p1", 1L)
        TimerLogic.clear(m, "p2")
        assertNotNull(TimerLogic.get(m))
    }

    @Test fun `ancla e inicio se guardan por separado (pausa+reanudacion)`() {
        // Espejo app→nativo tras pausar+reanudar: ancla efectiva 10:50, inicio real 10:00.
        val m = HashMap<String, String>()
        TimerLogic.set(m, "p1", startedAt = 10_50L, firstStartedAt = 10_00L, accumulatedMs = 0L, running = true)
        assertEquals(10_50L, TimerLogic.get(m)!!.startedAt)      // manda los minutos/reloj
        assertEquals(10_00L, TimerLogic.get(m)!!.firstStartedAt) // manda "Cuándo lees"
    }

    @Test fun `clearFromWidget apaga y deja lapida con el inicio real`() {
        val m = HashMap<String, String>()
        TimerLogic.set(m, "p1", startedAt = 555L, firstStartedAt = 200L, accumulatedMs = 0L, running = true)
        TimerLogic.clearFromWidget(m)
        assertNull(TimerLogic.get(m))
        assertEquals(TimerLogic.Cleared("p1", 200L), TimerLogic.getCleared(m))
    }

    @Test fun `set pisa la lapida (nueva sesion la anula)`() {
        val m = HashMap<String, String>()
        TimerLogic.start(m, "p1", 1L)
        TimerLogic.clearFromWidget(m)
        assertNotNull(TimerLogic.getCleared(m))
        TimerLogic.start(m, "p2", 2L)
        assertNull(TimerLogic.getCleared(m))
    }

    @Test fun `clearTombstone de otro pase no la borra`() {
        val m = HashMap<String, String>()
        TimerLogic.start(m, "p1", 1L)
        TimerLogic.clearFromWidget(m)
        TimerLogic.clearTombstone(m, "p2")
        assertNotNull(TimerLogic.getCleared(m))
        TimerLogic.clearTombstone(m, "p1")
        assertNull(TimerLogic.getCleared(m))
    }

    // ── Pausa (#498, Fase B) ─────────────────────────────────────────────────
    @Test fun `elapsed corriendo cuenta desde el ancla, pausado es el acumulado`() {
        val running = TimerLogic.Running("p1", startedAt = 1_000L, firstStartedAt = 1_000L, accumulatedMs = 0L, running = true)
        assertEquals(500L, elapsedMs(running, now = 1_500L))
        val paused = running.copy(running = false, accumulatedMs = 500L)
        assertEquals(500L, elapsedMs(paused, now = 9_999L)) // congelado
    }

    @Test fun `pause banca el elapsed, resume reancla sin perderlo`() {
        val m = HashMap<String, String>()
        TimerLogic.start(m, "p1", now = 1_000L)                 // ancla=1000, acc=0, corriendo
        TimerLogic.pause(m, now = 1_500L)                       // acc=500, pausado
        assertEquals(500L, elapsedMs(TimerLogic.get(m)!!, now = 9_999L))
        TimerLogic.resume(m, now = 2_000L)                      // ancla = 2000-500 = 1500
        assertEquals(700L, elapsedMs(TimerLogic.get(m)!!, now = 2_200L)) // 500 + 200
    }

    @Test fun `set (espejo app) restaura estado pausado`() {
        val m = HashMap<String, String>()
        TimerLogic.set(m, "p1", startedAt = 0L, firstStartedAt = 100L, accumulatedMs = 800L, running = false)
        val r = TimerLogic.get(m)!!
        assertEquals(false, r.running)
        assertEquals(800L, elapsedMs(r, now = 5_000L))
        assertEquals(100L, r.firstStartedAt)
    }
}
