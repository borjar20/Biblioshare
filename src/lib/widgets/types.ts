// Contrato del snapshot de los widgets Android. Espejo EXACTO del modelo
// Kotlin (android/.../widgets/WidgetSnapshot.kt): si cambias algo aquí, sube
// WIDGET_SCHEMA_VERSION en los DOS lados — un APK viejo descarta versiones que
// no conoce y cae al estado vacío, nunca pinta campos a medias.
//
// Solo datos de presentación + userId (para detectar cambio de cuenta en el
// lado nativo). Nada de tokens, email ni contenido privado (notas/reseñas).

export const WIDGET_SCHEMA_VERSION = 2;

export type WidgetWeekDay = { active: boolean; today: boolean };

export type CurrentProgressWidgetData = {
  passId: string;
  itemType: "book" | "movie" | "series";
  itemId: string;
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  percentage?: number | null; // null = "Sin progreso"
  progressLabel: string;
  deepLink: string;
  nthLabel: string; // "1.ª lectura"
  contextLabel: string; // "Día 4 · desde 2/8 · 1 nota" (puede ir vacío)
  streakDays: number; // 0 = sin racha
  week: WidgetWeekDay[]; // 7 días, antiguo→hoy
  kindLabel: string; // "Libro" | "Serie"
};

export type DailyGoalWidgetData = {
  /** "YYYY-MM-DD" del día al que pertenece el cálculo. */
  date: string;
  goalType: "pages" | "minutes" | "episodes" | "sessions";
  currentValue: number;
  targetValue: number;
  percentage: number;
  progressLabel: string;
  /** Mensaje contextual ya redactado ("Te quedan 8 minutos", …). */
  message: string;
  streak?: number | null;
  completed: boolean;
  deepLink: string;
};

export type WidgetSnapshot = {
  version: number;
  userId: string;
  generatedAt: string;
  inProgress: CurrentProgressWidgetData[]; // [0] = destacado por defecto
  inProgressTotal: number;
  dailyGoal: DailyGoalWidgetData | null; // GLOBAL (meta de hoy)
};
