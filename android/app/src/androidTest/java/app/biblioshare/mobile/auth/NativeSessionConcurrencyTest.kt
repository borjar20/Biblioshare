package app.biblioshare.mobile.auth

import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLStreamHandler
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class NativeSessionConcurrencyTest {
    @Test fun logoutWaitsForRefreshThenRemovesItsResult() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val refreshing = CountDownLatch(1)
        val release = CountDownLatch(1)
        val connections = java.util.concurrent.atomic.AtomicInteger()
        // All HTTP is in-memory in this disposable instrumentation process.
        URL.setURLStreamHandlerFactory { protocol ->
            if (protocol != "https") null else object : URLStreamHandler() {
                override fun openConnection(url: URL) = object : HttpURLConnection(url) {
                    override fun connect() {}
                    override fun disconnect() {}
                    override fun usingProxy() = false
                    override fun getOutputStream() = java.io.ByteArrayOutputStream()
                    override fun getResponseCode(): Int {
                        connections.incrementAndGet()
                        assertFalse("Session requests must not follow redirects", instanceFollowRedirects)
                        if (url.path.endsWith("/token")) {
                            refreshing.countDown()
                            check(release.await(10, TimeUnit.SECONDS))
                        }
                        return 200
                    }
                    override fun getInputStream() = (if (url.path.endsWith("/token"))
                        """{"access_token":"synthetic-access","refresh_token":"synthetic-new","expires_in":3600}"""
                        else "{}").byteInputStream()
                }
            }
        }
        val executor = Executors.newSingleThreadExecutor()
        assertNull(NativeSupabase.establish(context, "https://other.invalid", "synthetic-key", "synthetic-hash"))
        assertEquals(0, connections.get())
        NativeSessionStore.write(context, JSONObject().put("url", "https://vmutcradmodhiltuohys.supabase.co")
            .put("anon", "synthetic-public-key").put("access_token", "synthetic-old")
            .put("refresh_token", "synthetic-old").put("expires_at", 0))
        val logoutError = java.util.concurrent.atomic.AtomicReference<Throwable?>()
        val logout = Thread {
            try { NativeSupabase.signOut(context) } catch (error: Throwable) { logoutError.set(error) }
        }
        try {
            val refresh = executor.submit<String?> { NativeSupabase.rpc(context, "synthetic_test") }
            assertTrue(refreshing.await(10, TimeUnit.SECONDS))
            logout.start()
            val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
            while (logout.state != Thread.State.BLOCKED && logout.isAlive && System.nanoTime() < deadline) {
                Thread.sleep(10)
            }
            assertEquals("Logout must wait for the active refresh", Thread.State.BLOCKED, logout.state)
            release.countDown()
            assertEquals("{}", refresh.get(10, TimeUnit.SECONDS))
            logout.join(10000)
            assertFalse(logout.isAlive)
            assertNull(logoutError.get())
            assertFalse(NativeSupabase.hasSession(context))
            assertEquals(0, NativeSessionStore.read(context).length())
        } finally {
            release.countDown()
            logout.join(10000)
            executor.shutdownNow()
            NativeSessionStore.clear(context)
        }
    }
}
