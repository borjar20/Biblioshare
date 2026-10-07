"use client";

import { useRef, useState, type ComponentProps, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { shiftMonth } from "@/lib/stats/dates";
import { addDays, formatReleaseDate } from "@/lib/releases/precision";
import { isReleaseMonth, releaseCalendarState, releaseCalendarPath, releaseCalendarMonths, releaseCalendarMarks, releaseMonthAgenda, releaseUnplacedWorks, releaseMonthCells, type ReleaseCalendarState, type ReleaseCalendarView } from "@/lib/releases/calendar";
import type { ReleaseWork } from "@/lib/releases/presentation";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import type { ReleaseItemType } from "@/lib/releases/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { BookIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon, FilmIcon, SeriesIcon } from "@/components/ui/icons";
import { ReleaseWorkCard } from "./release-work-card";
import type { ReleaseUserState } from "./release-view";
import styles from "./release-calendar.module.css";

export type ReleaseCalendarAgendaProps = {
  main: ReleaseWork[]; limited: ReleaseWork[]; today: string; authenticated?: boolean;
  userState?: ReleaseUserState; stateAvailable?: boolean; fallbackMonth?: string; focusedWorkKey?: string;
};
const TYPE_ICON = { book: BookIcon, movie: FilmIcon, series: SeriesIcon };
const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
function monthLabel(month: string) {
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month + "-15T12:00:00Z"));
}

