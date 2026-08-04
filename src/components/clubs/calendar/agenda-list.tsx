"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";
import { formatDayMonth, formatEventDate } from "@/lib/clubs/activities/format-date";
import { BellIcon } from "@/components/ui/icons";
import { MARK_ACCENT } from "./mark-accent";
import { AgendaFollowToggle } from "./agenda-follow-toggle";

export function AgendaList({
  marks,
  /** Copy del vacío: cambia según el filtro activo (todo vs. solo los seguidos). */
  emptyMessage,
  viewerIsMember = false,
}: {
  marks: CalendarMark[];
  emptyMessage?: string;
  viewerIsMember?: boolean;
}) {
  const t = useTranslations("activity");

  if (marks.length === 0) {
    return (
      <p className="rounded-card border border-border bg-surface p-4 text-sm text-muted-foreground">
        {emptyMessage ?? t("calendarEmptyMonth")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {marks.map((mark, i) => {
        const { day, month } = formatDayMonth(mark.date);
        const accent = MARK_ACCENT[mark.markKind];
        const esEvento = mark.markKind === "evento";

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
                {/* La marca de seguido lleva icono Y texto accesible: no depende del
                    color, así que sobrevive a la escala de grises y a un lector de
                    pantalla (§17). */}
                {mark.followedByViewer && (
                  <>
                    <BellIcon className="h-2.5 w-2.5 text-accent" aria-hidden />
                    <span className="sr-only">{t("eventFollowedBadge")}</span>
                  </>
                )}
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

        const clases = `flex min-w-0 flex-1 items-start gap-3 px-3 py-3 ${
          mark.past ? "opacity-50" : ""
        }`;

        // Un HITO sigue sin enlace: no tiene ficha propia. Un evento y una
        // actividad sí. Se comprueba `href`, nunca el kind.
        return (
          <li
            key={`${mark.activityId}-${mark.markKind}-${i}`}
            className="flex items-stretch overflow-hidden rounded-card border border-border bg-surface"
          >
            {mark.href ? (
              <Link href={mark.href} className={`${clases} hover:bg-surface-muted`}>
                {inner}
              </Link>
            ) : (
              <div className={clases}>{inner}</div>
            )}

            {/* El control de seguir es HERMANO del enlace, nunca dentro: un
                <button> dentro de un <a> es HTML inválido y rompe el tabulador.
                Y así pulsarlo no navega a ningún sitio. */}
            {esEvento && viewerIsMember && !mark.past && (
              <AgendaFollowToggle
                activityId={mark.activityId}
                title={mark.title}
                following={mark.followedByViewer}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
