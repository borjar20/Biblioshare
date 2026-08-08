// ReadingSessionService.kt
package app.biblioshare.mobile.reading

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import app.biblioshare.mobile.R
import app.biblioshare.mobile.widgets.TimerStore
import app.biblioshare.mobile.widgets.WidgetDeepLinks
import app.biblioshare.mobile.widgets.WidgetImageCache
import app.biblioshare.mobile.widgets.WidgetSnapshotStore
import android.app.PendingIntent

// Arranca/actualiza/para la notificación de sesión. NO guarda estado: en cada
// sync lee TimerStore (la única fuente de verdad) + el snapshot para el título
// y la portada. El reloj lo tickea el sistema (setUsesChronometer), no un
// proceso vivo — igual que el Chronometer del widget.
object ReadingSessionController {
    fun sync(context: Context) {
        val intent = Intent(context, ReadingSessionService::class.java)
            .setAction(ReadingSessionService.ACTION_SYNC)
        if (TimerStore.get(context) != null) {
            // Exención de arranque de FGS en background: "el usuario interactúa
            // con un widget" (los puntos de arranque son StartTimerAction y el
            // espejo setRunningTimer en primer plano).
            ContextCompat.startForegroundService(context, intent)
        } else {
            context.stopService(intent)
        }
    }
}

class ReadingSessionService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val running = TimerStore.get(this)
        val snapshot = WidgetSnapshotStore.load(this)
        val model = readingNotificationModel(running, snapshot, System.currentTimeMillis())
        if (model == null) {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        ensureChannel(this)
        // Sin portada primero para no rebasar el plazo de startForeground; se
        // recarga en un hilo y se re-notifica con largeIcon.
        startForeground(NOTIF_ID, buildNotification(this, model, cover = null))
        loadCoverAndRefresh(model)
        return START_STICKY
    }

    private fun loadCoverAndRefresh(model: ReadingNotificationModel) {
        val url = model.coverUrl ?: return
        Thread {
            WidgetImageCache.ensureDownloaded(this, url)
            val cover = WidgetImageCache.loadBitmap(this, url) ?: return@Thread
            val current = TimerStore.get(this)
            if (current == null || current.passId != model.passId) return@Thread // sesión terminada o cambiada
            // La MISMA notificación (NOTIF_ID) con la portada. En 33+ requiere
            // POST_NOTIFICATIONS; si falta, la notif del FGS ya está puesta y
            // esto solo la enriquece — se ignora el fallo.
            runCatching { NotificationManagerCompat.from(this).notify(NOTIF_ID, buildNotification(this, model, cover)) }
        }.start()
    }

    companion object {
        const val ACTION_SYNC = "app.biblioshare.mobile.reading.SYNC"
        const val NOTIF_ID = 4820
        const val CHANNEL_ID = "reading_session"

        fun ensureChannel(context: Context) {
            val mgr = context.getSystemService(NotificationManager::class.java)
            if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
                mgr.createNotificationChannel(
                    NotificationChannel(
                        CHANNEL_ID,
                        context.getString(R.string.reading_channel_name),
                        NotificationManager.IMPORTANCE_LOW,
                    ).apply { setShowBadge(false) },
                )
            }
        }

        fun buildNotification(context: Context, model: ReadingNotificationModel, cover: Bitmap?): android.app.Notification {
            val title = model.title ?: context.getString(R.string.reading_notification_default_title)
            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_reading)
                .setContentTitle(title)
                .setOngoing(true)
                .setSilent(true)
                .setOnlyAlertOnce(true)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setContentIntent(openSession(context, model.passId))
            if (cover != null) builder.setLargeIcon(cover)
            when {
                model.running && !model.longSession ->
                    builder.setUsesChronometer(true).setWhen(model.whenBase).setShowWhen(true)
                        .setContentText(context.getString(R.string.reading_notification_reading))
                !model.running ->
                    builder.setShowWhen(false)
                        .setContentText(context.getString(R.string.reading_notification_paused, model.frozenElapsed))
                else ->
                    builder.setShowWhen(false)
                        .setContentText(context.getString(R.string.reading_notification_long))
            }
            addActions(context, builder, model)
            return builder.build()
        }

        internal fun addActions(context: Context, builder: NotificationCompat.Builder, model: ReadingNotificationModel) {
            val toggle = if (model.running) {
                context.getString(R.string.widget_pause) to ReadingSessionReceiver.ACTION_PAUSE
            } else {
                context.getString(R.string.widget_resume) to ReadingSessionReceiver.ACTION_RESUME
            }
            builder.addAction(0, toggle.first, broadcast(context, toggle.second))
            builder.addAction(0, context.getString(R.string.widget_register), broadcast(context, ReadingSessionReceiver.ACTION_FINISH))
            builder.addAction(0, context.getString(R.string.widget_discard), broadcast(context, ReadingSessionReceiver.ACTION_DISCARD))
        }

        private fun broadcast(context: Context, action: String): PendingIntent =
            PendingIntent.getBroadcast(
                context, action.hashCode(),
                Intent(context, ReadingSessionReceiver::class.java).setAction(action),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        private fun openSession(context: Context, passId: String): PendingIntent =
            PendingIntent.getActivity(
                context, ("open$passId").hashCode(),
                WidgetDeepLinks.intentFor(context, "/sesion/$passId"),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
    }
}
