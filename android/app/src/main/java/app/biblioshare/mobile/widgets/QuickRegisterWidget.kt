package app.biblioshare.mobile.widgets

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import app.biblioshare.mobile.R

// Widget «Registro rápido»: un solo tamaño pequeño, 2 pasos, SIN abrir la app
// para lo más frecuente (marcar una sesión de lo que ya está en curso). Paso 1
// (Pick) = elegir de entre lo que está en curso; paso 2 (Register) = la misma
// vista de sesión (cronómetro) que el Completo, con un enlace secundario a la
// app para quien prefiera la hoja completa. El paso y el pase elegido viven en
// el estado Glance (WidgetActions.kt); se leen aquí UNA vez fuera de la
// composición, junto con snapshot, portadas y el cronómetro nativo — los
// mismos que ya carga CurrentProgressWidget (loadCovers es `internal`, no se
// duplica el loader).
class QuickRegisterWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Single
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetSnapshotStore.load(context)
        val prefs = getAppWidgetState(context, PreferencesGlanceStateDefinition, id)
        val state = quickRegisterState(snapshot, prefs[STEP_KEY] ?: 1, prefs[QR_SELECTED_KEY])
        val covers = loadCovers(context, snapshot)
        val running = TimerStore.get(context)
        provideContent { QuickRegisterContent(state, covers, running) }
    }
}

class QuickRegisterWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = QuickRegisterWidget()
}

/** Contenido puro: mismo dibujo en el widget real y en las previews (src/debug). */
@Composable
fun QuickRegisterContent(state: QuickRegisterState, covers: Map<String, Bitmap?>, running: TimerLogic.Running?) {
    val context = LocalContext.current
    when (state) {
        QuickRegisterState.SignedOut -> WidgetCard("/") {
            EmptyState(
                context.getString(R.string.widget_open_app_title),
                context.getString(R.string.widget_open_app_subtitle),
            )
        }
        QuickRegisterState.NothingInProgress -> WidgetCard("/coleccion") {
            EmptyState(
                context.getString(R.string.widget_nothing_in_progress),
                context.getString(R.string.widget_open_to_start),
            )
        }
        is QuickRegisterState.Pick -> WidgetSurface { PickStep(state.items, covers) }
        is QuickRegisterState.Register -> WidgetSurface {
            RegisterStep(state.item, state.item.coverUrl?.let(covers::get), running)
        }
    }
}

/** Paso 1: cabecera + una fila compacta por cada lectura en curso. */
@Composable
private fun PickStep(items: List<CurrentProgressData>, covers: Map<String, Bitmap?>) {
    val context = LocalContext.current
    Column(GlanceModifier.fillMaxSize()) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(context.getString(R.string.widget_register_reading_title), style = titleStyle())
            Spacer(GlanceModifier.defaultWeight())
            Text(context.getString(R.string.widget_items_in_progress_count, items.size), style = softStyle())
        }
        Spacer(GlanceModifier.height(8.dp))
        items.forEach { item ->
            CompactRow(
                item = item,
                cover = item.coverUrl?.let(covers::get),
                onClick = actionRunCallback<PickAction>(actionParametersOf(PASS_ID_PARAM to item.passId)),
            )
        }
    }
}

/** Paso 2: volver + ficha del elegido + vista de sesión (la misma del Completo,
 *  Task A4/#498: el paso 2 va DIRECTO al cronómetro, no a chips de minutos) +
 *  enlace secundario a la hoja de sesión completa en la app. */
@Composable
private fun RegisterStep(item: CurrentProgressData, cover: Bitmap?, running: TimerLogic.Running?) {
    val ctx = LocalContext.current
    Column(GlanceModifier.fillMaxSize()) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "‹",
                style = TextStyle(color = WidgetPalette.fg, fontSize = 18.sp, fontWeight = FontWeight.Bold),
                modifier = GlanceModifier.clickable(actionRunCallback<BackAction>()).padding(end = 10.dp),
            )
            Text(ctx.getString(R.string.widget_register), style = titleStyle())
        }
        Spacer(GlanceModifier.height(10.dp))
        Row(modifier = GlanceModifier.fillMaxWidth()) {
            Cover(cover, width = 64, height = 96)
            Spacer(GlanceModifier.width(12.dp))
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    item.nthLabel,
                    style = TextStyle(color = WidgetPalette.accent, fontSize = 11.sp, fontWeight = FontWeight.Medium),
                )
                Text(item.title, style = bigStyle(), maxLines = 2)
                Text(
                    item.contextLabel.ifBlank { ctx.getString(R.string.widget_first_session) },
                    style = softStyle(),
                    maxLines = 1,
                )
            }
        }
        Spacer(GlanceModifier.height(12.dp))
        SessionTimerView(item, running)
        // itemLogHref ya resuelve el huérfano (passId vacío) a su ficha, así que
        // el enlace secundario nunca navega a una ruta /sesion/ rota.
        Text(
            ctx.getString(R.string.widget_register_in_app),
            style = softStyle(),
            modifier = GlanceModifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)
                .clickable(actionStartActivity(WidgetDeepLinks.intentFor(ctx, itemLogHref(item)))),
        )
    }
}
