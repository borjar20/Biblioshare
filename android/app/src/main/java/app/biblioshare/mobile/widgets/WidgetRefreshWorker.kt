package app.biblioshare.mobile.widgets

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

// Refresco del widget con la app CERRADA. WorkManager lo ejecuta periódicamente
// respetando Doze y batería, y sobrevive a que se mate la app o se reinicie el
// móvil. doWork corre ya en un hilo de fondo, así que WidgetSync.refresh (con su
// red) puede llamarse directo.
class WidgetRefreshWorker(context: Context, params: WorkerParameters) :
    Worker(context, params) {
    override fun doWork(): Result = when (WidgetSync.refresh(applicationContext)) {
        // FAILED = transitorio (sin red o refresh de token falló): reintenta.
        WidgetSync.Result.FAILED -> Result.retry()
        // OK o NO_SESSION: nada más que hacer este ciclo.
        else -> Result.success()
    }
}
