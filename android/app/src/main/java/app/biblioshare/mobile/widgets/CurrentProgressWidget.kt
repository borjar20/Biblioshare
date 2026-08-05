package app.biblioshare.mobile.widgets

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.clickable
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
        val covers = (state as? ProgressWidgetState.Content)?.items.orEmpty()
            .mapNotNull { it.coverUrl }
            .associateWith { WidgetImageCache.loadBitmap(context, it) }
        provideContent { CurrentProgressContent(state, covers) }
    }
}

/** Contenido puro: mismo dibujo en el widget real y en las previews (src/debug). */
@Composable
fun CurrentProgressContent(state: ProgressWidgetState, covers: Map<String, Bitmap?>) {
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
        is ProgressWidgetState.Content -> Completo(state, covers)
    }
}

class CurrentProgressWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CurrentProgressWidget()
}

@Composable
private fun Completo(state: ProgressWidgetState.Content, covers: Map<String, Bitmap?>) {
    val ctx = LocalContext.current
    val f = state.featured
    Column(GlanceModifier.fillMaxSize().padding(4.dp)) {
        SectionHeader(
            label = "En curso",
            trailing = "${state.total} · Ver todos ›",
            onTrailing = actionStartActivity(WidgetDeepLinks.intentFor(ctx, "/coleccion?status=in_progress")),
        )
        Spacer(GlanceModifier.height(10.dp))
        FeaturedCard(f, f.coverUrl?.let(covers::get))
        if (state.others.isNotEmpty()) {
            Spacer(GlanceModifier.height(18.dp))
            Text("Continúa donde lo dejaste", style = softStyle())
            Spacer(GlanceModifier.height(8.dp))
            ContinueGrid(state.others, covers)
        }
    }
}

/** Portada + ordinal + título + contexto + progreso + racha/semana + pie de acciones. */
@Composable
private fun FeaturedCard(d: CurrentProgressData, cover: Bitmap?) {
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
                Text(d.contextLabel.ifBlank { "Sin progreso" }, style = softStyle(), maxLines = 1)
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
        FeaturedActions(d)
    }
}

/** Sesión/Registrar como deep-link plano; el cronómetro nativo llega en Task 17. */
@Composable
private fun FeaturedActions(d: CurrentProgressData) {
    val ctx = LocalContext.current
    Row(modifier = GlanceModifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        if (d.itemType == "book") {
            ActionCell(
                "◷ Sesión",
                WidgetPalette.accent,
                GlanceModifier.defaultWeight()
                    .clickable(actionStartActivity(WidgetDeepLinks.intentFor(ctx, d.deepLink))),
            )
            Spacer(GlanceModifier.width(8.dp))
        }
        ActionCell(
            "✎ Registrar",
            WidgetPalette.fg,
            GlanceModifier.defaultWeight()
                .clickable(actionStartActivity(WidgetDeepLinks.intentFor(ctx, itemLogHref(d)))),
        )
    }
}

/** "Registrar" sin minutos: la hoja de sesión para libros, la ficha para el resto.
 *  Un pase huérfano (libro sin pase activo → passId vacío) no tiene sesión que
 *  abrir: cae a su deepLink, que ya apunta a la ficha. */
private fun itemLogHref(d: CurrentProgressData): String =
    if (d.itemType != "book" || d.passId.isBlank()) d.deepLink else "/sesion/${d.passId}"
