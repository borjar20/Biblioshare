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

private val sampleBook = CurrentProgressData(
    passId = "pass-1",
    itemType = "book",
    itemId = "item-1",
    title = "Dune",
    subtitle = "Frank Herbert",
    coverUrl = null, // sin portada cacheada → se ve el placeholder
    currentValue = 184,
    totalValue = 430,
    percentage = 43,
    progressLabel = "184 de 430 páginas",
    statusLabel = "Últ. actividad 03/08",
    deepLink = "/sesion/pass-1",
)

private val sampleSeries = sampleBook.copy(
    itemType = "series",
    title = "Severance",
    subtitle = "Temporada 2 · Episodio 4",
    currentValue = 12,
    totalValue = 30,
    percentage = 40,
    progressLabel = "12 de 30 episodios",
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

// --- En curso ---------------------------------------------------------------

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = COMPACT_DP, heightDp = COMPACT_DP)
@Composable
fun PreviewProgressCompact() {
    CurrentProgressContent(ProgressWidgetState.Content(sampleBook, stale = false), cover = null)
}

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = WIDE_W_DP, heightDp = WIDE_H_DP)
@Composable
fun PreviewProgressWide() {
    CurrentProgressContent(ProgressWidgetState.Content(sampleBook, stale = false), cover = null)
}

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = WIDE_W_DP, heightDp = WIDE_H_DP)
@Composable
fun PreviewProgressSeriesStale() {
    CurrentProgressContent(ProgressWidgetState.Content(sampleSeries, stale = true), cover = null)
}

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = COMPACT_DP, heightDp = COMPACT_DP)
@Composable
fun PreviewProgressEmpty() {
    CurrentProgressContent(ProgressWidgetState.NothingInProgress, cover = null)
}

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = COMPACT_DP, heightDp = COMPACT_DP)
@Composable
fun PreviewProgressSignedOut() {
    CurrentProgressContent(ProgressWidgetState.SignedOut, cover = null)
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
