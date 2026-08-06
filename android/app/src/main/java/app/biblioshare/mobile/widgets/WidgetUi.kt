package app.biblioshare.mobile.widgets

import android.graphics.Bitmap
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.Action
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.biblioshare.mobile.R

// Piezas Glance compartidas por los dos widgets: paleta Paper (par claro/oscuro
// vía values-night), tarjeta clicable con fondo redondeado, portada con
// placeholder y estilos de texto.

object WidgetPalette {
    val fg = ColorProvider(R.color.widget_fg)
    val fgSoft = ColorProvider(R.color.widget_fg_soft)
    val accent = ColorProvider(R.color.widget_accent)
    val track = ColorProvider(R.color.widget_track)
    val gold = ColorProvider(R.color.widget_gold)
    /** Superficie ligeramente elevada sobre el fondo, para la tarjeta destacada del Completo. */
    val surface = ColorProvider(R.color.widget_surface)
    /** Fondo base, casi blanco: texto legible sobre un chip/botón relleno de acento. */
    val bg = ColorProvider(R.color.widget_bg)
    val accentFg = ColorProvider(R.color.widget_accent_fg)
    val border = ColorProvider(R.color.widget_border)
}

fun titleStyle() = TextStyle(color = WidgetPalette.fg, fontSize = 13.sp, fontWeight = FontWeight.Bold)
fun bigStyle() = TextStyle(color = WidgetPalette.fg, fontSize = 17.sp, fontWeight = FontWeight.Bold)
fun bodyStyle() = TextStyle(color = WidgetPalette.fg, fontSize = 12.sp)
fun softStyle() = TextStyle(color = WidgetPalette.fgSoft, fontSize = 11.sp)
fun accentStyle() = TextStyle(color = WidgetPalette.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)

/** Superficie base opaca (fondo Paper redondeado + padding), SIN navegación.
 *  Envuelve los estados de CONTENIDO —antes solo los vacíos tenían fondo, de ahí
 *  el "fondo transparente" (#498). WidgetCard = WidgetSurface + click de pantalla. */
@Composable
fun WidgetSurface(content: @Composable () -> Unit) {
    Box(
        modifier = GlanceModifier.fillMaxSize()
            .background(ImageProvider(R.drawable.widget_background))
            .padding(12.dp),
    ) { content() }
}

/** Tarjeta raíz: fondo redondeado + padding, y TODA su superficie navega al
 *  path interno indicado (validado en WidgetDeepLinks). */
@Composable
fun WidgetCard(deepLinkPath: String, content: @Composable () -> Unit) {
    val context = LocalContext.current
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ImageProvider(R.drawable.widget_background))
            .clickable(actionStartActivity(WidgetDeepLinks.intentFor(context, deepLinkPath)))
            .padding(12.dp),
    ) {
        content()
    }
}

/** Portada cacheada o placeholder. Nunca bloquea: el bitmap ya viene decodificado
 *  (o null) desde provideGlance. */
@Composable
fun Cover(bitmap: Bitmap?, width: Int, height: Int) {
    Image(
        provider = if (bitmap != null) ImageProvider(bitmap) else ImageProvider(R.drawable.widget_placeholder),
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = GlanceModifier.width(width.dp).height(height.dp),
    )
}

/** Estado vacío/sin sesión, centrado, común a ambos widgets. */
@Composable
fun EmptyState(title: String, subtitle: String) {
    Column(
        modifier = GlanceModifier.fillMaxSize(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = titleStyle(), maxLines = 2)
        Text(subtitle, style = softStyle(), maxLines = 2)
    }
}

/** Cabecera de sección: etiqueta en mayúsculas + texto de acción opcional (p. ej.
 *  "2 · Ver todos ›") a la derecha, clicable solo si se da [onTrailing]. */
@Composable
fun SectionHeader(label: String, trailing: String? = null, onTrailing: Action? = null) {
    Row(
        modifier = GlanceModifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label.uppercase(),
            style = TextStyle(color = WidgetPalette.fgSoft, fontSize = 11.sp, fontWeight = FontWeight.Bold),
        )
        if (trailing != null) {
            Spacer(GlanceModifier.defaultWeight())
            Text(
                trailing,
                style = if (onTrailing != null) accentStyle() else softStyle(),
                modifier = if (onTrailing != null) GlanceModifier.clickable(onTrailing) else GlanceModifier,
            )
        }
    }
}

