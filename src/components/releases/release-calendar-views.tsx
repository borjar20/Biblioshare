"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { releaseCalendarState, releaseCalendarPath, releaseMonthAgenda, releaseUnplacedWorks, type ReleaseCalendarView } from "@/lib/releases/calendar";
import type { ReleaseWork } from "@/lib/releases/presentation";
import styles from "./release-calendar.module.css";

export type ReleaseCalendarViewsProps = { main: ReleaseWork[]; limited: ReleaseWork[]; today: string; fallbackMonth?: string };

export function ReleaseCalendarViews({ main, limited, today, fallbackMonth }: ReleaseCalendarViewsProps) {
  const t = useTranslations("releases");
  const search = useSearchParams().toString();
  const state = releaseCalendarState(search, today, fallbackMonth);
  const count = (works: ReleaseWork[]) => {
    const agenda = releaseMonthAgenda(works, state.month, today);
    return agenda.groups.reduce((sum, group) => sum + group.works.length, 0) + agenda.partial.length;
  };
  const unplaced = releaseUnplacedWorks([...main, ...limited]);
  function chooseView(view: ReleaseCalendarView) {
    const path = releaseCalendarPath(search, { month: state.month, day: view === "undated" ? null : state.day, view });
    if (path !== "/novedades" + (search ? "?" + search : "")) window.history.pushState(null, "", path);
  }
  return <div className={styles.views} role="group" aria-label={t("calendarViews")}>
    <Button variant="ghost" className="min-h-11 rounded-lg px-2 text-xs" aria-pressed={state.view === "main"} onClick={() => chooseView("main")}>
      {t("calendarMain")} <span className={styles.viewCount}>({count(main)})</span>
    </Button>
    {limited.length > 0 && <Button variant="ghost" className="min-h-11 rounded-lg px-2 text-xs" aria-pressed={state.view === "limited"} onClick={() => chooseView("limited")}>
      {t("calendarLimited")} <span className={styles.viewCount}>({count(limited)})</span>
    </Button>}
    {unplaced.length > 0 && <Button variant="ghost" className="min-h-11 rounded-lg px-2 text-xs" aria-pressed={state.view === "undated"} onClick={() => chooseView("undated")}>
      {t("calendarUnplaced")} <span className={styles.viewCount}>({unplaced.length})</span>
    </Button>}
  </div>;
}
