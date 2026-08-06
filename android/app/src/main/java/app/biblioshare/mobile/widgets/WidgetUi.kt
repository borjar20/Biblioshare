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

/** Carrusel de "Continúa donde lo dejaste": hasta 3 tarjetas HORIZONTALES que
 *  rellenan el ancho (1/3 cada una). Cada tarjeta = portada a la izquierda +
 *  bloque de texto a la derecha (título a 2 líneas con ellipsis, contexto a 1
 *  línea y barra de progreso muy fina), sobre un fondo sutil redondeado. Tocar
 *  una tarjeta cambia el destacado (Glance state, Task 8).
 *
 *  Glance 1.1.1 NO tiene scroll horizontal (solo LazyColumn/LazyVerticalGrid
 *  scrollan): se muestran 3 y el resto se alcanza con «Ver todos» de la cabecera
 *  (que ya trae el total real). `cornerRadius` clipa el fondo en API 31+; en <31
 *  cae a esquinas rectas. */
@Composable
fun ContinueCarousel(others: List<CurrentProgressData>, covers: Map<String, Bitmap?>) {
    val ctx = LocalContext.current
    Row(GlanceModifier.fillMaxWidth()) {
        others.take(CAROUSEL_MAX).forEach { d ->
            Row(
                // Fondo `surface`, no `track`: la barra de progreso usa `track` de
                // fondo, así que sobre una tarjeta `track` era invisible (#498).
                modifier = GlanceModifier.defaultWeight().padding(end = 8.dp)
                    .background(WidgetPalette.surface).cornerRadius(12.dp).padding(8.dp)
                    .clickable(actionRunCallback<SelectFocusAction>(actionParametersOf(PASS_ID_PARAM to d.passId))),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Cover(d.coverUrl?.let(covers::get), width = 44, height = 64)
                Spacer(GlanceModifier.width(8.dp))
                Column(GlanceModifier.defaultWeight()) {
                    Text(d.title, style = titleStyle(), maxLines = 2)
                    Text(
                        d.contextLabel.ifBlank { ctx.getString(R.string.widget_no_progress) },
                        style = softStyle(),
                        maxLines = 1,
                    )
                    Spacer(GlanceModifier.height(4.dp))
                    SoftBar(d.percentage ?: 0, heightDp = 3)
                }
            }
        }
    }
}

private const val CAROUSEL_MAX = 3 // Glance sin scroll horizontal: 3 y el resto por «Ver todos»

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

/** Barra de progreso fina; usa el indicador nativo de Glance (no hay fillMaxWidth(fraction) en 1.1.1).
 *  `heightDp` permite una barra «muy fina» en las tarjetas del carrusel. */
@Composable
fun SoftBar(percent: Int, color: ColorProvider = WidgetPalette.accent, heightDp: Int = 6) {
    LinearProgressIndicator(
        progress = (percent.coerceIn(0, 100)) / 100f,
        modifier = GlanceModifier.fillMaxWidth().height(heightDp.dp),
        color = color,
        backgroundColor = WidgetPalette.track,
    )
}

/** Fila compacta del paso 1 del registro rápido: portada + kindLabel + título +
 *  progreso (o "Sin progreso"), toda la fila clicable. Sin `WidgetCard`: vive
 *  dentro de la tarjeta del widget, no es una pantalla propia. */
@Composable
fun CompactRow(item: CurrentProgressData, cover: Bitmap?, onClick: Action, modifier: GlanceModifier = GlanceModifier) {
    val context = LocalContext.current
    Row(
        modifier = GlanceModifier.fillMaxWidth().then(modifier).clickable(onClick).padding(vertical = 6.dp),
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
    modifier: GlanceModifier = GlanceModifier,
) {
    val ctx = LocalContext.current
    // `modifier` (p. ej. defaultWeight) permite que el foco LLENE el alto cuando
    // no hay nada debajo (Completo con crono activo, #498).
    Column(GlanceModifier.fillMaxWidth().then(modifier).background(ImageProvider(R.drawable.widget_featured_bg))) {
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
        // Al llenar el alto, empuja la sesión al fondo (reparte el hueco arriba y
        // abajo); al envolver, el peso no reparte nada y queda pegado como antes.
        Spacer(GlanceModifier.defaultWeight())
        Box(GlanceModifier.fillMaxWidth().padding(start = 4.dp).height(1.dp).background(WidgetPalette.border)) {}
        SessionTimerView(data, running)
    }
}

/** Vista de sesión compartida por el pie del Completo y el paso 2 del Reducido:
 *  Sesión/Registrar como deep-link plano cuando no hay cronómetro para este pase;
 *  si lo hay, pinta el reloj nativo (Chronometer tickeando si corre, o el tiempo
 *  CONGELADO si está pausado) + Pausar/Reanudar │ Registrar, y Descartar como
 *  enlace secundario. Pasadas 4h corriendo, invita a abrir la app en vez de
 *  seguir tickeando en segundo plano. Pausa nativa: Fase B (#498). */
@Composable
fun SessionTimerView(d: CurrentProgressData, running: TimerLogic.Running?) {
    val ctx = LocalContext.current
    if (running != null && running.passId == d.passId) {
        val now = System.currentTimeMillis()
        if (running.running && isLongSession(running.startedAt, now)) {
            Text(
                ctx.getString(R.string.widget_long_session),
                style = softStyle(),
                modifier = GlanceModifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp)
                    .clickable(actionRunCallback<RegisterTimerAction>()),
            )
        } else {
            Column(modifier = GlanceModifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp)) {
                if (running.running) {
                    val rv = RemoteViews(ctx.packageName, R.layout.widget_chronometer).apply {
                        setChronometer(
                            R.id.widget_chrono,
                            chronometerBase(running.startedAt, now, SystemClock.elapsedRealtime()),
                            null,
                            true,
                        )
                    }
                    // Cronómetro centrado: el Chronometer es match_parent + gravity center.
                    AndroidRemoteViews(rv, GlanceModifier.fillMaxWidth())
                } else {
                    // Pausado: tiempo congelado con el MISMO TextView monospace que el
                    // Chronometer (widget_static_time.xml) — así no cambia la tipografía
                    // ni el relleno de ceros al pausar (#498).
                    val rv = RemoteViews(ctx.packageName, R.layout.widget_static_time).apply {
                        setTextViewText(R.id.widget_static_time, fmtElapsed(elapsedMs(running, now)))
                    }
                    AndroidRemoteViews(rv, GlanceModifier.fillMaxWidth())
                }
                Spacer(GlanceModifier.height(8.dp))
                val toggle = if (running.running) actionRunCallback<PauseTimerAction>()
                             else actionRunCallback<ResumeTimerAction>()
                Row(GlanceModifier.fillMaxWidth()) {
                    ActionCell(
                        ctx.getString(if (running.running) R.string.widget_pause else R.string.widget_resume),
                        WidgetPalette.fg,
                        GlanceModifier.defaultWeight().clickable(toggle),
                    )
                    Spacer(GlanceModifier.width(8.dp))
                    ActionCell(
                        ctx.getString(R.string.widget_register),
                        WidgetPalette.accent,
                        GlanceModifier.defaultWeight()
                            .clickable(actionRunCallback<RegisterTimerAction>()),
                    )
                }
                Spacer(GlanceModifier.height(8.dp))
                ActionCell(
                    ctx.getString(R.string.widget_discard),
                    WidgetPalette.fgSoft,
                    GlanceModifier.fillMaxWidth()
                        .clickable(actionRunCallback<DiscardTimerAction>(actionParametersOf(PASS_ID_PARAM to d.passId))),
                )
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
