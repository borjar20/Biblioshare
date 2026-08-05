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
        TimerLogic.set(m, "p1", 1000L)
        assertEquals(TimerLogic.Running("p1", 1000L), TimerLogic.get(m))
        TimerLogic.clear(m, "p1")
        assertNull(TimerLogic.get(m))
    }

    @Test fun `clear de otro pase no borra`() {
        val m = HashMap<String, String>()
        TimerLogic.set(m, "p1", 1L)
        TimerLogic.clear(m, "p2")
        assertNotNull(TimerLogic.get(m))
    }
}
