"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";
import { formatDayMonth, formatEventDate } from "@/lib/clubs/activities/format-date";
import { MARK_ACCENT } from "./mark-accent";

export function AgendaList({ marks }: { marks: CalendarMark[] }) {
  const t = useTranslations("activity");

  if (marks.length === 0) {
    return (
      <p className="rounded-card border border-border bg-surface p-4 text-sm text-muted-foreground">
        {t("calendarEmptyMonth")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {marks.map((mark, i) => {
        const { day, month } = formatDayMonth(mark.date);
        const accent = MARK_ACCENT[mark.markKind];

        const inner = (
          <>
            <span aria-hidden className="flex w-10 shrink-0 flex-col items-center leading-none">
              <span className="font-serif text-xl font-semibold text-foreground">{day}</span>
              <span className="mt-0.5 font-mono text-[8.5px] text-muted-foreground uppercase">
                {month}
              </span>
            </span>
            <span className="sr-only">{formatEventDate(mark.date)}</span>
            <span className="flex min-w-0 flex-1 flex-col border-l border-border pl-3">
              <span
                className={`mb-1.5 inline-flex w-fit items-center gap-1.5 rounded-chip px-2 py-0.5 font-mono text-[9px] tracking-wide uppercase ${accent.bgSoft} ${accent.text}`}
              >
                <span aria-hidden className={`h-1.5 w-1.5 rounded-[2px] ${accent.bar}`} />
                {t(`markKind_${mark.markKind}`)}
              </span>
              <span className="truncate font-serif text-[14.5px] leading-tight font-semibold text-foreground">
                {mark.title}
              </span>
              {mark.detail && (
                <span className="mt-1 truncate text-[11.5px] text-muted-foreground">
                  {mark.detail}
                </span>
              )}
            </span>
          </>
        );

        const clases = `flex items-start gap-3 rounded-card border border-border bg-surface px-3 py-3 ${
          mark.past ? "opacity-50" : ""
        }`;

        // Un evento NO enlaza: no tiene ficha y el <Link> daría 404. El mismo
        // envoltorio condicional que activity-card.tsx.
        return (
          <li key={`${mark.activityId}-${mark.markKind}-${i}`}>
            {mark.href ? (
              <Link href={mark.href} className={`${clases} hover:opacity-80`}>
                {inner}
              </Link>
            ) : (
              <div className={clases}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
