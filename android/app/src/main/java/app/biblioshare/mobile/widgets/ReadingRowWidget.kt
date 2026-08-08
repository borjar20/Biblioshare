package app.biblioshare.mobile.widgets

import android.content.Context
import android.graphics.Bitmap
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.background
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.Text
import app.biblioshare.mobile.R

// Widget de 1 fila (4x1): la sesión de lectura de un vistazo. Sin sesión, un
// pase en curso con ▶ para empezar y ⏭ para rotar entre varios; con sesión, se
// fija al pase en curso, oculta ⏭ y muestra cronómetro + ⏸/▶ + ■. Reutiliza
// readingRowState (probado en JVM) y las MISMAS acciones que el widget grande.
class ReadingRowWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetSnapshotStore.load(context)
        val selected = getAppWidgetState(context, PreferencesGlanceStateDefinition, id)[ROW_SELECTED_PASS_KEY]
        val running = TimerStore.get(context)
        val state = readingRowState(snapshot, selected, running)
        val covers = loadCovers(context, snapshot)
        provideContent { ReadingRowContent(state, covers) }
    }
}

class ReadingRowWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ReadingRowWidget()
}

@Composable
fun ReadingRowContent(state: ReadingRowState, covers: Map<String, Bitmap?>) {
    when (state) {
        ReadingRowState.Empty -> WidgetCard("/coleccion") {
            Box(GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(LocalContext.current.getString(R.string.widget_open_to_start), style = softStyle(), maxLines = 1)
            }
        }
        is ReadingRowState.Selector -> RowSurface { SelectorRow(state, covers) }
        is ReadingRowState.Session -> RowSurface { SessionRow(state, covers) }
    }
}

// Superficie de la fila: MISMO fondo Paper que WidgetSurface (sin él, el widget
// sale transparente — lección #498) pero con padding ajustado a 40-60dp de alto
// (el 12dp de WidgetSurface, pensado para el 4x3, aplasta una fila). Calibrar el
// vertical en dispositivo: la portada de 42dp debe caber sin recorte.
@Composable
private fun RowSurface(content: @Composable () -> Unit) {
    Box(
        modifier = GlanceModifier.fillMaxSize()
            .background(androidx.glance.ImageProvider(R.drawable.widget_background))
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) { content() }
}

@Composable
private fun SelectorRow(state: ReadingRowState.Selector, covers: Map<String, Bitmap?>) {
    val d = state.featured
    Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
        Cover(d.coverUrl?.let(covers::get), width = 28, height = 42)
        Spacer(GlanceModifier.width(8.dp))
        androidx.glance.layout.Column(GlanceModifier.defaultWeight()) {
            Text(d.title, style = titleStyle(), maxLines = 1)
            SoftBar(d.percentage ?: 0, heightDp = 3)
        }
        if (d.itemType == "book") {
            Spacer(GlanceModifier.width(8.dp))
            IconButton("▶", actionRunCallback<StartTimerAction>(actionParametersOf(PASS_ID_PARAM to d.passId)))
        }
        if (state.hasOthers) {
            Spacer(GlanceModifier.width(4.dp))
            IconButton("⏭", actionRunCallback<CycleFocusAction>())
        }
    }
}

@Composable
private fun SessionRow(state: ReadingRowState.Session, covers: Map<String, Bitmap?>) {
    val ctx = LocalContext.current
    val d = state.featured
    val r = state.running
    val now = System.currentTimeMillis()
    Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
        Cover(d.coverUrl?.let(covers::get), width = 28, height = 42)
        Spacer(GlanceModifier.width(8.dp))
        androidx.glance.layout.Column(GlanceModifier.defaultWeight()) {
            Text(d.title, style = softStyle(), maxLines = 1)
            if (r.running) {
                val rv = RemoteViews(ctx.packageName, R.layout.widget_chronometer).apply {
                    setChronometer(R.id.widget_chrono, chronometerBase(r.startedAt, now, SystemClock.elapsedRealtime()), null, true)
                }
                AndroidRemoteViews(rv, GlanceModifier.fillMaxWidth())
            } else {
                val rv = RemoteViews(ctx.packageName, R.layout.widget_static_time).apply {
                    setTextViewText(R.id.widget_static_time, fmtElapsed(elapsedMs(r, now)))
                }
                AndroidRemoteViews(rv, GlanceModifier.fillMaxWidth())
            }
        }
        Spacer(GlanceModifier.width(8.dp))
        val toggle = if (r.running) actionRunCallback<PauseTimerAction>() else actionRunCallback<ResumeTimerAction>()
        IconButton(if (r.running) "⏸" else "▶", toggle)
        Spacer(GlanceModifier.width(4.dp))
        IconButton("■", actionRunCallback<RegisterTimerAction>())
    }
}

@Composable
private fun IconButton(glyph: String, action: androidx.glance.action.Action) {
    Box(
        modifier = GlanceModifier.clickable(action).padding(horizontal = 8.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) { Text(glyph, style = accentStyle()) }
}
