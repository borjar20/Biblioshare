import { groupReleaseDays, type ReleaseDayGroup, type ReleaseWork } from "./presentation";
import { isExactReleaseDate } from "./precision";
import { daysInMonth, shiftMonth } from "@/lib/stats/dates";
import type { ReleaseItemType } from "./types";

export type ReleaseCalendarView = "main" | "limited" | "undated";
export type ReleaseCalendarState = { month: string; day: string | null; view: ReleaseCalendarView };
export type ReleaseCalendarMark = { date: string; main: number; limited: number; types: ReleaseItemType[]; cancelled: number };
export type ReleaseMonthAgenda = { groups: ReleaseDayGroup[]; partial: ReleaseWork[] };

export function isReleaseMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1400 && Number(value.slice(0, 4)) <= 2200;
}
export function releaseCalendarState(search: string, today: string, fallbackMonth?: string): ReleaseCalendarState {
  const params = new URLSearchParams(search);
  const requested = params.get("mes") ?? "";
  const month = isReleaseMonth(requested) ? requested : fallbackMonth && isReleaseMonth(fallbackMonth) ? fallbackMonth : today.slice(0, 7);
  const rawDay = params.get("dia") ?? "";
  return { month, day: isExactReleaseDate(rawDay) && rawDay.startsWith(month + "-") ? rawDay : null,
    view: params.get("vista") === "limitadas" ? "limited" : params.get("vista") === "sin-mes" ? "undated" : "main" };
}
export function releaseCalendarPath(search: string, change: Partial<ReleaseCalendarState>): string {
  const params = new URLSearchParams(search);
  if (change.month !== undefined && isReleaseMonth(change.month)) { params.set("mes", change.month); params.delete("dia"); }
  if (change.day !== undefined) {
    if (change.day && isExactReleaseDate(change.day)) params.set("dia", change.day);
    else params.delete("dia");
  }
  if (change.view !== undefined) {
    if (change.view === "main") params.delete("vista");
    else params.set("vista", change.view === "limited" ? "limitadas" : "sin-mes");
  }
  return "/novedades" + (params.size ? "?" + params.toString() : "");
}
export function releaseCalendarMonths(works: ReleaseWork[]): string[] {
  return [...new Set(works.flatMap((work) => work.releases
    .filter((row) => (row.date_precision === "day" || row.date_precision === "month") && row.date_value && isReleaseMonth(row.date_value.slice(0, 7)))
    .map((row) => row.date_value!.slice(0, 7))))].sort();
}
/** Every real launch day is visible; the count is distinct works, not duplicate modalities. */
export function releaseCalendarMarks(main: ReleaseWork[], limited: ReleaseWork[], month: string): ReleaseCalendarMark[] {
  const marks = new Map<string, ReleaseCalendarMark>();
  for (const [works, kind] of [[main, "main"], [limited, "limited"]] as const) for (const work of works) {
    const dates = new Set(work.releases.filter((row) => row.date_precision === "day" && row.date_value?.startsWith(month + "-")).map((row) => row.date_value!));
    for (const date of dates) {
      const mark = marks.get(date) ?? { date, main: 0, limited: 0, types: [], cancelled: 0 };
      mark[kind]++;
      if (!mark.types.includes(work.itemType)) mark.types.push(work.itemType);
      mark.cancelled += work.releases.filter((row) => row.date_precision === "day" && row.date_value === date && row.status === "cancelled").length;
      marks.set(date, mark);
    }
  }
  return [...marks.values()].sort((a, b) => a.date.localeCompare(b.date));
}
/** Group within the chosen period, then restore complete works so their notices stay manageable. */
export function releaseMonthAgenda(works: ReleaseWork[], month: string, today: string, day: string | null = null): ReleaseMonthAgenda {
  const original = new Map(works.map((work) => [work.workKey, work]));
  const scoped = works.map((work) => ({ ...work, releases: work.releases.filter((row) => row.date_precision === "day" &&
    row.date_value?.startsWith(month + "-") && (!day || row.date_value === day)) })).filter((work) => work.releases.length > 0);
  const groups = groupReleaseDays(scoped, new Date(today + "T12:00:00Z"))
    .map((group) => ({ ...group, works: group.works.map((work) => original.get(work.workKey)!) }));
  const placed = new Set(scoped.map((work) => work.workKey));
  const partial = day ? [] : works.filter((work) => !placed.has(work.workKey) && work.releases
    .some((row) => row.date_precision === "month" && row.date_value === month));
  return { groups, partial };
}
export function releaseUnplacedWorks(works: ReleaseWork[]): ReleaseWork[] {
  return works.filter((work) => work.releases.some((row) => row.date_precision === "year" || row.date_precision === "unknown"));
}
/** Monday-first civil dates; no browser time zone can move a date to the preceding day. */
export function releaseMonthCells(month: string): Array<{ date: string; outside: boolean }> {
  const first = (new Date(month + "-01T12:00:00Z").getUTCDay() + 6) % 7;
  const cells: Array<{ date: string; outside: boolean }> = [];
  const previous = shiftMonth(month, -1);
  for (let i = first; i > 0; i--) cells.push({ date: previous + "-" + String(daysInMonth(previous) - i + 1).padStart(2, "0"), outside: true });
  for (let day = 1; day <= daysInMonth(month); day++) cells.push({ date: month + "-" + String(day).padStart(2, "0"), outside: false });
  const next = shiftMonth(month, 1);
  for (let day = 1; cells.length % 7 !== 0; day++) cells.push({ date: next + "-" + String(day).padStart(2, "0"), outside: true });
  return cells;
}
