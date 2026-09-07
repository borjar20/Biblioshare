package app.biblioshare.mobile.auth

import java.security.GeneralSecurityException
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Versioned authenticated envelope; the key is supplied by Android Keystore. */
internal class SessionCipher(private val key: () -> SecretKey) {
    class InvalidEnvelopeException : GeneralSecurityException("Invalid session envelope")
    fun encrypt(plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(AAD)
        return byteArrayOf(1) + cipher.iv + cipher.doFinal(plain)
    }

    fun decrypt(envelope: ByteArray): ByteArray {
        if (envelope.size < 29 || envelope[0] != 1.toByte()) {
            throw InvalidEnvelopeException()
        }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, envelope.copyOfRange(1, 13)))
        cipher.updateAAD(AAD)
        return cipher.doFinal(envelope.copyOfRange(13, envelope.size))
    }

    companion object {
        private val AAD = "biblioshare.native-session.v1".toByteArray(Charsets.UTF_8)
    }
}
