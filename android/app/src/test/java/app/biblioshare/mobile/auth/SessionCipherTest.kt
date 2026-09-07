package app.biblioshare.mobile.auth

import org.junit.Assert.*
import org.junit.Test
import javax.crypto.KeyGenerator

class SessionCipherTest {
    private fun key() = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()

    @Test fun roundTripAndRandomIv() {
        val key = key()
        val cipher = SessionCipher { key }
        val plain = "synthetic-session".toByteArray()
        val first = cipher.encrypt(plain)
        val second = cipher.encrypt(plain)
        assertArrayEquals(plain, cipher.decrypt(first))
        assertArrayEquals(plain, cipher.decrypt(second))
        assertFalse(first.contentEquals(second))
        assertFalse(String(first).contains("synthetic-session"))
    }

    @Test fun rejectsTamperingAndDifferentKeys() {
        val key = key()
        val cipher = SessionCipher { key }
        val encrypted = cipher.encrypt("synthetic-session".toByteArray())
        val changed = encrypted.clone().also { it[it.lastIndex] = (it.last().toInt() xor 1).toByte() }
        assertThrows(Exception::class.java) { cipher.decrypt(changed) }
        assertThrows(Exception::class.java) { SessionCipher { key() }.decrypt(encrypted) }
        assertThrows(Exception::class.java) { cipher.decrypt(byteArrayOf(1)) }
    }
}
