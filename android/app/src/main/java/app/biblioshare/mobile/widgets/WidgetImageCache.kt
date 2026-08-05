package app.biblioshare.mobile.widgets

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

// Caché de portadas para los widgets: ficheros PNG pequeños en el almacenamiento
// privado de la app, con nombre estable derivado de la URL. La poda mantiene
// solo las portadas que el snapshot vigente referencia, así el directorio queda
// acotado a un puñado de ficheros sin contador de bytes ni política LRU.
// ponytail: poda por referencia, no por tamaño; si algún día un widget lista N
// portadas, añadir límite de bytes.
object WidgetImageCache {
    private const val TAG = "BiblioshareWidgets"
    private const val DIR = "widget_covers"

    // Suficiente para una celda de widget en pantallas densas; mantiene el PNG
    // en decenas de KB y el Bitmap muy por debajo del límite de RemoteViews.
    private const val MAX_DIM = 400

    private fun dir(context: Context): File =
        File(context.filesDir, DIR).apply { mkdirs() }

    private fun fileFor(context: Context, url: String): File {
        val digest = MessageDigest.getInstance("SHA-256").digest(url.toByteArray())
        val name = digest.joinToString("") { "%02x".format(it) }
        return File(dir(context), "$name.png")
    }

    /** El bitmap cacheado, o null si no está descargado o no se puede decodificar. */
    fun loadBitmap(context: Context, url: String): Bitmap? {
        val file = fileFor(context, url)
        if (!file.exists()) return null
        return try {
            BitmapFactory.decodeFile(file.absolutePath)
        } catch (e: Exception) {
            Log.w(TAG, "portada ilegible, se descarta: ${file.name}", e)
            file.delete()
            null
        }
    }

    /**
     * Descarga y escala la portada si no está ya en caché. Best-effort y
     * síncrona: llamar SIEMPRE desde un hilo de fondo y nunca dejar que su
     * fallo bloquee la actualización del texto del widget.
     * @return true si al terminar hay fichero utilizable.
     */
    fun ensureDownloaded(context: Context, url: String): Boolean {
        val file = fileFor(context, url)
        if (file.exists()) return true
        return try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            val bitmap = connection.inputStream.use(BitmapFactory::decodeStream)
                ?: return false
            val scaled = scaleDown(bitmap)
            val tmp = File(file.parentFile, "${file.name}.tmp")
            tmp.outputStream().use { scaled.compress(Bitmap.CompressFormat.PNG, 90, it) }
            tmp.renameTo(file)
        } catch (e: Exception) {
            Log.w(TAG, "descarga de portada fallida (se queda el placeholder)", e)
            false
        }
    }

    private fun scaleDown(bitmap: Bitmap): Bitmap {
        val largest = maxOf(bitmap.width, bitmap.height)
        if (largest <= MAX_DIM) return bitmap
        val factor = MAX_DIM.toFloat() / largest
        return Bitmap.createScaledBitmap(
            bitmap,
            (bitmap.width * factor).toInt().coerceAtLeast(1),
            (bitmap.height * factor).toInt().coerceAtLeast(1),
            true,
        )
    }

    /** Borra todo lo que el snapshot vigente no referencia. */
    fun prune(context: Context, keepUrls: Set<String>) {
        val keep = keepUrls.map { fileFor(context, it).name }.toSet()
        dir(context).listFiles()?.forEach { if (it.name !in keep) it.delete() }
    }

    fun clear(context: Context) {
        dir(context).listFiles()?.forEach { it.delete() }
    }
}
