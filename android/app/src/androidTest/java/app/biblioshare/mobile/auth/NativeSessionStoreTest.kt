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
    // Run only in the disposable emulator: instrumentation executes under the target UID.
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

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

    @Test fun replacesUnusableKeyAtNextHandoff() {
        NativeSessionStore.write(context, JSONObject().put("refresh_token", "old-synthetic"))
        // Replace the alias with a real Keystore key incompatible with GCM.
        val alias = "biblioshare.native-session.v1"
        java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(alias) }
        javax.crypto.KeyGenerator.getInstance("AES", "AndroidKeyStore").apply {
            init(android.security.keystore.KeyGenParameterSpec.Builder(alias,
                android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or
                    android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_CBC)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_PKCS7)
                .build())
        }.generateKey()
        NativeSessionStore.write(context, JSONObject().put("refresh_token", "new-synthetic"))
        assertEquals("new-synthetic", NativeSessionStore.read(context).getString("refresh_token"))
    }

    @Test fun missingKeyNeverRestoresLegacyAndAllowsNewSession() {
        NativeSessionStore.write(context, JSONObject().put("refresh_token", "lost-synthetic"))
        java.security.KeyStore.getInstance("AndroidKeyStore").apply {
            load(null); deleteEntry("biblioshare.native-session.v1")
        }
        context.getSharedPreferences("native_supabase", 0).edit()
            .putString("refresh_token", "stale-synthetic").commit()
        assertEquals(0, NativeSessionStore.read(context).length())
        NativeSessionStore.write(context, JSONObject().put("refresh_token", "new-synthetic"))
        assertEquals("new-synthetic", NativeSessionStore.read(context).getString("refresh_token"))
    }

    @Test fun signOutClearsEvenWhenSessionReadFails() {
        NativeSessionStore.write(context, JSONObject().put("refresh_token", "synthetic-session"))
        val unreadableOnce = object : ContextWrapper(context) {
            var first = true
            override fun getNoBackupFilesDir(): File {
                if (first) {
                    first = false
                    throw java.security.ProviderException("synthetic temporary read failure")
                }
                return super.getNoBackupFilesDir()
            }
        }
        NativeSupabase.signOut(unreadableOnce)
        assertEquals(0, NativeSessionStore.read(context).length())
    }
}
