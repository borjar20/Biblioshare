"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  groupMarksByDay,
  type CalendarMark,
} from "@/lib/clubs/activities/calendar-marks";
import { formatEventDate } from "@/lib/clubs/activities/format-date";
import { BellIcon } from "@/components/ui/icons";
import { MARK_ACCENT, accentKeyFor } from "./mark-accent";
import { markLabel } from "./mark-label";
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
    <div className="flex flex-col gap-4">
      {groupMarksByDay(marks).map((grupo) => (
        <section key={grupo.date} className="flex flex-col gap-2">
          {/* El día se escribe UNA vez por grupo. Antes cada tarjeta repetía su
              fecha: un mes de veinte eventos eran veinte bloques de fecha, y es
              lo que de verdad alargaba el scroll. */}
          <h3 className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            {formatEventDate(grupo.date)}
          </h3>

          {/* Dos columnas en móvil, tres desde tablet, y de vuelta a UNA desde
              `lg`. Lo último no es un capricho: ahí la agenda vive en el raíl de
              340 px de club-calendar.tsx, donde dos columnas dejan ~166 px por
              tarjeta y el chip de clase («LANZAMIENTO · PELÍCULA») ya no cabe.
              Las columnas resuelven el scroll de MÓVIL, que es donde la pantalla
              es alta y estrecha; en el raíl el problema nunca existió.
              A 390 px cada tarjeta tiene ~185 px: el título se trunca antes que
              el chip, que es lo que identifica la marca. */}
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-1">
            {grupo.marks.map((mark, i) => {
              const accent = MARK_ACCENT[accentKeyFor(mark)];
              const esEvento = mark.markKind === "evento";
              // Se calcula UNA vez y se usa en los dos sitios que dependen de
              // ello (la campana del chip y el control de la derecha). Repetir
              // la condición dejaría dos versiones de la misma regla.
              const hayToggle = esEvento && viewerIsMember && !mark.past;

              const inner = (
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    // `max-w-full` + un texto que puede encoger: `w-fit` es
                    // `fit-content`, y fit-content NUNCA baja de su min-content,
                    // así que sin esto el chip desbordaba la tarjeta y se metía
                    // debajo del separador del botón de campana (reportado a 390
                    // px con la agenda a dos columnas).
                    className={`mb-1.5 inline-flex w-fit max-w-full items-center gap-1.5 rounded-chip px-2 py-0.5 font-mono text-[9px] tracking-wide uppercase ${accent.bgSoft} ${accent.text}`}
                  >
                    {/* El GLIFO de la clase, no el cuadrito de color que había
                        antes. Es el mismo cambio que la celda del mes: la
                        silueta identifica sin depender del tono, y así el chip
                        de la agenda, el de la rejilla y la muestra de la leyenda
                        enseñan las tres LA MISMA forma para la misma clase —
                        que es lo que permite emparejarlas de un vistazo (#147).
                        Aplica en todos los anchos, escritorio incluido. */}
                    <accent.Icon className="h-2.5 w-2.5 shrink-0" aria-hidden />
                    {/* `min-w-0` para que el texto pueda encoger por debajo de
                        su min-content («LANZAMIENTO» son ~62 px de los ~102 que
                        deja la tarjeta): es lo que permite que `max-w-full` de
                        arriba se cumpla de verdad en vez de desbordar. */}
                    <span className="min-w-0 break-words">{markLabel(mark, t)}</span>
                    {/* La marca de seguido lleva icono Y texto accesible: no
                        depende del color, así que sobrevive a la escala de
                        grises y a un lector de pantalla (§17). El ICONO se
                        omite cuando la fila ya trae el control de campana a la
                        derecha: ahí es redundante y son los 16 px que hacían
                        que el chip no cupiese. El texto accesible se queda
                        siempre -- no ocupa ancho (va absolute). */}
                    {mark.followedByViewer && (
                      <>
                        {!hayToggle && (
                          <BellIcon className="h-2.5 w-2.5 shrink-0 text-accent" aria-hidden />
                        )}
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
              );

              const clases = `flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 ${
                mark.past ? "opacity-50" : ""
              }`;

              // Un HITO sigue sin enlace: no tiene ficha propia. Se comprueba
              // `href`, nunca el kind.
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

                  {/* El control de seguir es HERMANO del enlace, nunca dentro:
                      un <button> dentro de un <a> es HTML inválido y rompe el
                      tabulador. Y así pulsarlo no navega a ningún sitio. */}
                  {hayToggle && (
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
        </section>
      ))}
    </div>
  );
}
