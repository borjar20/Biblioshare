import type { ItemType } from "@/lib/catalog/types";

// Aggregated progress-tracking stats (docs/REQUIREMENTS.md §7.14), all
// derived from progress_sessions (books/series) and diary_entries.

export type DayActivity = {
  date: string; // "YYYY-MM-DD"
  minutes: number; // reading minutes only — see getWeeklyActivity
  active: boolean;
};

export type Streaks = {
  current: number;
  best: number;
  /**
   * Días DISTINTOS con actividad en todo el histórico. Sale del mismo conjunto
   * que las dos rachas, así que no cuesta una consulta: es su tamaño. Ojo, no
   * es «racha»: cuenta días sueltos, sin exigir que sean seguidos.
   */
  activeDays: number;
};

export type CalendarDay = {
  date: string; // "YYYY-MM-DD"
  active: boolean;
  coverUrl: string | null;
};

export type MonthCalendar = {
  month: string; // "YYYY-MM"
  days: CalendarDay[];
  prevMonth: string;
  nextMonth: string;
};

export type MonthlyCompleted = {
  month: string; // "YYYY-MM"
  count: number;
};

// Completed items for a year: the 12-month histogram (all types combined, for
// the bar chart) plus a per-type total, since the annual goal is now one per
// item type — see profiles.annual_goal_books/movies/series (§7.14).
export type AnnualCompleted = {
  year: number;
  months: MonthlyCompleted[];
  total: number;
  byType: Record<ItemType, number>;
};
