import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { TodayPass } from "@/lib/stats/get-today-focus";
import type { DayActivity } from "@/lib/stats/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { getProgress } from "@/lib/library/progress";
import { itemHref } from "@/lib/catalog/item-href";
import { TodayActions } from "./today-actions";

// La tarjeta destacada del frame G: el ítem sobre el que más vas a actuar hoy,
// con todo lo que necesitas para decidir en un vistazo — dónde vas, cuánto te
// falta de la meta y qué racha te juegas.
//
// El filo de color de la izquierda (.today::before) y las barras van con la var
// cruda --type-*, no con --color-type-*: `@theme inline` no las emite.
export async function TodayCard({
  pass,
  weekly,
  dailyGoalMinutes,
  nextEpisode,
}: {
  pass: TodayPass;
  /** Solo para la meta de HOY, que es tuya y no de la obra: minutos de lectura
   *  del día, de todos los libros juntos. La racha y los puntos de la semana
   *  salen del propio pase. */
  weekly: DayActivity[];
  dailyGoalMinutes: number | null;
  /** Solo series: el primer episodio sin ver. null = serie al día o sin datos. */
  nextEpisode: { season: number; episode: number } | null;
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

          {/* Racha y semana DE ESTE PASE: en una tarjeta que habla de un título
              concreto, "Racha 6 d" solo puede querer decir seis días seguidos
              con ESE título. La global sigue en el rail y en Perfil › Panel,
              donde sí habla de ti. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {pass.streakDays > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/16 px-2.5 py-[3px] font-mono text-[10px] font-medium text-gold-ink">
                <span aria-hidden className="text-gold">
                  ◆
                </span>
                {t("streak", { count: pass.streakDays })}
              </span>
            )}
            <WeekDots days={pass.week} />
          </div>
        </div>
      </div>

      <TodayActions
        passId={item.activePassId}
        itemType={item.itemType}
        seriesId={item.itemId}
        nextEpisode={nextEpisode}
        sessionHref={sessionHref}
        logHref={`${itemHref(item.itemType, item.itemId)}?tab=log`}
        labels={{
          session: t("session"),
          log: t("log"),
          cancel: t("timerCancel"),
          register: t("timerRegister"),
          timerLabel: t("timerLabel"),
          nextEpisode: nextEpisode
            ? t("markEpisode", { season: nextEpisode.season, episode: nextEpisode.episode })
            : null,
        }}
      />
    </article>
  );
}

// Los 7 días como cuadraditos: hoy va en hueco con borde, los días que tocaste
// ESTE título, rellenos. No es la barra del rail en miniatura: aquella son tus
// minutos de lectura de todo junto; esta, tu constancia con esta obra.
function WeekDots({ days }: { days: { date: string; active: boolean }[] }) {
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
