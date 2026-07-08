// Aggregated progress-tracking stats (docs/REQUIREMENTS.md §7.14), all
// derived from progress_sessions (books/series) and diary_entries.

export type DayActivity = {
  date: string; // "YYYY-MM-DD"
  minutes: number;
  active: boolean;
};

export type Streaks = {
  current: number;
  best: number;
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

export type AnnualCompleted = {
  year: number;
  months: MonthlyCompleted[];
  total: number;
};
