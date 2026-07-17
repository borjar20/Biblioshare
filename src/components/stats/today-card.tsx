import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { TodayPass } from "@/lib/stats/get-today-focus";
import type { DayActivity, Streaks } from "@/lib/stats/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { getProgress } from "@/lib/library/progress";
import { itemHref } from "@/lib/catalog/item-href";
import { ClockIcon, PencilIcon } from "@/components/ui/icons";

// La tarjeta destacada del frame G: el ítem sobre el que más vas a actuar hoy,
// con todo lo que necesitas para decidir en un vistazo — dónde vas, cuánto te
// falta de la meta y qué racha te juegas.
//
// El filo de color de la izquierda (.today::before) y las barras van con la var
// cruda --type-*, no con --color-type-*: `@theme inline` no las emite.
export async function TodayCard({
  pass,
  weekly,
  streaks,
  dailyGoalMinutes,
}: {
  pass: TodayPass;
  weekly: DayActivity[];
  streaks: Streaks;
  dailyGoalMinutes: number | null;
}) {
  const t = await getTranslations("today");
  const tPasses = await getTranslations("passes");
  // El singular de la ficha ("Libro"), no el plural de los filtros ("Libros"):
  // aquí se habla de UNA obra.
  const tMedia = await getTranslations("detail.mediaLabel");

  const { item } = pass;
  const accent = MEDIA_ACCENT[item.itemType];
  const progress = getProgress(item);
  const percent = progress
    ? Math.min(100, Math.round((progress.current / progress.total) * 100))
    : null;

  const todayMinutes = weekly[weekly.length - 1]?.minutes ?? 0;
  const goalPercent = dailyGoalMinutes
    ? Math.min(100, Math.round((todayMinutes / dailyGoalMinutes) * 100))
    : 0;

  // Las películas no tienen sesiones, así que tampoco "⏱ Sesión": su registro
  // es la ficha. Mismo criterio que NowConsuming.
  const sessionHref =
    item.itemType !== "movie" && item.activePassId ? `/sesion/${item.activePassId}` : null;

  return (
    <article
      className="relative overflow-hidden rounded-[14px] border border-border bg-surface shadow-card"
      style={{ ["--acc" as string]: `var(${accent.varName})` }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 z-1 w-1 bg-[var(--acc)]" />

      <div className="flex gap-3.5 p-3.5">
        <Link
          href={itemHref(item.itemType, item.itemId)}
          className="relative h-[87px] w-[58px] shrink-0 overflow-hidden rounded-md bg-surface-muted shadow-cover"
        >
          {item.coverUrl && (
            <Image src={item.coverUrl} alt={item.title} fill sizes="58px" className="object-cover" />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-[var(--acc)]">
            {`${tMedia(item.itemType)} · ${tPasses(`nth.${item.itemType}`, { n: Math.max(1, item.rereadCount) })}`}
          </p>
          <Link
            href={itemHref(item.itemType, item.itemId)}
            className="mt-[3px] block font-serif text-base leading-tight font-semibold text-foreground hover:underline"
          >
            {item.title}
          </Link>

          <p className="font-mono text-[10.5px] text-muted-foreground">
            {[
              pass.dayNumber != null ? t("day", { n: pass.dayNumber }) : null,
              pass.startedOn ? t("since", { date: shortDate(pass.startedOn) }) : null,
              pass.noteCount > 0 ? t("notes", { count: pass.noteCount }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {progress && percent != null && (
            <div className="mt-2">
              <div className="h-[5px] overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-[var(--acc)]"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span>{progressLabel(item.itemType, progress, t)}</span>
                <span>{`${percent}%`}</span>
              </div>
            </div>
          )}

          {dailyGoalMinutes ? (
            <div className="mt-[9px] flex items-center gap-2">
              <span className="font-mono text-[9px] tracking-[0.05em] whitespace-nowrap uppercase text-muted-foreground">
                {t("goalToday")}
              </span>
              <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-gold" style={{ width: `${goalPercent}%` }} />
              </div>
              <span className="font-mono text-[10px] font-medium text-gold-ink">
                {t("goalMinutes", { done: todayMinutes, goal: dailyGoalMinutes })}
              </span>
            </div>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {streaks.current > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/16 px-2.5 py-[3px] font-mono text-[10px] font-medium text-gold-ink">
                <span aria-hidden className="text-gold">
                  ◆
                </span>
                {t("streak", { count: streaks.current })}
              </span>
            )}
            <WeekDots days={weekly} />
          </div>
        </div>
      </div>

      <div className="flex border-t border-border">
        {sessionHref && (
          <Link
            href={sessionHref}
            className="flex flex-1 items-center justify-center gap-[7px] p-[11px] text-[12.5px] font-semibold text-[var(--acc)] transition-colors hover:bg-surface-muted"
          >
            <ClockIcon className="h-4 w-4" />
            {t("session")}
          </Link>
        )}
        <Link
          href={`${itemHref(item.itemType, item.itemId)}?tab=log`}
          className={`flex flex-1 items-center justify-center gap-[7px] p-[11px] text-[12.5px] font-semibold transition-colors hover:bg-surface-muted ${
            sessionHref
              ? "border-l border-border text-muted-foreground"
              : "text-[var(--acc)]"
          }`}
        >
          <PencilIcon className="h-4 w-4" />
          {t("log")}
        </Link>
      </div>
    </article>
  );
}

// Los 7 días de la semana como cuadraditos: hoy va en hueco con borde, los días
// con actividad rellenos. Es el mismo dato que la barra del rail, en miniatura.
function WeekDots({ days }: { days: DayActivity[] }) {
  const todayIndex = days.length - 1;
  return (
    <span aria-hidden className="ml-auto flex gap-[3px]">
      {days.map((day, i) => (
        <i
          key={day.date}
          className={`h-[9px] w-[9px] rounded-[2px] ${
            i === todayIndex
              ? "border-[1.5px] border-[var(--acc)] bg-transparent"
              : day.active
                ? "bg-[var(--acc)]"
                : "bg-surface-3"
          }`}
        />
      ))}
    </span>
  );
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
}

function progressLabel(
  itemType: string,
  progress: { current: number; total: number },
  t: Awaited<ReturnType<typeof getTranslations<"today">>>,
): string {
  return itemType === "book"
    ? t("page", { current: progress.current, total: progress.total })
    : t("episode", { current: progress.current, total: progress.total });
}
