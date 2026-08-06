package app.biblioshare.mobile.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

// TimerLogic es pura (Map<String,String> en vez de SharedPreferences real) porque
// el módulo no trae Robolectric — el resto de tests aquí son JVM puro. TimerStore
// (wrapper con Context) delega en las mismas claves y no se testea por separado.

class TimerStoreTest {
    @Test fun `roundtrip set-get-clear`() {
        val m = HashMap<String, String>()
        TimerLogic.set(m, "p1", 1000L, 1000L)
        assertEquals(TimerLogic.Running("p1", 1000L, 1000L), TimerLogic.get(m))
        TimerLogic.clear(m, "p1")
        assertNull(TimerLogic.get(m))
    }

    @Test fun `clear de otro pase no borra`() {
        val m = HashMap<String, String>()
        TimerLogic.set(m, "p1", 1L, 1L)
        TimerLogic.clear(m, "p2")
        assertNotNull(TimerLogic.get(m))
    }

    @Test fun `ancla e inicio se guardan por separado (pausa+reanudacion)`() {
        // Tras pausar+reanudar en la app: ancla efectiva 10:50, inicio real 10:00.
        val m = HashMap<String, String>()
        TimerLogic.set(m, "p1", startedAt = 10_50L, firstStartedAt = 10_00L)
        assertEquals(10_50L, TimerLogic.get(m)!!.startedAt)      // manda los minutos/reloj
        assertEquals(10_00L, TimerLogic.get(m)!!.firstStartedAt) // manda "Cuándo lees"
    }

    @Test fun `clearFromWidget apaga y deja lapida con el inicio real`() {
        val m = HashMap<String, String>()
        TimerLogic.set(m, "p1", startedAt = 555L, firstStartedAt = 200L)
        TimerLogic.clearFromWidget(m)
        assertNull(TimerLogic.get(m))
        assertEquals(TimerLogic.Cleared("p1", 200L), TimerLogic.getCleared(m))
    }

    @Test fun `set pisa la lapida (nueva sesion la anula)`() {
        val m = HashMap<String, String>()
        TimerLogic.set(m, "p1", 1L, 1L)
        TimerLogic.clearFromWidget(m)
        assertNotNull(TimerLogic.getCleared(m))
        TimerLogic.set(m, "p2", 2L, 2L)
        assertNull(TimerLogic.getCleared(m))
    }

    @Test fun `clearTombstone de otro pase no la borra`() {
        val m = HashMap<String, String>()
        TimerLogic.set(m, "p1", 1L, 1L)
        TimerLogic.clearFromWidget(m)
        TimerLogic.clearTombstone(m, "p2")
        assertNotNull(TimerLogic.getCleared(m))
        TimerLogic.clearTombstone(m, "p1")
        assertNull(TimerLogic.getCleared(m))
    }
}
