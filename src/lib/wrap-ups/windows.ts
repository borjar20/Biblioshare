// Ventanas de los wrap-ups (spec 2026-10-06 §2). Todo en fechas LOCALES de
// Europe/Madrid como cadenas YYYY-MM-DD: el servidor corre en UTC y una ventana
// calculada con Date local se correría un día alrededor de medianoche.
import { addDaysISO } from "@/lib/stats/dates";
import type { StatsWindow } from "@/lib/stats/period";

export type WrapUpKind = "week" | "month" | "year";
export const WRAP_UP_KINDS = ["week", "month", "year"] as const satisfies readonly WrapUpKind[];
export function isWrapUpKind(v: unknown): v is WrapUpKind {
  return typeof v === "string" && (WRAP_UP_KINDS as readonly string[]).includes(v);
}

export type WrapUpWindow = StatsWindow & { kind: WrapUpKind; end: string };

const MADRID = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
});

export function madridToday(now: Date): string {
  return MADRID.format(now); // en-CA formatea como YYYY-MM-DD
}

/** 0 = lunes … 6 = domingo, para una fecha YYYY-MM-DD (aritmética en UTC, sin DST). */
function isoWeekday(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function firstOfMonth(iso: string, delta: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

export function wrapUpWindow(kind: WrapUpKind, now = new Date()): WrapUpWindow {
  const today = madridToday(now);
  if (kind === "week") {
    const thisMonday = addDaysISO(today, -isoWeekday(today));
    const start = addDaysISO(thisMonday, -7);
    return {
      kind, start, endExclusive: thisMonday, end: addDaysISO(thisMonday, -1), grain: "day",
      previous: { start: addDaysISO(start, -7), endExclusive: start },
    };
  }
  if (kind === "month") {
    const endExclusive = firstOfMonth(today, 0);
    const start = firstOfMonth(today, -1);
    return {
      kind, start, endExclusive, end: addDaysISO(endExclusive, -1), grain: "day",
      previous: { start: firstOfMonth(today, -2), endExclusive: start },
    };
  }
  const y = Number(today.slice(0, 4));
  const year = today >= `${y}-12-26` ? y : y - 1;
  return {
    kind, start: `${year}-01-01`, endExclusive: `${year}-12-26`, end: `${year}-12-25`, grain: "month",
    previous: { start: `${year - 1}-01-01`, endExclusive: `${year - 1}-12-26` },
  };
}
