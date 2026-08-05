// Contrato del snapshot de los widgets Android. Espejo EXACTO del modelo
// Kotlin (android/.../widgets/WidgetSnapshot.kt): si cambias algo aquí, sube
// WIDGET_SCHEMA_VERSION en los DOS lados — un APK viejo descarta versiones que
// no conoce y cae al estado vacío, nunca pinta campos a medias.
//
// Solo datos de presentación + userId (para detectar cambio de cuenta en el
// lado nativo). Nada de tokens, email ni contenido privado (notas/reseñas).

export const WIDGET_SCHEMA_VERSION = 1;

export type CurrentProgressWidgetData = {
  passId: string;
  itemType: "book" | "movie" | "series";
  itemId: string;
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  currentValue: number;
  totalValue?: number | null;
  percentage?: number | null;
  progressLabel: string;
  statusLabel?: string | null;
  deepLink: string;
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
  currentProgress: CurrentProgressWidgetData | null;
  dailyGoal: DailyGoalWidgetData | null;
};
