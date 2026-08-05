package app.biblioshare.mobile.widgets

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import app.biblioshare.mobile.R

// Widget «En curso»: el elemento principal que tienes a medias. La SELECCIÓN
// no vive aquí: la decide el servidor con la misma regla que la tarjeta de
// hoy del dashboard (getTodayFocus → sesión más reciente; decisión de usuario
// 2026-07-17) y llega ya resuelta en el snapshot. Aquí solo se pinta.
class CurrentProgressWidget : GlanceAppWidget() {

    companion object {
        private val COMPACT = DpSize(110.dp, 110.dp)
        private val HORIZONTAL = DpSize(240.dp, 110.dp)
    }

    override val sizeMode = SizeMode.Responsive(setOf(COMPACT, HORIZONTAL))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // I/O fuera de la composición: store y bitmap se resuelven una vez aquí.
        val snapshot = WidgetSnapshotStore.load(context)
        val data = snapshot?.currentProgress
        val stale = snapshot != null && isOlderThanHours(snapshot.generatedAt, 48)
        val cover = data?.coverUrl?.let { WidgetImageCache.loadBitmap(context, it) }
        provideContent {
            when {
                snapshot == null -> WidgetCard("/") {
                    EmptyState(
                        LocalContext.current.getString(R.string.widget_open_app_title),
                        LocalContext.current.getString(R.string.widget_open_app_subtitle),
                    )
                }
                data == null -> WidgetCard("/coleccion") {
                    EmptyState(
                        LocalContext.current.getString(R.string.widget_nothing_in_progress),
                        LocalContext.current.getString(R.string.widget_open_to_start),
                    )
                }
                else -> WidgetCard(data.deepLink) {
                    if (LocalSize.current.width >= 240.dp) Horizontal(data, cover, stale)
                    else Compact(data, cover)
                }
            }
        }
    }
}

class CurrentProgressWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CurrentProgressWidget()
}

@Composable
private fun Compact(data: CurrentProgressData, cover: Bitmap?) {
    Column(modifier = GlanceModifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Cover(cover, width = 38, height = 54)
            Spacer(GlanceModifier.width(8.dp))
            Column {
                Text(data.title, style = titleStyle(), maxLines = 2)
                Text(
                    if (data.percentage != null) "${data.percentage} %" else data.progressLabel,
                    style = softStyle(),
                    maxLines = 1,
                )
            }
        }
        Spacer(GlanceModifier.defaultWeight())
        ProgressLine(data)
    }
}

@Composable
private fun Horizontal(data: CurrentProgressData, cover: Bitmap?, stale: Boolean) {
    val context = LocalContext.current
    Row(modifier = GlanceModifier.fillMaxSize()) {
        Cover(cover, width = 56, height = 80)
        Spacer(GlanceModifier.width(12.dp))
        Column(modifier = GlanceModifier.defaultWeight().fillMaxSize()) {
            val type = context.getString(
                when (data.itemType) {
                    "movie" -> R.string.widget_type_movie
                    "series" -> R.string.widget_type_series
                    else -> R.string.widget_type_book
                },
            )
            Text(
                if (data.subtitle != null) "$type · ${data.subtitle}" else type,
                style = softStyle(),
                maxLines = 1,
            )
            Text(data.title, style = titleStyle(), maxLines = 1)
            Text(data.progressLabel, style = bodyStyle(), maxLines = 1)
            Spacer(GlanceModifier.defaultWeight())
            ProgressLine(data)
            Spacer(GlanceModifier.height(4.dp))
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                val status = when {
                    stale -> context.getString(R.string.widget_stale_data)
                    else -> data.statusLabel ?: ""
                }
                Text(status, style = TextStyle(color = WidgetPalette.fgSoft, fontSize = 10.sp), maxLines = 1)
                Spacer(GlanceModifier.defaultWeight())
                // Las películas no tienen sesiones: su registro es la ficha, que
                // ya abre la tarjeta entera. Mismo criterio que TodayCard.
                if (data.itemType != "movie") {
                    Text(
                        context.getString(R.string.widget_log_progress),
                        style = accentStyle(),
                        modifier = GlanceModifier.clickable(
                            actionStartActivity(WidgetDeepLinks.intentFor(context, data.deepLink)),
                        ),
                    )
                }
            }
        }
    }
}

/** Barra si hay porcentaje; si no hay total conocido, no se inventa. */
@Composable
private fun ProgressLine(data: CurrentProgressData) {
    val pct = data.percentage ?: return
    LinearProgressIndicator(
        progress = pct / 100f,
        modifier = GlanceModifier.fillMaxWidth().height(6.dp),
        color = WidgetPalette.accent,
        backgroundColor = WidgetPalette.track,
    )
}
