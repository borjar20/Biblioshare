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

/** "2026-08-02" → "2/8" para el "desde" del contexto (sin ceros a la izquierda). */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
}

function nthLabel(itemType: string, rereadCount: number): string {
  const n = rereadCount + 1;
  return itemType === "book" ? `${n}.ª lectura` : `${n}.º visionado`;
}

function kindLabel(itemType: string): string {
  return itemType === "series" ? "Serie" : "Libro";
}

function contextLabel(pass: TodayPass): string {
  const parts: string[] = [];
  if (pass.dayNumber != null) parts.push(`Día ${pass.dayNumber}`);
  if (pass.startedOn) parts.push(`desde ${shortDate(pass.startedOn)}`);
  if (pass.noteCount > 0) parts.push(pass.noteCount === 1 ? "1 nota" : `${pass.noteCount} notas`);
  return parts.join(" · ");
}

function oneInProgress(pass: TodayPass): CurrentProgressWidgetData {
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

  let progressLabel = "Sin progreso";
  let subtitle = item.subtitle;
  if (item.itemType === "book" && progress) {
    progressLabel = `${progress.current} de ${progress.total} páginas`;
  } else if (item.itemType === "series") {
    if ("season" in item.position) {
      subtitle = `Temporada ${item.position.season} · Episodio ${item.position.episode}`;
    }
    if (progress) progressLabel = `${progress.current} de ${progress.total} episodios`;
  }

  return {
    passId: item.activePassId ?? "",
    itemType: item.itemType,
    itemId: item.itemId,
    title: item.title,
    subtitle,
    coverUrl: item.coverUrl,
    percentage,
    progressLabel,
    deepLink,
    nthLabel: nthLabel(item.itemType, item.rereadCount),
    contextLabel: contextLabel(pass),
    streakDays: pass.streakDays,
    week: pass.week.map((d, i) => ({ active: d.active, today: i === pass.week.length - 1 })),
    kindLabel: kindLabel(item.itemType),
  };
}

export function buildInProgress(passes: TodayPass[]): CurrentProgressWidgetData[] {
  return passes.map(oneInProgress);
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
  passes: TodayPass[];
  total: number;
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
    inProgress: buildInProgress(input.passes),
    inProgressTotal: input.total,
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
