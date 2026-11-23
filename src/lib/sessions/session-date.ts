// Fechas y duraciones de las sesiones en «Mi registro» (spec
// 2026-11-11-ficha-linea-de-lectura): absolutas, nunca «hace N meses». En UTC,
// porque `session_date` es una fecha sin hora: en otra zona se iría al día de
// antes. `currentYear` lo pone el servidor, así que servidor y cliente pintan
// lo mismo (sin desajuste de hidratación).
const DAY = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const DAY_YEAR = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

const utc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function sessionDateLabel(iso: string, currentYear: number): string {
  const date = utc(iso);
  return (date.getUTCFullYear() === currentYear ? DAY : DAY_YEAR).format(date);
}

export function monthLabel(monthKey: string, currentYear: number): string {
  const date = utc(`${monthKey}-01`);
  return capitalize((date.getUTCFullYear() === currentYear ? MONTH : MONTH_YEAR).format(date));
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
