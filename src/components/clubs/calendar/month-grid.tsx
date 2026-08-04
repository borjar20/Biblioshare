"use client";

import { useTranslations } from "next-intl";
import {
  monthGrid,
  marksByDate,
  type CalendarMark,
} from "@/lib/clubs/activities/calendar-marks";
import { BellIcon } from "@/components/ui/icons";
import { MARK_ACCENT } from "./mark-accent";

const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];
const DIAS_LARGOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Tope de chips por celda. Sin esto, un día con cinco hitos rompe la altura de
// la fila y descuadra la semana entera.
const MAX_CHIPS = 3;

export function MonthGrid({
  month,
  marks,
  today,
}: {
  month: string;
  marks: CalendarMark[];
  today: string;
}) {
  const t = useTranslations("activity");
  const cells = monthGrid(month);
  const byDate = marksByDate(marks);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border bg-surface-muted">
        {DIAS_CORTOS.map((corto, i) => (
          <div
            key={corto}
            className="py-2 text-center font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase"
          >
            <span className="lg:hidden">{corto}</span>
            <span className="hidden lg:inline">{DIAS_LARGOS[i]}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const delDia = byDate.get(cell.date) ?? [];
          const esHoy = cell.date === today;
          const visibles = delDia.slice(0, MAX_CHIPS);
          return (
            <div
              key={cell.date}
              className={`flex aspect-square min-w-0 flex-col gap-1 border-r border-b border-border p-1.5 last:border-r-0 lg:aspect-auto lg:min-h-[112px] lg:p-2 ${
                cell.outside ? "bg-surface-muted/50" : ""
              }`}
            >
              <span
                className={`self-start rounded-md px-1.5 py-0.5 text-xs leading-none font-semibold ${
                  esHoy
                    ? "bg-accent text-accent-foreground"
                    : cell.outside
                      ? "text-foreground-faint"
                      : "text-foreground"
                }`}
              >
                {cell.day}
                {esHoy && <span className="sr-only"> ({t("calendarToday")})</span>}
              </span>

              {/* Móvil: puntos. Escritorio: chips con el texto. */}
              {visibles.length > 0 && (
                <div className="flex flex-wrap items-center gap-0.5 lg:hidden">
                  {visibles.map((mark, i) => (
                    <span
                      key={`${mark.activityId}-${mark.markKind}-${i}`}
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full ${MARK_ACCENT[mark.markKind].bar} ${
                        mark.followedByViewer ? "ring-1 ring-accent ring-offset-1" : ""
                      }`}
                    />
                  ))}
                  {/* En móvil no caben chips, así que la campana del día va una
                      sola vez: con puntos de 6 px, un anillo solo no basta. */}
                  {visibles.some((m) => m.followedByViewer) && (
                    <BellIcon className="h-2 w-2 shrink-0 text-accent" aria-hidden />
                  )}
                  {delDia.length > MAX_CHIPS && (
                    <span className="font-mono text-[8px] leading-none text-muted-foreground">
                      {t("calendarMore", { count: delDia.length - MAX_CHIPS })}
                    </span>
                  )}
                </div>
              )}

              <div className="hidden min-w-0 flex-col gap-0.5 lg:flex">
                {visibles.map((mark, i) => {
                  const accent = MARK_ACCENT[mark.markKind];
                  return (
                    <span
                      key={`${mark.activityId}-${mark.markKind}-${i}`}
                      title={`${t(`markKind_${mark.markKind}`)} · ${mark.title}`}
                      className={`flex items-center gap-1 truncate rounded-chip border-l-[3px] px-1.5 py-0.5 text-[11px] leading-tight ${accent.bgSoft} ${accent.text} ${
                        mark.past ? "opacity-50" : ""
                      }`}
                    >
                      {/* La campana es FORMA, no color: en escala de grises el día
                          seguido sigue distinguiéndose del que no (§17). */}
                      {mark.followedByViewer && (
                        <BellIcon className="h-2.5 w-2.5 shrink-0 text-accent" aria-hidden />
                      )}
                      <span className="truncate">{mark.title}</span>
                      {mark.followedByViewer && (
                        <span className="sr-only">{t("eventFollowedBadge")}</span>
                      )}
                    </span>
                  );
                })}
                {delDia.length > MAX_CHIPS && (
                  <span className="px-1.5 font-mono text-[9.5px] text-muted-foreground">
                    {t("calendarMore", { count: delDia.length - MAX_CHIPS })}
                  </span>
                )}
              </div>

              {/* Lectores de pantalla: el recuento del día, que los puntos
                  truncados no transmiten. Solo en móvil: en escritorio los
                  chips ya llevan el texto y esto duplicaría el anuncio. */}
              {delDia.length > 0 && (
                <span className="sr-only lg:hidden">
                  {delDia
                    .map(
                      (m) =>
                        `${t(`markKind_${m.markKind}`)}: ${m.title}${
                          m.followedByViewer ? `. ${t("eventFollowedBadge")}` : ""
                        }`,
                    )
                    .join(". ")}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
