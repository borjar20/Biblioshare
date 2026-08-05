package app.biblioshare.mobile.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.width
import androidx.glance.text.Text
import app.biblioshare.mobile.R

// Widget «Objetivo de hoy»: minutos de lectura del día contra
// profiles.daily_goal_minutes — la MISMA regla que la TodayCard del dashboard
// y que la celebración daily_goal_completed; el cálculo llega hecho en el
// snapshot, aquí no se re-deriva nada.
//
// Cambio de día: el snapshot lleva su fecha local; si no coincide con la del
// dispositivo al renderizar, se muestra "pendiente de actualizar" en vez de
// vender el progreso de ayer como de hoy. El updatePeriodMillis del provider
// (1 h, solo re-render local, sin red) acota cuánto tarda en notarse tras
// medianoche sin necesitar WorkManager.
class DailyGoalWidget : GlanceAppWidget() {

    companion object {
        private val COMPACT = DpSize(110.dp, 110.dp)
        private val HORIZONTAL = DpSize(240.dp, 110.dp)
    }

    override val sizeMode = SizeMode.Responsive(setOf(COMPACT, HORIZONTAL))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetSnapshotStore.load(context)
        val goal = snapshot?.dailyGoal
        val outdated = goal != null && goal.date != todayLocalISO()
        provideContent {
            when {
                snapshot == null -> WidgetCard("/") {
                    EmptyState(
                        LocalContext.current.getString(R.string.widget_open_app_title),
                        LocalContext.current.getString(R.string.widget_open_app_subtitle),
                    )
                }
                goal == null -> WidgetCard("/estadisticas") {
                    EmptyState(
                        LocalContext.current.getString(R.string.widget_no_goal_title),
                        LocalContext.current.getString(R.string.widget_no_goal_subtitle),
                    )
                }
                outdated -> WidgetCard(goal.deepLink) {
                    EmptyState(
                        LocalContext.current.getString(R.string.widget_goal_title),
                        LocalContext.current.getString(R.string.widget_outdated_subtitle),
                    )
                }
                else -> WidgetCard(goal.deepLink) {
                    if (LocalSize.current.width >= 240.dp) Horizontal(goal) else Compact(goal)
                }
            }
        }
    }
}

class DailyGoalWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DailyGoalWidget()
}

@Composable
private fun Compact(goal: DailyGoalData) {
    val context = LocalContext.current
    Column(modifier = GlanceModifier.fillMaxSize()) {
        Text(context.getString(R.string.widget_goal_title), style = softStyle(), maxLines = 1)
        Text(goal.progressLabel, style = bigStyle(), maxLines = 1)
        Spacer(GlanceModifier.defaultWeight())
        GoalBar(goal)
        Spacer(GlanceModifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            if ((goal.streak ?: 0) > 0) {
                Text(
                    context.getString(R.string.widget_streak_days, goal.streak),
                    style = softStyle(),
                    maxLines = 1,
                )
            }
            Spacer(GlanceModifier.defaultWeight())
            if (goal.completed) Text("✓", style = accentStyle())
        }
    }
}

@Composable
private fun Horizontal(goal: DailyGoalData) {
    val context = LocalContext.current
    Column(modifier = GlanceModifier.fillMaxSize()) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(context.getString(R.string.widget_goal_title), style = softStyle(), maxLines = 1)
            Spacer(GlanceModifier.defaultWeight())
            if ((goal.streak ?: 0) > 0) {
                Text(context.getString(R.string.widget_streak_days, goal.streak), style = softStyle())
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(goal.progressLabel, style = bigStyle(), maxLines = 1)
            Spacer(GlanceModifier.width(8.dp))
            Text("${goal.percentage} %", style = softStyle())
        }
        Spacer(GlanceModifier.defaultWeight())
        GoalBar(goal)
        Spacer(GlanceModifier.height(6.dp))
        Text(goal.message, style = if (goal.completed) accentStyle() else bodyStyle(), maxLines = 1)
    }
}

@Composable
private fun GoalBar(goal: DailyGoalData) {
    LinearProgressIndicator(
        progress = (goal.percentage.coerceIn(0, 100)) / 100f,
        modifier = GlanceModifier.fillMaxWidth().height(6.dp),
        color = WidgetPalette.accent,
        backgroundColor = WidgetPalette.track,
    )
}
