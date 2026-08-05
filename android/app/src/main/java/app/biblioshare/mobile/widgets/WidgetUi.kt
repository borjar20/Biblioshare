package app.biblioshare.mobile.widgets

import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
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
