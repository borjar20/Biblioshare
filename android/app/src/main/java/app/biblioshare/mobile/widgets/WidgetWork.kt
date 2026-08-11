package app.biblioshare.mobile.widgets

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

// Programación del refresco de widgets en segundo plano (WorkManager). El ciclo
// de la sesión nativa manda: se programa al establecerla y se cancela al
// cerrarla — sin sesión no hay nada que traer. El refresco inmediato con la app
// en primer plano NO pasa por aquí: el plugin lo hace en un Thread (más ágil y
// sin la latencia de encolar). 30 min es un equilibrio; el mínimo de WorkManager
// para trabajo periódico son 15.
object WidgetWork {
    private const val PERIODIC = "widget_refresh_periodic"

    fun schedulePeriodic(context: Context) {
        val req = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(30, TimeUnit.MINUTES)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .build()
        // KEEP: no reprograma (ni resetea el temporizador) si ya estaba en marcha.
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req,
        )
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
    }
}
