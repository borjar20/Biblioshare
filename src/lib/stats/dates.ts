// progress_sessions.session_date is a DATE ("YYYY-MM-DD"), interpreted in
// the user's local calendar. These helpers stay in local time so "today"
// and day-bucketing line up with what the user sees, not UTC.

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + days));
}

// Number of days in a "YYYY-MM" month.
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// "Viernes · 17 jul". El día en español va en minúscula; se capitaliza porque
// el frame lo escribe así (y el CSS lo pasa a uppercase de todas formas). La
// misma etiqueta encabeza los cuatro estados del bloque de hoy.
export function todayDateLabel(): string {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "short",
  })
    .format(new Date())
    .replace(",", " ·")
    .replace(/^./, (c) => c.toUpperCase());
}
