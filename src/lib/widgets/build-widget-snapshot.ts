import type { TodayPass } from "@/lib/stats/get-today-focus";
import { getProgress } from "@/lib/library/progress";
import { itemHref } from "@/lib/catalog/item-href";
import {
  WIDGET_SCHEMA_VERSION,
  type CurrentProgressWidgetData,
  type DailyGoalWidgetData,
  type WidgetSnapshot,
} from "./types";

// Funciones PURAS que traducen los datos del dominio al snapshot del widget.
// Aquí no hay reglas de negocio nuevas:
//
// - La SELECCIÓN del elemento en curso es el `featured` de getTodayFocus —
//   la sesión más reciente, la misma regla (y decisión de usuario, 2026-07-17)
//   que la tarjeta destacada del dashboard. No se inventa otra.
// - El progreso reutiliza getProgress (position.page/pageCount,
//   position.episode/totalEpisodes); solo se redacta distinto para el widget.
// - El objetivo diario es profiles.daily_goal_minutes contra los minutos de
//   lectura de HOY — la misma cuenta que TodayCard y que la celebración
//   daily_goal_completed. Solo existe en minutos: no hay objetivo diario de
//   páginas/episodios en el modelo, y este widget no lo crea.

/** "2026-08-03" → "03/08" para el "Últ. actividad". */
function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function buildCurrentProgressData(
  pass: TodayPass | null,
): CurrentProgressWidgetData | null {
  if (!pass) return null;
  const { item } = pass;
  const progress = getProgress(item);
  const percentage = progress
    ? Math.min(100, Math.round((progress.current / progress.total) * 100))
    : null;

  // Sin pase activo (dato huérfano) el registro de sesión no existe: se navega
  // a la ficha, igual que con las películas (su registro ES la ficha).
  const deepLink =
    item.itemType !== "movie" && item.activePassId
      ? `/sesion/${item.activePassId}`
      : itemHref(item.itemType, item.itemId);

  let subtitle = item.subtitle;
  let progressLabel = "En curso";
  let currentValue = 0;

  if (item.itemType === "book") {
    const page =
      "page" in item.position && item.position.page !== undefined
        ? item.position.page
        : null;
    if (progress) {
      progressLabel = `${progress.current} de ${progress.total} páginas`;
      currentValue = progress.current;
    } else if (page !== null) {
      // Página sin total conocido: no se inventa porcentaje.
      progressLabel = `Pág. ${page}`;
      currentValue = page;
    }
  } else if (item.itemType === "series") {
    if ("season" in item.position) {
      subtitle = `Temporada ${item.position.season} · Episodio ${item.position.episode}`;
      currentValue = item.position.episode;
    }
    if (progress) {
      // No todas las series tienen total fiable: solo si totalEpisodes existe.
      progressLabel = `${progress.current} de ${progress.total} episodios`;
      currentValue = progress.current;
    }
  }
  // Película: sin progreso granular persistente en el modelo → "En curso".

  return {
    passId: item.activePassId ?? "",
    itemType: item.itemType,
    itemId: item.itemId,
    title: item.title,
    subtitle,
    coverUrl: item.coverUrl,
    currentValue,
    totalValue: progress?.total ?? null,
    percentage,
    progressLabel,
    statusLabel: pass.lastSessionDate
      ? `Últ. actividad ${shortDate(pass.lastSessionDate)}`
      : null,
    deepLink,
  };
}

export function buildDailyGoalData(input: {
  date: string;
  goalMinutes: number | null;
  todayMinutes: number;
  streak: number;
}): DailyGoalWidgetData | null {
  const { date, goalMinutes, todayMinutes, streak } = input;
  // Sin objetivo configurado no hay nada que medir: el widget muestra el
  // estado "configúralo en la app", no un objetivo inventado.
  if (!goalMinutes || goalMinutes <= 0) return null;

  const completed = todayMinutes >= goalMinutes;
  const message = completed
    ? "Objetivo completado"
    : todayMinutes === 0
      ? "Aún no has registrado progreso hoy"
      : `Te quedan ${goalMinutes - todayMinutes} minutos`;

  return {
    date,
    goalType: "minutes",
    currentValue: todayMinutes,
    targetValue: goalMinutes,
    // Mismo redondeo/clamp que el goalPercent de TodayCard.
    percentage: Math.min(100, Math.round((todayMinutes / goalMinutes) * 100)),
    progressLabel: `${todayMinutes} / ${goalMinutes} min`,
    message,
    streak,
    completed,
    deepLink: "/",
  };
}

export function buildWidgetSnapshot(input: {
  userId: string;
  featured: TodayPass | null;
  date: string;
  goalMinutes: number | null;
  todayMinutes: number;
  streak: number;
  now?: Date;
}): WidgetSnapshot {
  return {
    version: WIDGET_SCHEMA_VERSION,
    userId: input.userId,
    generatedAt: (input.now ?? new Date()).toISOString(),
    currentProgress: buildCurrentProgressData(input.featured),
    dailyGoal: buildDailyGoalData(input),
  };
}

/**
 * Huella para deduplicar escrituras al plugin: dos snapshots con el mismo
 * contenido visible no deben re-notificar a los widgets aunque cambie
 * generatedAt. La fecha del objetivo SÍ forma parte del contenido (cambio de
 * día = snapshot distinto).
 */
export function snapshotFingerprint(snapshot: WidgetSnapshot): string {
  return JSON.stringify({ ...snapshot, generatedAt: null });
}
