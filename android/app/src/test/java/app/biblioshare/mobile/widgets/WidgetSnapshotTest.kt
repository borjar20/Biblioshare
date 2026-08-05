package app.biblioshare.mobile.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Date

// Tests JVM del lado nativo: parseo/validación del snapshot (el contrato con
// src/lib/widgets/types.ts), fechas y validación de rutas de deep link.

private fun validJson(
    version: Int = WIDGET_SCHEMA_VERSION,
    userId: String = "user-1",
): String = """
    {
      "version": $version,
      "userId": "$userId",
      "generatedAt": "2026-08-05T10:00:00.000Z",
      "currentProgress": {
        "passId": "pass-1",
        "itemType": "book",
        "itemId": "item-1",
        "title": "Dune",
        "subtitle": "Frank Herbert",
        "coverUrl": "https://covers.example/dune.jpg",
        "currentValue": 184,
        "totalValue": 430,
        "percentage": 43,
        "progressLabel": "184 de 430 páginas",
        "statusLabel": "Últ. actividad 03/08",
        "deepLink": "/sesion/pass-1"
      },
      "dailyGoal": {
        "date": "2026-08-05",
        "goalType": "minutes",
        "currentValue": 32,
        "targetValue": 40,
        "percentage": 80,
        "progressLabel": "32 / 40 min",
        "message": "Te quedan 8 minutos",
        "streak": 12,
        "completed": false,
        "deepLink": "/"
      }
    }
""".trimIndent()

class WidgetSnapshotTest {

    @Test
    fun `parsea un snapshot completo`() {
        val snapshot = WidgetSnapshot.parse(validJson())
        assertNotNull(snapshot)
        assertEquals("user-1", snapshot!!.userId)
        assertEquals("Dune", snapshot.currentProgress?.title)
        assertEquals(43, snapshot.currentProgress?.percentage)
        assertEquals(40, snapshot.dailyGoal?.targetValue)
        assertEquals(12, snapshot.dailyGoal?.streak)
    }

    @Test
    fun `los bloques null son estados validos (nada en curso, sin objetivo)`() {
        val snapshot = WidgetSnapshot.parse(
            """{"version": $WIDGET_SCHEMA_VERSION, "userId": "u", "generatedAt": "2026-08-05T10:00:00Z",
                "currentProgress": null, "dailyGoal": null}""",
        )
        assertNotNull(snapshot)
        assertNull(snapshot!!.currentProgress)
        assertNull(snapshot.dailyGoal)
    }

    @Test
    fun `totalValue y percentage null se conservan (progreso sin total conocido)`() {
        val json = validJson()
            .replace("\"totalValue\": 430", "\"totalValue\": null")
            .replace("\"percentage\": 43", "\"percentage\": null")
        val progress = WidgetSnapshot.parse(json)!!.currentProgress!!
        assertNull(progress.totalValue)
        assertNull(progress.percentage)
    }

    @Test
    fun `version distinta se descarta entera (migracion = estado vacio)`() {
        assertNull(WidgetSnapshot.parse(validJson(version = 2)))
        assertNull(WidgetSnapshot.parse(validJson(version = 0)))
    }

    @Test
    fun `json corrupto o incompleto devuelve null, nunca lanza`() {
        assertNull(WidgetSnapshot.parse(null))
        assertNull(WidgetSnapshot.parse(""))
        assertNull(WidgetSnapshot.parse("{no es json"))
        assertNull(WidgetSnapshot.parse("""{"version": $WIDGET_SCHEMA_VERSION}"""))
        assertNull(WidgetSnapshot.parse(validJson(userId = "")))
        // currentProgress sin campos requeridos → el parse entero se invalida.
        assertNull(
            WidgetSnapshot.parse(
                """{"version": $WIDGET_SCHEMA_VERSION, "userId": "u", "generatedAt": "x",
                    "currentProgress": {"title": "suelto"}, "dailyGoal": null}""",
            ),
        )
    }
}

class WidgetTimeTest {

    @Test
    fun `todayLocalISO formatea el calendario local`() {
        // 2026-08-05 12:00 local, sea cual sea la zona del runner.
        @Suppress("DEPRECATION")
        val date = Date(2026 - 1900, 7, 5, 12, 0, 0)
        assertEquals("2026-08-05", todayLocalISO(date))
    }

    @Test
    fun `isOlderThanHours distingue snapshot fresco de antiguo`() {
        val now = 1_754_388_000_000L // 2026-08-05T10:00:00Z aprox (valor fijo)
        val generated = "2026-08-05T09:00:00.000Z"
        val generatedMillis = 1_785_920_400_000L
        // Usamos el propio parse del helper: 1h después NO es viejo a 48h…
        assertFalse(isOlderThanHours(generated, 48, generatedMillis + 3_600_000L))
        // …y 49h después sí.
        assertTrue(isOlderThanHours(generated, 48, generatedMillis + 49 * 3_600_000L))
        // Formato raro: tolerante, no marca antiguo.
        assertFalse(isOlderThanHours("ayer", 48, now))
    }
}

class WidgetDeepLinksTest {

    @Test
    fun `acepta rutas internas absolutas`() {
        assertEquals("/sesion/abc", WidgetDeepLinks.safeInternalPath("/sesion/abc"))
        assertEquals("/coleccion", WidgetDeepLinks.safeInternalPath("/coleccion"))
    }

    @Test
    fun `rechaza esquemas, protocol-relative y basura`() {
        assertEquals("/", WidgetDeepLinks.safeInternalPath(null))
        assertEquals("/", WidgetDeepLinks.safeInternalPath(""))
        assertEquals("/", WidgetDeepLinks.safeInternalPath("//evil.com"))
        assertEquals("/", WidgetDeepLinks.safeInternalPath("https://evil.com/x"))
        assertEquals("/", WidgetDeepLinks.safeInternalPath("javascript://alert(1)"))
        assertEquals("/", WidgetDeepLinks.safeInternalPath("relativa"))
        assertEquals("/", WidgetDeepLinks.safeInternalPath("/\\evil.com"))
        assertEquals("/", WidgetDeepLinks.safeInternalPath("/ok\nmal"))
    }
}
