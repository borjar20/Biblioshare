import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { MonthCalendar as MonthCalendarData } from "@/lib/stats/types";

const WEEKDAY_HEADERS = ["L", "M", "X", "J", "V", "S", "D"];
const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Monday-first index (0=Mon .. 6=Sun) of a "YYYY-MM-DD" date.
function mondayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

export async function MonthCalendar({
  calendar,
  basePath,
}: {
  calendar: MonthCalendarData;
  basePath: string;
}) {
  const t = await getTranslations("stats");
  const [year, month] = calendar.month.split("-").map(Number);
  const leadingBlanks = calendar.days.length > 0 ? mondayIndex(calendar.days[0].date) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{t("calendarTitle")}</h2>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`${basePath}?month=${calendar.prevMonth}`}
            className="text-muted-foreground hover:text-foreground"
            aria-label={t("prevMonth")}
          >
            ‹
          </Link>
          <span className="font-medium text-foreground">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <Link
            href={`${basePath}?month=${calendar.nextMonth}`}
            className="text-muted-foreground hover:text-foreground"
            aria-label={t("nextMonth")}
          >
            ›
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-2 grid grid-cols-7 gap-1.5">
          {WEEKDAY_HEADERS.map((label, i) => (
            <span key={i} className="text-center text-[11px] text-muted-foreground">
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
