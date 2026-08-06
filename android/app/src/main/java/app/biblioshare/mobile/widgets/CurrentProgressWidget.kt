package app.biblioshare.mobile.widgets

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.Text
import app.biblioshare.mobile.R

// Widget «En curso»: un solo tamaño grande (Completo) con el destacado (por
// defecto el que decide el servidor, misma regla que getTodayFocus del
// dashboard) y, si hay más lecturas a medias, la rejilla "Continúa donde lo
// dejaste". Tocar una portada de la rejilla cambia el foco SIN abrir la app:
// el passId elegido se guarda en el estado Glance (SELECTED_PASS_KEY) y se lee
// aquí en provideGlance; si no hay elección, gana el [0] del snapshot.
class CurrentProgressWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Exact
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // I/O fuera de la composición: store, selección y portadas se resuelven una vez aquí.
        val snapshot = WidgetSnapshotStore.load(context)
        val selected = getAppWidgetState(context, PreferencesGlanceStateDefinition, id)[SELECTED_PASS_KEY]
        val state = currentProgressState(snapshot, selectedPassId = selected)
        val covers = loadCovers(context, snapshot)
        val running = TimerStore.get(context)
        provideContent { CurrentProgressContent(state, covers, running) }
    }
}

internal suspend fun loadCovers(context: Context, snapshot: WidgetSnapshot?): Map<String, Bitmap?> {
    val urls = snapshot?.inProgress?.mapNotNull { it.coverUrl }?.distinct().orEmpty()
    return urls.associateWith { WidgetImageCache.loadBitmap(context, it) }
}

/** Contenido puro: mismo dibujo en el widget real y en las previews (src/debug). */
@Composable
fun CurrentProgressContent(
    state: ProgressWidgetState,
    covers: Map<String, Bitmap?>,
    running: TimerLogic.Running? = null,
) {
    val context = LocalContext.current
    when (state) {
        ProgressWidgetState.SignedOut -> WidgetCard("/") {
            EmptyState(
                context.getString(R.string.widget_open_app_title),
                context.getString(R.string.widget_open_app_subtitle),
            )
        }
        ProgressWidgetState.NothingInProgress -> WidgetCard("/coleccion") {
            EmptyState(
                context.getString(R.string.widget_nothing_in_progress),
                context.getString(R.string.widget_open_to_start),
            )
        }
        is ProgressWidgetState.Content -> WidgetSurface { Completo(state, covers, running) }
    }
}

class CurrentProgressWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CurrentProgressWidget()
}

@Composable
private fun Completo(state: ProgressWidgetState.Content, covers: Map<String, Bitmap?>, running: TimerLogic.Running?) {
    val ctx = LocalContext.current
    val f = state.featured
    Column(GlanceModifier.fillMaxSize()) {
        SectionHeader(
            label = ctx.getString(R.string.widget_current_progress_label),
            trailing = ctx.getString(R.string.widget_view_all, state.total),
            onTrailing = actionStartActivity(WidgetDeepLinks.intentFor(ctx, "/coleccion?status=in_progress")),
        )
        // Snapshot sin refrescar en 48h: avisa de que los números pueden ser
        // viejos (se perdió al reescribir el layout en Fase 2, #492).
        if (state.stale) {
            Spacer(GlanceModifier.height(6.dp))
            Text(ctx.getString(R.string.widget_stale_data), style = softStyle())
        }
        Spacer(GlanceModifier.height(10.dp))
        FeaturedCard(f, f.coverUrl?.let(covers::get), running, state.dailyGoal)
        if (state.others.isNotEmpty()) {
            Spacer(GlanceModifier.height(18.dp))
            Text(ctx.getString(R.string.widget_continue_where_left_off), style = softStyle())
            Spacer(GlanceModifier.height(8.dp))
            ContinueGrid(state.others, covers)
        }
    }
}

/** Portada + ordinal + título + contexto + «Meta de hoy» (objetivo GLOBAL, no el
 *  % de páginas del pase) + racha/semana + pie partido de acciones. */
@Composable
private fun FeaturedCard(d: CurrentProgressData, cover: Bitmap?, running: TimerLogic.Running?, dailyGoal: DailyGoalData?) {
    val context = LocalContext.current
    Column(GlanceModifier.fillMaxWidth().background(WidgetPalette.surface).cornerRadius(18.dp)) {
        Row(GlanceModifier.fillMaxWidth()) {
            // Barra de acento: Glance no tiene `::before`, se emula con un Box
            // angosto como primer hijo del Row.
            Box(GlanceModifier.width(4.dp).fillMaxHeight().background(WidgetPalette.accent)) {}
            Row(GlanceModifier.defaultWeight().padding(16.dp)) {
                Cover(cover, width = 72, height = 104)
                Spacer(GlanceModifier.width(14.dp))
                Column(GlanceModifier.defaultWeight()) {
                    Text(
                        d.nthLabel,
                        style = accentStyle(),
                    )
                    Text(d.title, style = bigStyle(), maxLines = 2)
                    Text(
                        d.contextLabel.ifBlank { context.getString(R.string.widget_no_progress) },
                        style = softStyle(),
                        maxLines = 1,
                    )
                    if (dailyGoal != null) {
                        Spacer(GlanceModifier.height(10.dp))
                        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(context.getString(R.string.widget_today_goal), style = softStyle())
                            Spacer(GlanceModifier.defaultWeight())
                            Text(dailyGoal.progressLabel, style = softStyle())
                        }
                        Spacer(GlanceModifier.height(4.dp))
                        SoftBar(dailyGoal.percentage)
                    }
                    if (d.streakDays > 0 || d.week.isNotEmpty()) {
                        Spacer(GlanceModifier.height(12.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (d.streakDays > 0) {
                                StreakPill(d.streakDays)
                                Spacer(GlanceModifier.defaultWeight())
                            }
                            WeekDots(d.week)
                        }
                    }
                }
            }
        }
        Box(GlanceModifier.fillMaxWidth().height(1.dp).background(WidgetPalette.border)) {}
        SessionTimerView(d, running)
    }
}
