"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MonthCalendar as MonthCalendarData } from "@/lib/stats/types";
import { CalendarIcon } from "@/components/ui/icons";

const WEEKDAY_HEADERS = ["L", "M", "X", "J", "V", "S", "D"];
const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// Monday-first index (0=Mon .. 6=Sun) of a "YYYY-MM-DD" date.
function mondayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

export function MonthCalendar({
  initialCalendar,
  basePath,
}: {
  initialCalendar: MonthCalendarData;
  basePath: string;
}) {
  const t = useTranslations("stats");
  const [calendar, setCalendar] = useState<MonthCalendarData>(initialCalendar);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [year, month] = calendar.month.split("-").map(Number);
  const leadingBlanks =
    calendar.days.length > 0 ? mondayIndex(calendar.days[0].date) : 0;

  async function loadMonth(monthKey: string) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${basePath}api/month-calendar?month=${monthKey}`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error ?? "Failed to load calendar");
      }

      const nextCalendar = (await response.json()) as MonthCalendarData;
      setCalendar(nextCalendar);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error cargando el calendario",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
        <CalendarIcon className="h-5 w-5 text-accent" />
        {t("calendarTitle")}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => loadMonth(calendar.prevMonth)}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t("prevMonth")}
          >
            ‹
          </button>
          <span className="font-medium text-foreground">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            type="button"
            onClick={() => loadMonth(calendar.nextMonth)}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t("nextMonth")}
          >
            ›
          </button>
        </div>
        {loading && (
          <span className="text-sm text-muted-foreground">
            {t("common.loading")}
          </span>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-status-dropped bg-status-dropped/10 p-3 text-sm text-status-dropped">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-2 grid grid-cols-7 gap-1.5">
          {WEEKDAY_HEADERS.map((label, i) => (
            <span
              key={i}
              className="text-center text-[11px] text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {calendar.days.map((day) => {
            const dayNum = Number(day.date.slice(8, 10));
            return (
              <div
                key={day.date}
                className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-md border text-xs ${
                  day.active
                    ? "border-accent text-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {day.active && day.coverUrl ? (
                  <>
                    <Image
                      src={day.coverUrl}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover opacity-80"
                    />
                    <span className="relative z-10 rounded bg-background/70 px-1 font-medium">
                      {dayNum}
                    </span>
                  </>
                ) : (
                  dayNum
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
