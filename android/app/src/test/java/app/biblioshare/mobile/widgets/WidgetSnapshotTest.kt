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
      "inProgressTotal": 1,
      "inProgress": [
        {
          "passId": "pass-1",
          "itemType": "book",
          "itemId": "item-1",
          "title": "Dune",
          "subtitle": "Frank Herbert",
          "coverUrl": "https://covers.example/dune.jpg",
          "percentage": 43,
          "progressLabel": "184 de 430 páginas",
          "deepLink": "/sesion/pass-1",
          "nthLabel": "1.ª lectura",
          "contextLabel": "Día 4 · desde 2/8 · 1 nota",
          "streakDays": 3,
          "kindLabel": "Libro",
          "week": []
        }
      ],
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

private fun v2Json() = """
{ "version":2, "userId":"u1", "generatedAt":"2026-08-05T10:00:00Z",
  "inProgressTotal":2, "dailyGoal":null,
  "inProgress":[
    {"passId":"p1","itemType":"book","itemId":"b1","title":"Salitre y Cenizas",
     "subtitle":null,"coverUrl":null,"percentage":25,"progressLabel":"60 de 240 páginas",
     "deepLink":"/sesion/p1","nthLabel":"1.ª lectura","contextLabel":"Día 4 · desde 2/8 · 1 nota",
     "streakDays":3,"kindLabel":"Libro",
     "week":[{"active":false,"today":false},{"active":false,"today":false},
             {"active":false,"today":false},{"active":true,"today":false},
             {"active":true,"today":false},{"active":true,"today":false},
             {"active":true,"today":true}]},
    {"passId":"p2","itemType":"book","itemId":"b2","title":"Siega","subtitle":null,
     "coverUrl":null,"percentage":null,"progressLabel":"Sin progreso","deepLink":"/sesion/p2",
     "nthLabel":"1.ª lectura","contextLabel":"","streakDays":0,"kindLabel":"Libro","week":[]}
  ] }
""".trimIndent()

class WidgetSnapshotTest {

    @Test
    fun `parsea un snapshot completo`() {
        val snapshot = WidgetSnapshot.parse(validJson())
        assertNotNull(snapshot)
        assertEquals("user-1", snapshot!!.userId)
        assertEquals(1, snapshot.inProgress.size)
        assertEquals("Dune", snapshot.inProgress[0].title)
        assertEquals(43, snapshot.inProgress[0].percentage)
        assertEquals(40, snapshot.dailyGoal?.targetValue)
        assertEquals(12, snapshot.dailyGoal?.streak)
    }

    @Test
    fun `inProgress vacio y dailyGoal null son estados validos (nada en curso, sin objetivo)`() {
        val snapshot = WidgetSnapshot.parse(
            """{"version": $WIDGET_SCHEMA_VERSION, "userId": "u", "generatedAt": "2026-08-05T10:00:00Z",
                "inProgressTotal": 0, "inProgress": [], "dailyGoal": null}""",
        )
        assertNotNull(snapshot)
        assertTrue(snapshot!!.inProgress.isEmpty())
        assertNull(snapshot.dailyGoal)
    }

    @Test
    fun `percentage null se conserva (progreso sin total conocido)`() {
        val json = validJson().replace("\"percentage\": 43", "\"percentage\": null")
        val progress = WidgetSnapshot.parse(json)!!.inProgress[0]
        assertNull(progress.percentage)
    }

    @Test
    fun `version distinta se descarta entera (migracion = estado vacio)`() {
        assertNull(WidgetSnapshot.parse(validJson(version = 1)))
        assertNull(WidgetSnapshot.parse(validJson(version = 0)))
    }

    @Test
    fun `json corrupto o incompleto devuelve null, nunca lanza`() {
        assertNull(WidgetSnapshot.parse(null))
        assertNull(WidgetSnapshot.parse(""))
        assertNull(WidgetSnapshot.parse("{no es json"))
        assertNull(WidgetSnapshot.parse("""{"version": $WIDGET_SCHEMA_VERSION}"""))
        assertNull(WidgetSnapshot.parse(validJson(userId = "")))
    }

    @Test fun `parsea snapshot v2 con lista de en curso`() {
        val s = WidgetSnapshot.parse(v2Json())!!
        assertEquals(2, s.inProgress.size)
        assertEquals(2, s.inProgressTotal)
        assertEquals("1.ª lectura", s.inProgress[0].nthLabel)
        assertEquals(7, s.inProgress[0].week.size)
        assertTrue(s.inProgress[0].week.last().today)
        assertNull(s.inProgress[1].percentage)
    }

    @Test fun `descarta version distinta`() {
        assertNull(WidgetSnapshot.parse(v2Json().replace("\"version\":2", "\"version\":1")))
    }

    @Test fun `inProgress ausente o ilegible degrada a lista vacia`() {
        val s = WidgetSnapshot.parse(
            """{"version":2,"userId":"u1","generatedAt":"x","inProgressTotal":0}""",
        )!!
        assertTrue(s.inProgress.isEmpty())
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