/** Celda de acción del pie de la tarjeta destacada: texto centrado sobre un
 *  fondo sutil redondeado. El [modifier] pasado ya trae `.defaultWeight()` y
 *  `.clickable(...)` — aquí solo se añade la superficie. */
@Composable
fun ActionCell(label: String, color: ColorProvider, modifier: GlanceModifier) {
    Box(
        modifier = modifier.background(WidgetPalette.track).cornerRadius(10.dp).padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = TextStyle(color = color, fontSize = 12.sp, fontWeight = FontWeight.Medium))
    }
}

/** Rejilla de "Continúa donde lo dejaste": 3 columnas por fila, portada + título
 *  a una línea. Tocar una celda cambia el destacado (Glance state, Task 8). */
@Composable
fun ContinueGrid(others: List<CurrentProgressData>, covers: Map<String, Bitmap?>) {
    Column {
        others.chunked(3).forEach { row ->
            Row(modifier = GlanceModifier.fillMaxWidth()) {
                row.forEach { d ->
                    Column(
                        modifier = GlanceModifier.defaultWeight().padding(end = 6.dp)
                            .clickable(actionRunCallback<SelectFocusAction>(actionParametersOf(PASS_ID_PARAM to d.passId))),
                    ) {
                        Cover(d.coverUrl?.let(covers::get), width = 48, height = 70)
                        Spacer(GlanceModifier.height(4.dp))
                        Text(d.title, style = softStyle(), maxLines = 1)
                    }
                }
            }
            Spacer(GlanceModifier.height(8.dp))
        }
    }
}

/** Pastilla dorada con la racha en días (icono + texto). */
@Composable
fun StreakPill(days: Int) {
    val context = LocalContext.current
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = GlanceModifier
            .background(ImageProvider(R.drawable.widget_pill_gold))
            .padding(horizontal = 12.dp, vertical = 5.dp),
    ) {
        Text("◆", style = TextStyle(color = WidgetPalette.gold, fontSize = 11.sp))
        Spacer(GlanceModifier.width(7.dp))
        Text(
            context.getString(R.string.widget_streak, days),
            style = TextStyle(color = WidgetPalette.fg, fontSize = 12.sp, fontWeight = FontWeight.Medium),
        )
    }
}

/** Fila de puntos de la semana: hoy en dorado, activo en acento, inactivo en el track. */
@Composable
fun WeekDots(week: List<WidgetWeekDay>) {
    Row {
        week.forEach { d ->
            val bg = when {
                d.today -> R.drawable.widget_dot_today
                d.active -> R.drawable.widget_dot_on
                else -> R.drawable.widget_dot_off
            }
            Box(GlanceModifier.size(14.dp).background(ImageProvider(bg))) {}
            Spacer(GlanceModifier.width(4.dp))
        }
    }
}

/** Barra de progreso fina; usa el indicador nativo de Glance (no hay fillMaxWidth(fraction) en 1.1.1). */
@Composable
fun SoftBar(percent: Int, color: ColorProvider = WidgetPalette.accent) {
    LinearProgressIndicator(
        progress = (percent.coerceIn(0, 100)) / 100f,
        modifier = GlanceModifier.fillMaxWidth().height(6.dp),
        color = color,
        backgroundColor = WidgetPalette.track,
    )
}

/** Fila compacta del paso 1 del registro rápido: portada + kindLabel + título +
 *  progreso (o "Sin progreso"), toda la fila clicable. Sin `WidgetCard`: vive
 *  dentro de la tarjeta del widget, no es una pantalla propia. */
@Composable
fun CompactRow(item: CurrentProgressData, cover: Bitmap?, onClick: Action) {
    val context = LocalContext.current
    Row(
        modifier = GlanceModifier.fillMaxWidth().clickable(onClick).padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(cover, width = 36, height = 54)
        Spacer(GlanceModifier.width(10.dp))
        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(item.kindLabel, style = softStyle(), maxLines = 1)
            Text(item.title, style = titleStyle(), maxLines = 1)
            if (item.percentage != null) {
                Spacer(GlanceModifier.height(4.dp))
                SoftBar(item.percentage)
            } else {
                Text(context.getString(R.string.widget_no_progress), style = softStyle())
            }
        }
    }
}

