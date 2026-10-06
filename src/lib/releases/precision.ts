import type { ReleaseDatePrecision } from "./types";

export type ReleaseDateParts = {
  date_precision: ReleaseDatePrecision;
  date_value: string | null;
};

export function isExactReleaseDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1400 || year > 2200) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Partial dates keep their precision and never acquire a synthetic day. */
export function parseReleaseDate(value: string | null | undefined): ReleaseDateParts {
  const raw = value?.trim() ?? "";
  if (!raw) return { date_precision: "unknown", date_value: null };
  if (isExactReleaseDate(raw)) {
    return { date_precision: "day", date_value: raw };
  }
  if (/^\d{4}(-\d{2})?$/.test(raw)) {
    const year = Number(raw.slice(0, 4));
    const month = raw.length === 7 ? Number(raw.slice(5, 7)) : null;
    if (year >= 1400 && year <= 2200 && (month === null || (month >= 1 && month <= 12))) {
      return { date_precision: month === null ? "year" : "month", date_value: raw };
    }
  }
  throw new Error("invalid");
}

export function formatReleaseDate(parts: ReleaseDateParts, locale = "es-ES"): string {
  if (parts.date_precision === "day" && parts.date_value && isExactReleaseDate(parts.date_value)) {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${parts.date_value}T12:00:00Z`));
  }
  if (parts.date_precision === "month" && parts.date_value) {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${parts.date_value}-15T12:00:00Z`));
  }
  if (parts.date_precision === "year" && parts.date_value) return parts.date_value;
  return "Fecha por confirmar";
}

export function madridDay(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (kind: string) => parts.find((p) => p.type === kind)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addDays(day: string, amount: number): string {
  if (!isExactReleaseDate(day)) throw new Error("invalid");
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
