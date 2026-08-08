package app.biblioshare.mobile.widgets

import android.content.Context
import android.graphics.Bitmap
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.Action
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.background
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.Text
import androidx.glance.unit.ColorProvider
import app.biblioshare.mobile.R

// Widget de 1 fila (4x1): la sesión de lectura de un vistazo. Sin sesión, un
// pase en curso con «play» para empezar y «siguiente» para rotar entre varios;
// con sesión, se fija al pase en curso, oculta «siguiente» y muestra cronómetro
// + pausa/reanuda + terminar + descartar. Los controles son iconos vectoriales
// tintados (NO emojis: en la barra de estado/pantalla los emojis salen a color
// y desalineados). Reutiliza readingRowState (probado en JVM) y las MISMAS
// acciones que el widget grande.
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
                Text(LocalContext.current.getString(R.string.widget_open_to_start), style = titleStyle(), maxLines = 1)
            }
        }
        is ReadingRowState.Selector -> RowSurface { SelectorRow(state, covers) }
        is ReadingRowState.Session -> RowSurface { SessionRow(state, covers) }
    }
}

// Superficie de la fila: MISMO fondo Paper que WidgetSurface (sin él, el widget
// sale transparente — lección #498) pero con padding mínimo: una fila 4x1 tiene
// poco alto y mucho de él se iba en margen. Calibrar el vertical en dispositivo
// si la portada se recorta.
@Composable
private fun RowSurface(content: @Composable () -> Unit) {
    Box(
        modifier = GlanceModifier.fillMaxSize()
            .background(ImageProvider(R.drawable.widget_background))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) { content() }
}

private const val COVER_W = 34
private const val COVER_H = 50

@Composable
private fun SelectorRow(state: ReadingRowState.Selector, covers: Map<String, Bitmap?>) {
    val d = state.featured
    Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
        Cover(d.coverUrl?.let(covers::get), width = COVER_W, height = COVER_H)
        Spacer(GlanceModifier.width(10.dp))
        // Título grande y a una línea, ocupando todo el ancho libre (sin barra de
        // progreso: en una fila estorbaba más que informaba).
        Text(d.title, style = bigStyle(), maxLines = 1, modifier = GlanceModifier.defaultWeight())
        if (d.itemType == "book") {
            IconAction(R.drawable.ic_widget_play, WidgetPalette.accent, actionRunCallback<StartTimerAction>(actionParametersOf(PASS_ID_PARAM to d.passId)))
        }
        if (state.hasOthers) {
            IconAction(R.drawable.ic_widget_next, WidgetPalette.fg, actionRunCallback<CycleFocusAction>())
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
        Cover(d.coverUrl?.let(covers::get), width = COVER_W, height = COVER_H)
        Spacer(GlanceModifier.width(10.dp))
        Column(GlanceModifier.defaultWeight()) {
            Text(d.title, style = titleStyle(), maxLines = 1)
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
        // Pausar/Reanudar · Terminar · Descartar. Descartar en `fgSoft` (secundario)
        // y con menos aire para que los tres quepan en 4x1.
        val toggle = if (r.running) R.drawable.ic_widget_pause else R.drawable.ic_widget_play
        val toggleAction = if (r.running) actionRunCallback<PauseTimerAction>() else actionRunCallback<ResumeTimerAction>()
        IconAction(toggle, WidgetPalette.accent, toggleAction, hPad = 5)
        IconAction(R.drawable.ic_widget_stop, WidgetPalette.fg, actionRunCallback<RegisterTimerAction>(), hPad = 5)
        IconAction(R.drawable.ic_widget_discard, WidgetPalette.fgSoft, actionRunCallback<DiscardTimerAction>(actionParametersOf(PASS_ID_PARAM to d.passId)), hPad = 5)
    }
}

/** Botón de icono: vector monocromo tintado con el token de la paleta (adapta a
 *  claro/oscuro por values-night), a 24dp — bastante mayor que el glifo de texto
 *  anterior. `hPad` recorta el aire horizontal cuando hay varios seguidos. */
@Composable
private fun IconAction(resId: Int, tint: ColorProvider, action: Action, hPad: Int = 7) {
    Box(
        modifier = GlanceModifier.clickable(action).padding(horizontal = hPad.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            provider = ImageProvider(resId),
            contentDescription = null,
            colorFilter = ColorFilter.tint(tint),
            modifier = GlanceModifier.size(24.dp),
        )
    }
}
