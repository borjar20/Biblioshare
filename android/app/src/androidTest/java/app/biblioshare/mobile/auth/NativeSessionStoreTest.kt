package app.biblioshare.mobile.auth

import androidx.test.platform.app.InstrumentationRegistry
import android.content.ContextWrapper
import android.content.SharedPreferences
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.io.File

class NativeSessionStoreTest {
    // Test APK context isolates synthetic sessions from the user's installed app.
    private val context = InstrumentationRegistry.getInstrumentation().context

    @Before fun reset() {
        NativeSessionStore.clear(context)
        File(context.noBackupFilesDir, "native-session.enc").delete()
    }
    @After fun cleanup() = NativeSessionStore.clear(context)

    @Test fun persistsEncryptedAndClears() {
        NativeSessionStore.write(context, JSONObject().put("refresh_token", "synthetic-refresh"))
        assertEquals("synthetic-refresh", NativeSessionStore.read(context).getString("refresh_token"))
        assertFalse(File(context.noBackupFilesDir, "native-session.enc").readText().contains("synthetic-refresh"))
        NativeSessionStore.clear(context)
        assertEquals(0, NativeSessionStore.read(context).length())
    }

    @Test fun migratesLegacyOnceAndRejectsCorruption() {
        val prefs = context.getSharedPreferences("native_supabase", 0)
        assertTrue(prefs.edit().putString("refresh_token", "synthetic-legacy").commit())
        assertEquals("synthetic-legacy", NativeSessionStore.read(context).getString("refresh_token"))
        assertTrue(prefs.all.isEmpty())
        File(context.noBackupFilesDir, "native-session.enc").writeBytes(byteArrayOf(1, 2))
        assertEquals(0, NativeSessionStore.read(context).length())
    }

    @Test fun logoutTombstoneWinsEvenWhenLegacyCleanupCannotFlush() {
        val legacy = context.getSharedPreferences("native_supabase", 0)
        assertTrue(legacy.edit().putString("refresh_token", "synthetic-stale").commit())
        val failingCleanup = object : ContextWrapper(context) {
            override fun getSharedPreferences(name: String, mode: Int): SharedPreferences =
                object : SharedPreferences by legacy {
                    override fun edit(): SharedPreferences.Editor =
                        object : SharedPreferences.Editor by legacy.edit() {
                            override fun clear(): SharedPreferences.Editor = this
                            override fun commit() = false
                        }
                }
        }
        assertEquals("synthetic-stale", NativeSessionStore.read(failingCleanup).getString("refresh_token"))
        assertTrue(legacy.contains("refresh_token"))
        NativeSessionStore.clear(failingCleanup)
        assertEquals(0, NativeSessionStore.read(failingCleanup).length())
        assertTrue(legacy.contains("refresh_token"))
    }
}
