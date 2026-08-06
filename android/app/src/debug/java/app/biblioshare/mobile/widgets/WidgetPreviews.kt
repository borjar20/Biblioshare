package app.biblioshare.mobile.widgets

import androidx.compose.runtime.Composable
import androidx.glance.preview.ExperimentalGlancePreviewApi
import androidx.glance.preview.Preview

// Previews de los widgets para el panel de Android Studio: se ven los dos
// tamaños y TODOS los estados sin emulador, sin instalar y sin desplegar la web
// — el widget es una función pura del snapshot, así que basta con darle uno de
// mentira.
//
// Abre este fichero en Android Studio y pulsa "Split"/"Design". Solo existe en
// el source set `debug`, así que no entra en el APK de release.
//
// Los estados vivos (los que dependen de datos reales) se prueban en
// WidgetStateTest.kt, que corre en JVM sin dispositivo.

private const val COMPACT_DP = 110
private const val WIDE_W_DP = 240
private const val WIDE_H_DP = 110
private const val COMPLETO_W_DP = 380
private const val COMPLETO_H_DP = 560
private const val QUICK_REGISTER_W_DP = 340
private const val QUICK_REGISTER_PICK_H_DP = 420
private const val QUICK_REGISTER_REGISTER_H_DP = 360

// Destacado con progreso, racha y semana — ejercita FeaturedCard al completo.
private val sampleFeatured = CurrentProgressData(
    passId = "p1",
    itemType = "book",
    itemId = "b1",
    title = "Salitre y Cenizas",
    subtitle = null,
    coverUrl = null, // sin portada cacheada → se ve el placeholder
    percentage = 25,
    progressLabel = "60 de 240 páginas",
    deepLink = "/sesion/p1",
    nthLabel = "1.ª lectura",
    contextLabel = "Día 4 · desde 2/8 · 1 nota",
    streakDays = 3,
    week = List(7) { WidgetWeekDay(active = it in 3..6, today = it == 6) },
    kindLabel = "Libro",
)

// Otra lectura a medias, sin progreso todavía — ejercita ContinueGrid y el
// fallback "Sin progreso" de contextLabel en blanco.
private val sampleOther = sampleFeatured.copy(
    passId = "p2",
    itemId = "b2",
    title = "Siega",
    percentage = null,
    progressLabel = "Sin progreso",
    deepLink = "/sesion/p2",
    contextLabel = "",
    streakDays = 0,
    week = emptyList(),
)

private val sampleGoal = DailyGoalData(
    date = "2026-08-05",
    goalType = "minutes",
    currentValue = 32,
    targetValue = 40,
    percentage = 80,
    progressLabel = "32 / 40 min",
    message = "Te quedan 8 minutos",
    streak = 12,
    completed = false,
    deepLink = "/",
)

// --- En curso (Completo, un solo tamaño grande) -----------------------------

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = COMPLETO_W_DP, heightDp = COMPLETO_H_DP)
@Composable
fun PreviewCompleto() {
    CurrentProgressContent(
        ProgressWidgetState.Content(
            items = listOf(sampleFeatured, sampleOther),
            selectedPassId = null,
            total = 2,
            stale = false,
        ),
        covers = emptyMap(),
    )
}

// Cronómetro nativo corriendo para el destacado (Task 17). El Chronometer no
// tickea en el panel de previews de Android Studio — el tick en vivo se
// verifica en dispositivo (#485) — pero el layout del pie (reloj + Descartar/
// Registrar) sí se ve.
@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = COMPLETO_W_DP, heightDp = COMPLETO_H_DP)
@Composable
fun PreviewCompletoTimer() {
    CurrentProgressContent(
        ProgressWidgetState.Content(
            items = listOf(sampleFeatured, sampleOther),
            selectedPassId = null,
            total = 2,
            stale = false,
        ),
        covers = emptyMap(),
        running = (System.currentTimeMillis() - 5 * 60_000L).let { TimerLogic.Running("p1", it, it) },
    )
}

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = COMPLETO_W_DP, heightDp = COMPLETO_H_DP)
@Composable
fun PreviewCompletoNothingInProgress() {
    CurrentProgressContent(ProgressWidgetState.NothingInProgress, covers = emptyMap())
}

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = COMPLETO_W_DP, heightDp = COMPLETO_H_DP)
@Composable
fun PreviewCompletoSignedOut() {
    CurrentProgressContent(ProgressWidgetState.SignedOut, covers = emptyMap())
}

// --- Objetivo de hoy --------------------------------------------------------

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = COMPACT_DP, heightDp = COMPACT_DP)
@Composable
fun PreviewGoalCompact() {
    DailyGoalContent(GoalWidgetState.Content(sampleGoal))
}

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = WIDE_W_DP, heightDp = WIDE_H_DP)
@Composable
fun PreviewGoalWide() {
    DailyGoalContent(GoalWidgetState.Content(sampleGoal))
}

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = WIDE_W_DP, heightDp = WIDE_H_DP)
@Composable
fun PreviewGoalCompleted() {
    DailyGoalContent(
        GoalWidgetState.Content(
            sampleGoal.copy(
                currentValue = 45,
                percentage = 100,
                progressLabel = "45 / 40 min",
                message = "Objetivo completado",
                completed = true,
            ),
        ),
    )
}

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = WIDE_W_DP, heightDp = WIDE_H_DP)
@Composable
fun PreviewGoalOutdated() {
    DailyGoalContent(GoalWidgetState.Outdated(sampleGoal.copy(date = "2026-08-04")))
}

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = COMPACT_DP, heightDp = COMPACT_DP)
@Composable
fun PreviewGoalNoGoal() {
    DailyGoalContent(GoalWidgetState.NoGoal)
}

// --- Registro rápido (2 pasos) ----------------------------------------------

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = QUICK_REGISTER_W_DP, heightDp = QUICK_REGISTER_PICK_H_DP)
@Composable
fun PreviewQuickRegisterPick() {
    QuickRegisterContent(
        QuickRegisterState.Pick(listOf(sampleFeatured, sampleOther)),
        covers = emptyMap(),
        minutes = 30,
    )
}

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = QUICK_REGISTER_W_DP, heightDp = QUICK_REGISTER_REGISTER_H_DP)
@Composable
fun PreviewQuickRegisterRegisterBook() {
    QuickRegisterContent(
        QuickRegisterState.Register(sampleFeatured),
        covers = emptyMap(),
        minutes = 30,
    )
}
