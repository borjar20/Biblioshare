package app.biblioshare.mobile.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.security.InvalidKeyException
import java.security.UnrecoverableKeyException
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/** Session data never leaves noBackupFilesDir except as ciphertext. */
internal object NativeSessionStore {
    private const val KEY_ALIAS = "biblioshare.native-session.v1"
    private fun file(context: Context) = AtomicFile(File(context.noBackupFilesDir, "native-session.enc"))
    private val cipher = SessionCipher {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey) ?: KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore",
        ).apply {
            init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build())
        }.generateKey()
    }

    @Synchronized
    fun read(context: Context): JSONObject {
        val disk = file(context)
        val legacy = context.getSharedPreferences("native_supabase", Context.MODE_PRIVATE)
        if (disk.baseFile.exists()) {
            return try {
                val bytes = disk.readFully()
                // The zero-byte tombstone contains no secrets and needs no key.
                val result = if (bytes.isEmpty()) JSONObject()
                    else JSONObject(String(cipher.decrypt(bytes), Charsets.UTF_8))
                // Ciphertext stays authoritative even if legacy cleanup must retry.
                legacy.edit().clear().commit()
                result
            } catch (_: Exception) {
                // Missing/invalidated key or corrupt file: require a new native handoff.
                // Never fall back to a potentially stale plaintext refresh token.
                clear(context)
                JSONObject()
            }
        }
        val old = legacy.all
        if (old.isEmpty()) return JSONObject()
        return try {
            val migrated = JSONObject(old)
            write(context, migrated)
            migrated
        } catch (_: Exception) {
            // Fail closed if secure persistence is unavailable.
            clear(context)
            JSONObject()
        }
    }

    @Synchronized
    fun write(context: Context, value: JSONObject) {
        val plain = value.toString().toByteArray(Charsets.UTF_8)
        val encrypted = try {
            cipher.encrypt(plain)
        } catch (_: InvalidKeyException) {
            resetKey()
            cipher.encrypt(plain)
        } catch (_: UnrecoverableKeyException) {
            resetKey()
            cipher.encrypt(plain)
        }
        persist(context, encrypted)
    }

    private fun resetKey() {
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(KEY_ALIAS)
    }

    private fun persist(context: Context, encrypted: ByteArray) {
        val disk = file(context)
        val output = disk.startWrite()
        try {
            output.write(encrypted)
            disk.finishWrite(output)
        } catch (error: Exception) {
            disk.failWrite(output)
            throw error
        }
        context.getSharedPreferences("native_supabase", Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Synchronized
    fun clear(context: Context) {
        // A non-secret tombstone works even when Keystore is unavailable. Its
        // existence prevents legacy fallback after a crash/failed prefs flush.
        persist(context, byteArrayOf())
    }
}
