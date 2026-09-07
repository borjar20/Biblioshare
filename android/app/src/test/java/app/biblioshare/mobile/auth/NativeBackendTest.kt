package app.biblioshare.mobile.auth

import org.junit.Assert.*
import org.junit.Test

class NativeBackendTest {
    @Test fun allowsOnlyTheConfiguredBase() {
        assertTrue(NativeBackend.acceptsBase(NativeBackend.ORIGIN))
        assertTrue(NativeBackend.acceptsBase("${NativeBackend.ORIGIN}/"))
        for (url in listOf("https://other.invalid", "http://vmutcradmodhiltuohys.supabase.co",
            "${NativeBackend.ORIGIN}/path", "${NativeBackend.ORIGIN}?query=1")) {
            assertFalse(url, NativeBackend.acceptsBase(url))
        }
    }

    @Test fun checksTheOriginBoundaryForStoredSessions() {
        assertTrue(NativeBackend.acceptsRequest("${NativeBackend.ORIGIN}/auth/v1/token"))
        assertFalse(NativeBackend.acceptsRequest("https://other.invalid/auth/v1/token"))
        assertFalse(NativeBackend.acceptsRequest("${NativeBackend.ORIGIN}.invalid/auth/v1/token"))
        assertFalse(NativeBackend.acceptsRequest("${NativeBackend.ORIGIN}:8443/auth/v1/token"))
    }
}