export function ReleaseCalendarAgenda({ main, limited, today, authenticated = false, userState = {}, stateAvailable = true, fallbackMonth, focusedWorkKey }: ReleaseCalendarAgendaProps) {
  const t = useTranslations("releases");
  const params = useSearchParams();
  const search = params.toString();
  const state = releaseCalendarState(search, today, fallbackMonth);
  const grid = useRef<HTMLDivElement>(null);
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const tabDay = focusedDay?.startsWith(state.month + "-") ? focusedDay : state.day ?? (today.startsWith(state.month + "-") ? today : state.month + "-01");
  const mainMonth = releaseMonthAgenda(main, state.month, today);
  const limitedMonth = releaseMonthAgenda(limited, state.month, today);
  const count = (agenda: typeof mainMonth) => agenda.groups.reduce((sum, group) => sum + group.works.length, 0) + agenda.partial.length;
  const unplaced = releaseUnplacedWorks([...main, ...limited]);
  const marks = releaseCalendarMarks(main, limited, state.month);
  const byDate = new Map(marks.map((mark) => [mark.date, mark]));
  const months = [...new Set([...releaseCalendarMonths([...main, ...limited]), state.month, today.slice(0, 7)])].sort();
  const scopedAgenda = releaseMonthAgenda(state.view === "limited" ? limited : main, state.month, today, state.day);
  const agenda = { groups: scopedAgenda.groups.map((group) => ({ ...group, works: group.works.filter((work) => work.workKey !== focusedWorkKey) })).filter((group) => group.works.length > 0),
    partial: scopedAgenda.partial.filter((work) => work.workKey !== focusedWorkKey) };
  const visibleUnplaced = unplaced.filter((work) => work.workKey !== focusedWorkKey);
  const visibleCount = state.view === "undated" ? visibleUnplaced.length : count(agenda);
  const limitedKeys = new Set(limited.map((work) => work.workKey));
  const legendTypes = [...new Set(marks.flatMap((mark) => mark.types))];
  const cells = releaseMonthCells(state.month);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const returnPath = "/novedades" + (search ? "?" + search : "");
  const title = state.view === "undated" ? t("calendarUnplaced") : state.view === "limited" ? t("limitedTitle")
    : state.day ? formatReleaseDate({ date_precision: "day", date_value: state.day }) : monthLabel(state.month);
  const shownCount = state.view === "undated" ? unplaced.length : count(scopedAgenda);
  const card = (work: ReleaseWork, headingLevel: 3 | 4 = 4) => <ReleaseWorkCard key={work.workKey} releases={work.releases}
    headingLevel={headingLevel} limited={limitedKeys.has(work.workKey)} authenticated={authenticated}
    userState={userState} stateAvailable={stateAvailable} returnPath={returnPath} />;
  function navigate(change: Partial<ReleaseCalendarState>) {
    const href = releaseCalendarPath(search, change);
    if (href !== returnPath) window.history.pushState(null, "", href);
  }
  function selectDay(day: string) {
    const mark = byDate.get(day);
    // A marked day must reveal its works even if the previous view was global or limited.
    const view = state.view === "limited" && mark?.limited ? "limited" : mark?.main ? "main" : mark?.limited ? "limited" : state.view === "undated" ? "main" : state.view;
    navigate({ month: state.month, day: state.day === day ? null : day, view });
  }
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const delta = deltas[event.key];
    if (delta === undefined) return;
    const next = addDays(date, delta);
    const target = grid.current?.querySelector<HTMLButtonElement>('button[data-date="' + next + '"]');
    if (target) { event.preventDefault(); target.focus(); }
  }
  function chooseView(view: ReleaseCalendarView) { navigate({ month: state.month, day: view === "undated" ? null : state.day, view }); }
  return <div>
    <div className={styles.views} role="group" aria-label={t("calendarViews")}>
      <Button variant="secondary" className="min-h-11 px-3 text-xs" aria-pressed={state.view === "main"} onClick={() => chooseView("main")}>
        {t("calendarMain")} <span className="text-muted-foreground">({count(mainMonth)})</span>
      </Button>
      {limited.length > 0 && <Button variant="secondary" className="min-h-11 px-3 text-xs" aria-pressed={state.view === "limited"} onClick={() => chooseView("limited")}>
        {t("calendarLimited")} <span className="text-muted-foreground">({count(limitedMonth)})</span>
      </Button>}
      {unplaced.length > 0 && <Button variant="secondary" className="min-h-11 px-3 text-xs" aria-pressed={state.view === "undated"} onClick={() => chooseView("undated")}>
        {t("calendarUnplaced")} <span className="text-muted-foreground">({unplaced.length})</span>
      </Button>}
    </div>
    <div className={styles.layout}>
      <section aria-label={t("calendarTitle")} className={styles.sidebar}>
        <div className={styles.monthBar}>
          <Button variant="secondary" className="h-11 w-11 shrink-0 rounded-xl px-0 py-0" aria-label={t("calendarPrev")}
            disabled={!isReleaseMonth(shiftMonth(state.month, -1))} onClick={() => navigate({ month: shiftMonth(state.month, -1) })}>
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <h2 className={styles.monthTitle}>{monthLabel(state.month)}</h2>
          <Button variant="secondary" className="h-11 w-11 shrink-0 rounded-xl px-0 py-0" aria-label={t("calendarNext")}
            disabled={!isReleaseMonth(shiftMonth(state.month, 1))} onClick={() => navigate({ month: shiftMonth(state.month, 1) })}>
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
        <div ref={grid} role="grid" aria-label={t("calendarTitle") + ": " + monthLabel(state.month)}>
          <div role="row" className={styles.grid}>{WEEKDAYS.map((weekday) => <div role="columnheader" key={weekday} aria-label={weekday} className={styles.weekday}>{weekday.slice(0, 3)}</div>)}</div>
          <div role="rowgroup" className={styles.grid}>{weeks.map((week) => <div key={week[0].date} role="row" className={styles.week}>{week.map((cell) => {
            const mark = byDate.get(cell.date);
            const date = formatReleaseDate({ date_precision: "day", date_value: cell.date });
            const label = t("calendarDay", { date, count: (mark?.main ?? 0) + (mark?.limited ?? 0), limited: mark?.limited ?? 0 }) +
              (mark?.cancelled ? ". " + t("calendarCancelled", { count: mark.cancelled }) : "");
            return <div key={cell.date} role="gridcell" className={styles.cell}>
              {cell.outside ? <span className={styles.outside} aria-hidden>{Number(cell.date.slice(8))}</span>
                : <button type="button" data-date={cell.date} aria-label={label} aria-pressed={state.day === cell.date}
                  aria-current={cell.date === today ? "date" : undefined} className={styles.day}
                  tabIndex={cell.date === tabDay ? 0 : -1} onFocus={() => setFocusedDay(cell.date)}
                  onKeyDown={(event) => moveFocus(event, cell.date)} onClick={() => selectDay(cell.date)}>
                  <span className={cell.date === today ? styles.today : undefined}>{Number(cell.date.slice(8))}</span>
                  <span className={styles.marks} aria-hidden>{mark && <>
                    {mark.types.map((type: ReleaseItemType) => { const Icon = TYPE_ICON[type]; return <Icon key={type} className={MEDIA_ACCENT[type].text} />; })}
                    {mark.main || ""}{mark.limited > 0 && <span>{mark.main > 0 ? "+" : ""}{mark.limited}?</span>}
                  </>}</span>
                </button>}
            </div>;
          })}</div>)}</div>
        </div>
        {legendTypes.length > 0 && <div className={styles.legend}>
          {legendTypes.map((type) => { const Icon = TYPE_ICON[type]; return <span key={type}><Icon className={MEDIA_ACCENT[type].text} aria-hidden />{t("types." + type)}</span>; })}
          {marks.some((mark) => mark.limited > 0) && <span>? {t("calendarLimitedMark")}</span>}
        </div>}
        <div className={styles.periodControls}>
          <Button variant="ghost" className="min-h-11 px-1 text-xs underline underline-offset-4" onClick={() => navigate({ month: today.slice(0, 7), day: null })}>{t("calendarCurrent")}</Button>
          <Button variant="ghost" className="min-h-11 px-1 text-xs underline underline-offset-4" onClick={() => navigate({ month: state.month, day: null })}>{t("calendarWhole")}</Button>
        </div>
        <label className={styles.jump}>{t("calendarMonth")}
          <Select value={state.month} onChange={(event) => navigate({ month: event.target.value })} className="min-h-11 w-full">
            {months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
          </Select>
        </label>
      </section>
      <section aria-labelledby="novedades-agenda" className={styles.agenda}>
        <div className={styles.agendaHeader}>
          <h2 id="novedades-agenda" className={styles.agendaTitle}>{title}</h2>
          <p role="status" className="text-xs text-muted-foreground">{t("calendarCount", { count: shownCount })}</p>
        </div>
        {state.view === "limited" && <p className="mb-4 text-sm text-muted-foreground">{t("limitedHint")}</p>}
        {state.view === "undated" ? <>
          <p className="mb-4 text-sm text-muted-foreground">{t("calendarUnplacedHint")}</p>
          {visibleUnplaced.length ? <div className={styles.cards}>{visibleUnplaced.map((work) => card(work, 3))}</div> : shownCount > 0 ? <p className="text-sm text-muted-foreground">{t("calendarFocusedOnly")}</p> : <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("calendarEmptyUnplaced")} />}
        </> : shownCount > 0 && visibleCount === 0 ? <p className="text-sm text-muted-foreground">{t("calendarFocusedOnly")}</p> : shownCount === 0 ? <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />}
          title={t(state.day ? "calendarEmptyDay" : "calendarEmptyMonth")} message={t("calendarEmptyBody")} /> : <>
          {agenda.groups.length > 0 && <section aria-labelledby="novedades-exactas">
            <h3 id="novedades-exactas" className="mb-4 font-serif text-xl font-semibold">{t("exact")}</h3>
            <div className={styles.groups}>{agenda.groups.map((day) => <section key={day.date} aria-labelledby={"dia-" + day.date} className={styles.group}>
              <h3 id={"dia-" + day.date} className={styles.stamp}>
                <span className="text-sm text-muted-foreground">{new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: "UTC" }).format(new Date(day.date + "T12:00:00Z"))}</span>
                <time dateTime={day.date} aria-label={formatReleaseDate({ date_precision: "day", date_value: day.date })}>
                  <span className="text-4xl leading-none tracking-tight">{Number(day.date.slice(8))}</span>
                  <span className="font-sans text-xs text-muted-foreground">{monthLabel(day.date.slice(0, 7))}</span>
                </time>
              </h3>
              <div className={styles.cards}>{day.works.map((work) => card(work))}</div>
            </section>)}</div>
          </section>}
          {agenda.partial.length > 0 && <section aria-labelledby="novedades-anuncios">
            <h3 id="novedades-anuncios" className="font-serif text-xl font-semibold">{t("announcements")}</h3>
            <p className="mb-4 mt-2 text-sm text-muted-foreground">{t("announcementsNote")}</p>
            <div className={styles.cards}>{agenda.partial.map((work) => card(work))}</div>
          </section>}
        </>}
      </section>
    </div>
  </div>;
}

/** The focused announcement shares the live URL context with calendar navigation. */
export function ReleaseFocusedWorkCard(props: Omit<ComponentProps<typeof ReleaseWorkCard>, "returnPath">) {
  const search = useSearchParams().toString();
  return <ReleaseWorkCard {...props} returnPath={"/novedades" + (search ? "?" + search : "")} />;
}
