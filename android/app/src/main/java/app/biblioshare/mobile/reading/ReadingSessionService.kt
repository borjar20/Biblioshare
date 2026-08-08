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
import app.biblioshare.mobile.widgets.WidgetRefresh
import app.biblioshare.mobile.widgets.WidgetSnapshotStore
import app.biblioshare.mobile.widgets.registerHref
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
            // sync puede llamarse desde background (WidgetSync/WorkManager): si no hay
            // exención de arranque de FGS, no crashear — la notificación aparecerá en la
            // siguiente interacción de widget o en primer plano.
            runCatching { ContextCompat.startForegroundService(context, intent) }
        } else {
            context.stopService(intent)
        }
    }

    /** Terminar desde la notificación: resuelve el deep-link con el elapsed REAL
     *  en el momento del toque, apaga la sesión y devuelve el href a abrir (o null
     *  si ya no hay sesión). Lo llama MainActivity — un getActivity directo, no un
     *  trampolín de notificación (prohibido en targetSdk 31+). */
    fun finishFromNotification(context: Context): String? {
        val r = TimerStore.get(context) ?: return null
        val href = registerHref(r, System.currentTimeMillis())
        TimerStore.clearFromWidget(context)
        sync(context)
        WidgetRefresh.updateAll(context)
        return href
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
        const val EXTRA_FINISH_SESSION = "biblioshareFinishSession"
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
            builder.addAction(0, context.getString(R.string.widget_register), finishActivity(context))
            builder.addAction(0, context.getString(R.string.widget_discard), broadcast(context, ReadingSessionReceiver.ACTION_DISCARD))
        }

        private fun broadcast(context: Context, action: String): PendingIntent =
            PendingIntent.getBroadcast(
                context, action.hashCode(),
                Intent(context, ReadingSessionReceiver::class.java).setAction(action),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        // Terminar/■: activity PendingIntent DIRECTO (no vía broadcast+startActivity),
        // que en targetSdk 31+ es un trampolín de notificación y se bloquea. MainActivity
        // resuelve el extra al lanzar y coloca el href de registro real.
        private fun finishActivity(context: Context): PendingIntent {
            val intent = Intent(context, app.biblioshare.mobile.MainActivity::class.java)
                .setAction(Intent.ACTION_VIEW)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(EXTRA_FINISH_SESSION, true)
            return PendingIntent.getActivity(
                context, "finishSession".hashCode(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        private fun openSession(context: Context, passId: String): PendingIntent =
            PendingIntent.getActivity(
                context, ("open$passId").hashCode(),
                WidgetDeepLinks.intentFor(context, "/sesion/$passId"),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
    }
}
