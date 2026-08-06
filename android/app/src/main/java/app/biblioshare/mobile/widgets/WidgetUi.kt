package app.biblioshare.mobile.widgets

import android.graphics.Bitmap
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
}

fun titleStyle() = TextStyle(color = WidgetPalette.fg, fontSize = 13.sp, fontWeight = FontWeight.Bold)
fun bigStyle() = TextStyle(color = WidgetPalette.fg, fontSize = 17.sp, fontWeight = FontWeight.Bold)
fun bodyStyle() = TextStyle(color = WidgetPalette.fg, fontSize = 12.sp)
fun softStyle() = TextStyle(color = WidgetPalette.fgSoft, fontSize = 11.sp)
fun accentStyle() = TextStyle(color = WidgetPalette.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)

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
                        modifier = GlanceModifier.defaultWeight().padding(end = 8.dp)
                            .clickable(actionRunCallback<SelectFocusAction>(actionParametersOf(PASS_ID_PARAM to d.passId))),
                    ) {
                        Cover(d.coverUrl?.let(covers::get), width = 64, height = 92)
                        Spacer(GlanceModifier.height(4.dp))
                        Text(d.title, style = softStyle(), maxLines = 1)
                    }
                }
            }
            Spacer(GlanceModifier.height(10.dp))
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

/** Chip de minutos del paso 2: relleno de acento cuando está activo, track si no. */
@Composable
fun MinuteChip(label: String, active: Boolean, onClick: Action) {
    Box(
        modifier = GlanceModifier
            .clickable(onClick)
            .background(if (active) WidgetPalette.accent else WidgetPalette.track)
            .cornerRadius(10.dp)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = TextStyle(
                color = if (active) WidgetPalette.bg else WidgetPalette.fg,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
            ),
        )
    }
}

/** Botón primario (Guardar sesión / Abrir para registrar): relleno de acento a
 *  todo el ancho. Distinto de [ActionCell] (que siempre pinta sobre `track`,
 *  pensado para acciones secundarias en pareja) — este es el CTA único del paso 2. */
@Composable
fun PrimaryButton(label: String, onClick: Action) {
    Box(
        modifier = GlanceModifier
            .fillMaxWidth()
            .clickable(onClick)
            .background(WidgetPalette.accent)
            .cornerRadius(10.dp)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = TextStyle(color = WidgetPalette.bg, fontSize = 13.sp, fontWeight = FontWeight.Bold))
    }
}
