// Recuento del pase para el cierre (spec 2026-11-07, «El cierre», 1). Puro.
export type ClosingRecap = { sessions: number; days: number; longestStreak: number; pages: number | null; episodes: number | null };

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

export function longestStreak(dates: string[]): number {
  const days = [...new Set(dates.map(dayNumber))].sort((a, b) => a - b);
  let best = 0, run = 0, prev = Number.NaN;
  for (const d of days) {
    run = d === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function daysSpan(dates: string[]): number {
  if (dates.length === 0) return 0;
  const days = dates.map(dayNumber);
  return Math.max(...days) - Math.min(...days) + 1;
}

export function computeRecap(input: { sessionDates: string[]; pages: number | null; episodes: number | null }): ClosingRecap {
  return {
    sessions: input.sessionDates.length,
    days: daysSpan(input.sessionDates),
    longestStreak: longestStreak(input.sessionDates),
    pages: input.pages,
    episodes: input.episodes,
  };
}