/** Zona de foco compartida por el Completo y el paso 2 del Reducido (#498): portada
 *  + ordinal + título (ellipsis a 2 líneas) + contexto, opcionalmente la barra
 *  «Meta de hoy», y debajo la vista de sesión (Sesión/Registrar o el cronómetro).
 *  Un solo componente para que el foco del pequeño sea casi idéntico al del grande.
 *  `compact` encoge portada y paddings para caber en 4x2. */
@Composable
fun FocusZone(
    data: CurrentProgressData,
    cover: Bitmap?,
    running: TimerLogic.Running?,
    dailyGoal: DailyGoalData? = null,
    compact: Boolean = false,
) {
    val ctx = LocalContext.current
    Column(GlanceModifier.fillMaxWidth().background(ImageProvider(R.drawable.widget_featured_bg))) {
        Row(
            GlanceModifier.fillMaxWidth().padding(
                start = if (compact) 14.dp else 16.dp,
                top = if (compact) 10.dp else 14.dp,
                end = 12.dp,
                bottom = if (compact) 10.dp else 14.dp,
            ),
        ) {
            Cover(cover, width = if (compact) 52 else 64, height = if (compact) 78 else 94)
            Spacer(GlanceModifier.width(12.dp))
            Column(GlanceModifier.defaultWeight()) {
                Text(data.nthLabel, style = accentStyle())
                Text(data.title, style = bigStyle(), maxLines = 2)
                Text(
                    data.contextLabel.ifBlank { ctx.getString(R.string.widget_no_progress) },
                    style = softStyle(),
                    maxLines = 1,
                )
                if (dailyGoal != null) {
                    Spacer(GlanceModifier.height(8.dp))
                    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(ctx.getString(R.string.widget_today_goal), style = softStyle())
                        Spacer(GlanceModifier.defaultWeight())
                        Text(dailyGoal.progressLabel, style = softStyle())
                    }
                    Spacer(GlanceModifier.height(4.dp))
                    SoftBar(dailyGoal.percentage)
                }
            }
        }
        Box(GlanceModifier.fillMaxWidth().padding(start = 4.dp).height(1.dp).background(WidgetPalette.border)) {}
        SessionTimerView(data, running)
    }
}

/** Vista de sesión compartida por el pie del Completo y el paso 2 del Reducido:
 *  Sesión/Registrar como deep-link plano cuando no hay cronómetro corriendo para
 *  este pase; si lo hay, pinta el reloj nativo (Chronometer vía AndroidRemoteViews)
 *  o, pasadas 4h, invita a abrir la app en vez de seguir tickeando en segundo
 *  plano. Fase A: cronómetro SIN pausa (Descartar/Registrar); la pausa llega
 *  en Fase B (#498). */
@Composable
fun SessionTimerView(d: CurrentProgressData, running: TimerLogic.Running?) {
    val ctx = LocalContext.current
    if (running != null && running.passId == d.passId) {
        val now = System.currentTimeMillis()
        if (isLongSession(running.startedAt, now)) {
            Text(
                ctx.getString(R.string.widget_long_session),
                style = softStyle(),
                modifier = GlanceModifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp)
                    .clickable(actionRunCallback<RegisterTimerAction>()),
            )
        } else {
            Column(modifier = GlanceModifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp)) {
                val rv = RemoteViews(ctx.packageName, R.layout.widget_chronometer).apply {
                    setChronometer(
                        R.id.widget_chrono,
                        chronometerBase(running.startedAt, now, SystemClock.elapsedRealtime()),
                        null,
                        true,
                    )
                }
                // Cronómetro centrado: el Chronometer es match_parent + gravity center
                // (widget_chronometer.xml) y aquí ocupa todo el ancho.
                AndroidRemoteViews(rv, GlanceModifier.fillMaxWidth())
                Spacer(GlanceModifier.height(8.dp))
                Row(GlanceModifier.fillMaxWidth()) {
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
        Row(modifier = GlanceModifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp)) {
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
internal fun itemLogHref(d: CurrentProgressData): String =
    if (d.itemType != "book" || d.passId.isBlank()) d.deepLink else "/sesion/${d.passId}"
