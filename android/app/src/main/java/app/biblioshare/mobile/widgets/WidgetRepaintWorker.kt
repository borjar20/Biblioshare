package app.biblioshare.mobile.widgets

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.glance.appwidget.updateAll
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters

// Repinta los widgets desde el estado/store LOCAL (sin red) pero desde un estado
// de proceso ELEVADO (WorkManager expedited), que One UI/Samsung honra de forma
// fiable — el empuje directo desde el broadcast de la acción se estrangula
// intermitentemente en segundo plano (#498, diagnóstico por logcat). No hace
// fetch: la RPC es cosa de WidgetRefreshWorker.
class WidgetRepaintWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        Log.i("BiblioshareWidgets", "WidgetRepaintWorker → updateAll")
        runCatching { CurrentProgressWidget().updateAll(applicationContext) }
        runCatching { QuickRegisterWidget().updateAll(applicationContext) }
        return Result.success()
    }

    // Requerido para expedited en API < 31 (foreground service). En API 31+ no se usa.
    override suspend fun getForegroundInfo(): ForegroundInfo {
        val channelId = "widget_repaint"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = applicationContext.getSystemService(NotificationManager::class.java)
            if (mgr.getNotificationChannel(channelId) == null) {
                mgr.createNotificationChannel(
                    NotificationChannel(
                        channelId,
                        "Actualización de widgets",
                        NotificationManager.IMPORTANCE_MIN,
                    ),
                )
            }
        }
        val notification: Notification = NotificationCompat.Builder(applicationContext, channelId)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Actualizando widget…")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .build()
        return ForegroundInfo(0xB1B1, notification)
    }
}
