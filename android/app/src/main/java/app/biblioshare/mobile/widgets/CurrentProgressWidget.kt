package app.biblioshare.mobile.widgets

import android.content.Context
import android.graphics.Bitmap
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
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
        FeaturedCard(f, f.coverUrl?.let(covers::get), running)
        if (state.others.isNotEmpty()) {
            Spacer(GlanceModifier.height(18.dp))
            Text(ctx.getString(R.string.widget_continue_where_left_off), style = softStyle())
            Spacer(GlanceModifier.height(8.dp))
            ContinueGrid(state.others, covers)
        }
    }
}

/** Portada + ordinal + título + contexto + progreso + racha/semana + pie de acciones. */
@Composable
private fun FeaturedCard(d: CurrentProgressData, cover: Bitmap?, running: TimerLogic.Running?) {
    val context = LocalContext.current
    Column(GlanceModifier.fillMaxWidth().background(WidgetPalette.surface).cornerRadius(18.dp)) {
        Row(GlanceModifier.padding(16.dp)) {
            Cover(cover, width = 72, height = 104)
            Spacer(GlanceModifier.width(14.dp))
            Column(GlanceModifier.defaultWeight()) {
                Text(
                    d.nthLabel,
                    style = TextStyle(color = WidgetPalette.accent, fontSize = 11.sp, fontWeight = FontWeight.Medium),
                )
                Text(d.title, style = bigStyle(), maxLines = 2)
                Text(
                    d.contextLabel.ifBlank { context.getString(R.string.widget_no_progress) },
                    style = softStyle(),
                    maxLines = 1,
                )
                if (d.percentage != null) {
                    Spacer(GlanceModifier.height(8.dp))
                    SoftBar(d.percentage)
                    Spacer(GlanceModifier.height(4.dp))
                    Text(d.progressLabel, style = softStyle(), maxLines = 1)
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
        FeaturedActions(d, running)
    }
}

/** Sesión/Registrar como deep-link plano cuando no hay cronómetro corriendo para
 *  este pase; si lo hay, pinta el reloj nativo (Chronometer vía AndroidRemoteViews)
 *  o, pasadas 4h, invita a abrir la app en vez de seguir tickeando en segundo plano. */
@Composable
private fun FeaturedActions(d: CurrentProgressData, running: TimerLogic.Running?) {
    val ctx = LocalContext.current
    if (running != null && running.passId == d.passId) {
        val now = System.currentTimeMillis()
        if (isLongSession(running.startedAt, now)) {
            Text(
                ctx.getString(R.string.widget_long_session),
                style = softStyle(),
                modifier = GlanceModifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)
                    .clickable(actionRunCallback<RegisterTimerAction>()),
            )
        } else {
            Column(modifier = GlanceModifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                val rv = RemoteViews(ctx.packageName, R.layout.widget_chronometer).apply {
                    setChronometer(
                        R.id.widget_chrono,
                        chronometerBase(running.startedAt, now, SystemClock.elapsedRealtime()),
                        null,
                        true,
                    )
                }
                AndroidRemoteViews(rv)
                Spacer(GlanceModifier.height(8.dp))
                Row {
                    ActionCell(
                        ctx.getString(R.string.widget_discard),
                        WidgetPalette.fgSoft,
                        GlanceModifier.defaultWeight()
                            .clickable(actionRunCallback<DiscardTimerAction>(actionParametersOf(PASS_ID_PARAM to d.passId))),
                    )
                    Spacer(GlanceModifier.width(8.dp))
                    ActionCell(
                        ctx.getString(R.string.widget_register),
                        WidgetPalette.accent,
                        GlanceModifier.defaultWeight()
                            .clickable(actionRunCallback<RegisterTimerAction>()),
                    )
                }
            }
        }
    } else {
        Row(modifier = GlanceModifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
            if (d.itemType == "book") {
                ActionCell(
                    ctx.getString(R.string.widget_session_action),
                    WidgetPalette.accent,
                    GlanceModifier.defaultWeight()
                        .clickable(actionRunCallback<StartTimerAction>(actionParametersOf(PASS_ID_PARAM to d.passId))),
                )
                Spacer(GlanceModifier.width(8.dp))
            }
            ActionCell(
                ctx.getString(R.string.widget_register_action),
                WidgetPalette.fg,
                GlanceModifier.defaultWeight()
                    .clickable(actionStartActivity(WidgetDeepLinks.intentFor(ctx, itemLogHref(d)))),
            )
        }
    }
}

/** "Registrar" sin minutos: la hoja de sesión para libros, la ficha para el resto.
 *  Un pase huérfano (libro sin pase activo → passId vacío) no tiene sesión que
 *  abrir: cae a su deepLink, que ya apunta a la ficha. */
private fun itemLogHref(d: CurrentProgressData): String =
    if (d.itemType != "book" || d.passId.isBlank()) d.deepLink else "/sesion/${d.passId}"
